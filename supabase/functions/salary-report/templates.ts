// The two emails of the salary-report flow. Copy approved by Karthik, 2026-11-20
// (the report email is .claude/drafts/report-email.md).
//
//   1. the CODE email   - functional, from Design Wallet <no-reply@designwallet.in>
//   2. the REPORT email - a person writing, from hello@designwallet.in, PDF attached
//
// No em dashes anywhere in the copy.

const SITE = "https://designwallet.in";
const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The salary submit link carries UTM tags, so GA4 can show how many people add
// their own salary after getting the report (growth-plan rule: tag posted links).
export const SUBMIT_URL =
    SITE + "/salary/submit/?utm_source=report-email&utm_medium=email&utm_campaign=salary-report";

function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ── 1. The code ─────────────────────────────────────────────────────────

export function codeEmail(code: string): { subject: string; html: string; text: string } {
    // The code is in the subject so it shows in a phone notification.
    const subject = `Your Design Wallet code: ${code}`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#050505;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td style="padding:0 4px 28px;">
            <a href="${SITE}" style="text-decoration:none;">
              <img src="${SITE}/public/Logo/Website-logo.png" width="140" height="26" alt="Design Wallet" style="display:block; border:0; width:140px; height:auto;">
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px; background:#0a0a0a; border:1px solid #1f1f1f; border-radius:24px; font-family:${FONT}; color:#f5f5f5;">
            <p style="margin:0 0 8px; font-size:15px; line-height:1.6; color:#9a9a9a;">Your code is</p>
            <p style="margin:0 0 20px; font-size:38px; line-height:1.1; font-weight:500; letter-spacing:0.18em; color:#f5f5f5;">${esc(code)}</p>
            <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#9a9a9a;">
              It works for 10 minutes. Enter it in the window where you asked for the salary report.
            </p>
            <p style="margin:0; font-size:13px; line-height:1.6; color:#686868;">
              If you didn't ask for this, you can ignore this email and nothing will happen.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
    const text = `Your code is ${code}

It works for 10 minutes. Enter it in the window where you asked for the salary report.

If you didn't ask for this, you can ignore this email and nothing will happen.
`;
    return { subject, html, text };
}

// ── 2. The report ───────────────────────────────────────────────────────

export interface ReportEmailInput {
    role: string;
    level: string;
    location: string;
    newsletter: boolean;
    unsubscribeUrl: string;
}

export function reportEmail(i: ReportEmailInput): { subject: string; html: string; text: string } {
    const subject = `Your ${i.role} salary report is attached`;

    const footerText = i.newsletter
        ? `You're getting the Designer's Weekly Drop because you ticked the box when you asked for the report. Unsubscribe any time: ${i.unsubscribeUrl}`
        : "This was a one-off email with the report you asked for. We haven't added you to any list.";
    const footerHtml = i.newsletter
        ? `You're getting the Designer's Weekly Drop because you ticked the box when you asked for the report. <a href="${esc(i.unsubscribeUrl)}" style="color:#6b6b6b;">Unsubscribe any time</a>.`
        : "This was a one-off email with the report you asked for. We haven't added you to any list.";

    // A plain, person-to-person layout on purpose: no card, no logo, no button.
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:24px 16px; font-family:${FONT}; font-size:15px; line-height:1.65; color:#1a1a1a;">
<div style="max-width:560px;">
<p style="margin:0 0 16px;">Hey,</p>
<p style="margin:0 0 16px;">Thanks for asking for the report. This report contains the ${esc(i.role)}, ${esc(i.level)}, ${esc(i.location)}, exactly as you had asked for.</p>
<p style="margin:0 0 16px;">I do want to be upfront about one thing. The figures are research estimates for now, and they get sharper as more designers share their real numbers. If yours is different from what the report says, <a href="${esc(SUBMIT_URL)}" style="color:#1a1a1a;">adding it takes about two minutes</a> and stays anonymous.</p>
<p style="margin:0 0 24px;">If the report helps, or if something looks off, just reply to this email. I can help you out on this.</p>
<p style="margin:0 0 32px;">Karthik<br>Founder, Design Wallet</p>
<p style="margin:0; font-size:12px; line-height:1.6; color:#6b6b6b;">${footerHtml}</p>
</div>
</body>
</html>`;

    // Plain text cannot hide an address behind words, so the full link is shown here.
    const text = `Hey,

Thanks for asking for the report. This report contains the ${i.role}, ${i.level}, ${i.location}, exactly as you had asked for.

I do want to be upfront about one thing. The figures are research estimates for now, and they get sharper as more designers share their real numbers. If yours is different from what the report says, adding it takes about two minutes and stays anonymous: ${SUBMIT_URL}

If the report helps, or if something looks off, just reply to this email. I can help you out on this.

Karthik
Founder, Design Wallet

--
${footerText}
`;
    return { subject, html, text };
}
