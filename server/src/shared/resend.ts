// Real implementation of OTP email delivery, via Resend
// (https://resend.com). Mirrors the football provider's pattern
// (API_FOOTBALL_KEY unset -> mock data): with RESEND_API_KEY unset, the
// code is logged to the console instead of emailed, so local/dev testing
// never needs a real Resend account.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Ticker <onboarding@resend.dev>";

// Colors copied 1:1 from app/src/theme/theme.ts's DARK_THEME, same as
// admin/adminPage.ts — kept as a standalone constant since email clients
// need inline styles (no shared stylesheet/import across this boundary).
// Table-based layout with everything inlined for compatibility across
// Gmail/Apple Mail/Outlook, which strip or ignore <style> blocks inconsistently.
function otpEmailHtml(code: string): string {
  return `<!doctype html>
<html>
<body style="margin:0; padding:0; background-color:#000000;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000; padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="420" cellpadding="0" cellspacing="0" style="max-width:420px; width:100%;">
          <tr>
            <td style="padding:0 24px 28px; text-align:center;">
              <span style="font-family:Georgia,'Times New Roman',serif; font-size:26px; color:#F5F6F5; letter-spacing:-0.3px;">Ticker</span>
            </td>
          </tr>
          <tr>
            <td style="background-color:#151718; border:1px solid #2A2C2E; border-radius:16px; padding:32px 24px; text-align:center;">
              <p style="margin:0 0 8px; font-family:-apple-system,Helvetica,Arial,sans-serif; font-size:14px; color:#8E9296;">Your verification code</p>
              <p style="margin:0 0 20px; font-family:'SFMono-Regular',Menlo,Consolas,monospace; font-size:36px; font-weight:700; letter-spacing:8px; color:#00C805;">${code}</p>
              <p style="margin:0; font-family:-apple-system,Helvetica,Arial,sans-serif; font-size:13px; color:#8E9296;">This code expires in 10 minutes.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 0; text-align:center;">
              <p style="margin:0; font-family:-apple-system,Helvetica,Arial,sans-serif; font-size:12px; color:#54585B;">If you didn't request this, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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
      html: otpEmailHtml(code),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend request failed: ${res.status} ${body}`);
  }
}
