// Transactional email via Resend. Set RESEND_API_KEY + EMAIL_FROM in function env.
// (Swap for Postmark/SES by changing only this file.)
//
// Copy rule (PRD §9.4): this is an ANNUAL SUBSCRIPTION. Never use "lifetime",
// "forever", or "one-time fee". Use "annual subscription", "renews yearly",
// "billed annually".
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Design Wallet <hello@designwallet.in>";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://designwallet.in";
const CHECKOUT_URL = Deno.env.get("LS_CHECKOUT_URL") ??
  "https://designwallet.lemonsqueezy.com/checkout/buy/457851d2-1a3b-4b55-99f5-0850c4f74d49";

const wrap = (inner: string) =>
  `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;line-height:1.5">${inner}</div>`;
const btn = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;background:#000;color:#fff;padding:12px 22px;border-radius:24px;text-decoration:none;font-weight:600">${label}</a></p>`;

export function setupLink(token: string, email: string): string {
  const u = new URL(SITE_URL + "/account/login/");
  u.searchParams.set("token", token);
  u.searchParams.set("email", email);
  return u.toString();
}

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error("[email] send failed:", res.status, await res.text());
  }
}

// FR-8: immediate confirmation email with the account-setup link.
export function sendSetupEmail(to: string, token: string): Promise<void> {
  const link = setupLink(token, to);
  return send(
    to,
    "Your Design Wallet subscription — set your password",
    wrap(
      `<h2>Payment received 🎉</h2>
       <p>Thanks for subscribing to Design Wallet. Your annual subscription is active — one last step: set a password to open your collection.</p>
       ${btn(link, "Set your password")}
       <p style="color:#666;font-size:13px">This link expires in 60 minutes. If it expires, visit the login page and use “Already paid but can't log in?” to get a fresh one.</p>`,
    ),
  );
}

// FR-17: single 24h follow-up reminder if signup is still incomplete.
export function sendReminderEmail(to: string, token: string): Promise<void> {
  const link = setupLink(token, to);
  return send(
    to,
    "Finish setting up your Design Wallet subscription",
    wrap(
      `<h2>You're one step away</h2>
       <p>Your Design Wallet annual subscription is paid, but you haven't set your password yet. Finish setup to open your collection:</p>
       ${btn(link, "Finish setup")}
       <p style="color:#666;font-size:13px">Need help? Just reply to this email.</p>`,
    ),
  );
}

// FR-14: suspension email, tailored to the reason (PRD §9.3).
export function sendSuspensionEmail(
  to: string,
  reason: "payment_failed" | "cancelled_and_expired",
  portalUrl: string | null,
): Promise<void> {
  if (reason === "cancelled_and_expired") {
    return send(
      to,
      "Your Design Wallet subscription has ended",
      wrap(
        `<h2>Your subscription has ended</h2>
         <p>Your Design Wallet subscription has ended. Resubscribe anytime to get back in — it's a ₹2,999/year annual subscription that renews yearly and you can cancel whenever you like.</p>
         ${btn(CHECKOUT_URL, "Resubscribe")}
         <p style="color:#666;font-size:13px">Questions? Just reply to this email.</p>`,
      ),
    );
  }
  const resolve = portalUrl || CHECKOUT_URL;
  return send(
    to,
    "Action needed: your Design Wallet payment couldn't be processed",
    wrap(
      `<h2>We couldn't process your renewal</h2>
       <p>We couldn't process your renewal payment, and your Design Wallet account has been suspended. Update your payment details to restore access.</p>
       ${btn(resolve, "Update payment details")}
       <p style="color:#666;font-size:13px">Once payment goes through, your access is restored automatically. Questions? Just reply to this email.</p>`,
    ),
  );
}

// FR-15: renewal reminder, sent 7 days before the annual billing date.
export function sendRenewalReminderEmail(
  to: string,
  renewsAt: string,
  portalUrl: string | null,
): Promise<void> {
  const when = new Date(renewsAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
  const manage = portalUrl || `${SITE_URL}/account/`;
  return send(
    to,
    "Your Design Wallet subscription renews in 7 days",
    wrap(
      `<h2>Your annual renewal is coming up</h2>
       <p>Your Design Wallet subscription renews on <strong>${when}</strong>, when your card on file will be charged <strong>₹2,999</strong> for another year. No action is needed to continue.</p>
       <p>Want to update your card or cancel before then? Manage your subscription here:</p>
       ${btn(manage, "Manage subscription")}
       <p style="color:#666;font-size:13px">If you cancel, you keep access until ${when}.</p>`,
    ),
  );
}
