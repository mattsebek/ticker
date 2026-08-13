// Sends via Expo's push API (https://exp.host/--/api/v2/push/send), which
// fans out to APNs/FCM itself — no separate Apple/Google credentials needed
// server-side, only the per-device Expo push token registered by the app.
// Plain fetch (native in Node 20, server/package.json already requires
// engines.node "20.x") — no SDK dependency needed for a single endpoint.

const PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100; // Expo's per-request limit

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error(`[push] Expo push API returned ${res.status}`);
      }
    } catch (err) {
      // A batch failing (e.g. a malformed/test token) must not stop the
      // remaining batches — best-effort delivery, same spirit as the
      // football provider's fetchOddsBestEffort().
      console.error("[push] failed to send a batch:", err);
    }
  }
}
