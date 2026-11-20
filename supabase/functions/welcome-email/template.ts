// The welcome email: subject, HTML and plain text.
//
// Email clients ignore <style> blocks and external CSS, so every style is
// inline and the layout is tables, matching supabase/email-templates/.

const SITE = "https://designwallet.in";
const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const POINTS: [string, string][] = [
    ["430+ hand-picked tools", "Search by job, compare, and heart the ones you love to find them later."],
    ["Real designer salaries", "See what designers in India earn, by role and level."],
    ["Free mini tools", "Background remover, brand kit generator, colour converter and more."],
    ["Design Wallet in your AI", "Connect Claude or ChatGPT and ask for the right tool, in Design Wallet."],
];

export const SUBJECT = "Welcome to Design Wallet";

export function welcomeHtml(firstName: string): string {
    const hi = firstName ? `Welcome in, ${escapeHtml(firstName)}.` : "Welcome in.";
    const rows = POINTS.map(([title, body]) => `
            <tr>
              <td style="padding:0 0 18px;">
                <p style="margin:0 0 4px; font-size:15px; line-height:1.4; font-weight:600; color:#f5f5f5;">${title}</p>
                <p style="margin:0; font-size:14px; line-height:1.6; color:#9a9a9a;">${body}</p>
              </td>
            </tr>`).join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${SUBJECT}</title>
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
            <p style="margin:0 0 12px; font-size:26px; line-height:1.25; font-weight:400; letter-spacing:-0.02em; color:#f5f5f5;">${hi}</p>
            <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:#9a9a9a;">
              Your Design Wallet account is ready. Here's what's waiting for you:
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT};">${rows}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
              <tr>
                <td style="border-radius:999px; background:#ffffff;">
                  <a href="${SITE}/tools/" style="display:inline-block; padding:15px 32px; font-family:${FONT}; font-size:12px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#050505; text-decoration:none; border-radius:999px;">Open Design Wallet</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 4px 0; font-family:${FONT}; font-size:12px; line-height:1.6; color:#686868;">
            You're getting this once, because you just created a Design Wallet account.
            You can change your details or delete your account any time from <a href="${SITE}/welcome/?edit=1" style="color:#9a9a9a;">Profile &amp; preferences</a>.<br>
            Design Wallet · All-in-one design library for curious designers · <a href="${SITE}" style="color:#9a9a9a;">designwallet.in</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function welcomeText(firstName: string): string {
    const points = POINTS.map(([t, b]) => `- ${t}: ${b}`).join("\n");
    return `${firstName ? `Welcome in, ${firstName}.` : "Welcome in."}

Your Design Wallet account is ready. Here's what's waiting for you:

${points}

Open Design Wallet: ${SITE}/tools/

You're getting this once, because you just created a Design Wallet account.
Change your details or delete your account any time: ${SITE}/welcome/?edit=1
`;
}
