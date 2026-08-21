// Thin wrapper around Resend's HTTP API — a plain fetch() rather than the
// `resend` npm package, so this feature needs zero new dependencies (no
// npm install required beyond what's already installed). Resend's API is
// a single POST with a JSON body, so the SDK doesn't buy much here.
//
// Deliberately non-throwing: every caller in lib/notify.ts treats a failed
// or unconfigured email as a soft failure, not a reason to break the
// automated job or the in-app action it's attached to (an SLA alert or a
// PM ticket still gets created either way — the email is a bonus channel,
// not the source of truth).
const RESEND_API_URL = "https://api.resend.com/emails";

export type SendEmailResult = { ok: true } | { ok: false; message: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      ok: false,
      message:
        "Email not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL to enable it.",
    };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `Resend API error (${res.status}): ${body}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
