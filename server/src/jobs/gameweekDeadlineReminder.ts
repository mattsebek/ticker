import { JobResult } from "./scheduler";
import { fantasyRepo } from "../fantasy/repo";
import { gameweekService } from "../fantasy/gameweekService";
import { pushRepo } from "../notifications/repo";
import { sendPushNotifications } from "../notifications/pushService";

const REMINDER_WINDOW_MS = 90 * 60_000; // fire once a round's deadline is within 90 minutes

/**
 * The one real push trigger this app sends today: a heads-up once the next
 * round's deadline is close, to whoever has notifications enabled. Reuses
 * the same "next round to lock" math the lock job itself uses
 * (maxScoredRound()+1 / deadlineForRound), rather than reinventing it.
 * Idempotent per round via sent_reminders — safe to run on a tight interval.
 */
export async function run(): Promise<JobResult> {
  const round = fantasyRepo.maxScoredRound() + 1;
  const kickoff = gameweekService.deadlineForRound(round);
  if (!kickoff) return { ok: true, detail: "no upcoming deadline published yet" };

  const msUntil = new Date(kickoff).getTime() - Date.now();
  if (msUntil <= 0) return { ok: true, detail: `round ${round} deadline already passed` };
  if (msUntil > REMINDER_WINDOW_MS) return { ok: true, detail: `round ${round} outside the reminder window` };
  if (pushRepo.reminderAlreadySent(round)) return { ok: true, detail: `round ${round} reminder already sent` };

  const tokens = pushRepo.getAllEnabledTokens();
  const minutesLeft = Math.max(1, Math.round(msUntil / 60_000));
  const messages = tokens.map((t) => ({
    to: t.token,
    title: "Gameweek deadline approaching",
    body: `Set your Starting Four before it locks in ${minutesLeft} minutes.`,
    data: { type: "gameweek-deadline", round },
  }));
  if (messages.length) await sendPushNotifications(messages);
  pushRepo.markReminderSent(round);

  return { ok: true, detail: `sent ${messages.length} reminder(s) for round ${round}` };
}
