import { usersRepo } from "./usersRepo";

/**
 * The single source of truth for "is this a synthetic account" — used to
 * weight/exclude synthetic activity from demand/Price Pressure calculations
 * (market/marketDemandService.ts, market/pricePressure.ts) and to gate the
 * Starting-Four auto-fill fallback (fantasy/gameweekService.ts).
 *
 * Previously backed by a hardcoded 7-entry BOT_ROSTER id list with no real
 * `users` row at all. Superseded by the synthetic user engine (see
 * synthetic/), where every synthetic account is a real `users` row with
 * account_type='synthetic' — this is now a thin, stable-signature wrapper
 * over that so every existing call site kept working unchanged.
 */
export function isBotId(userId: string): boolean {
  return usersRepo.isSynthetic(userId);
}
