// Real implementation of OTP email delivery, via Resend
// (https://resend.com). Mirrors the football provider's pattern
// (API_FOOTBALL_KEY unset -> mock data): with RESEND_API_KEY unset, the
// code is logged to the console instead of emailed, so local/dev testing
// never needs a real Resend account.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Ticker <onboarding@resend.dev>";

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[otp] RESEND_API_KEY not set — code for ${email}: ${code}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: `${code} is your Ticker verification code`,
      html: `<p>Your Ticker verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p>This code expires in 10 minutes.</p>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend request failed: ${res.status} ${body}`);
  }
}
