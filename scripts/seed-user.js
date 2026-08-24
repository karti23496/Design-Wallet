/**
 * seed-user.js — create a REAL test subscriber directly in Supabase.
 *
 * Mirrors what the payment→setup flow does: creates the auth user (email +
 * password, pre-confirmed) and activates their profile. Use it to make test
 * logins once your Supabase project exists — no Lemon Squeezy payment needed.
 *
 * Requires:  npm i @supabase/supabase-js
 * Env:       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (service-role key is a
 *            SECRET — pass it via env only, never commit it or put it in config.js)
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/seed-user.js you@example.com yourpassword [active|suspended]
 */

const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [emailArg, password, status = "active"] = process.argv.slice(2);

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
if (!emailArg || !password) {
  console.error("Usage: node scripts/seed-user.js <email> <password> [active|suspended]");
  process.exit(1);
}
if (!["active", "suspended"].includes(status)) {
  console.error("Status must be 'active' or 'suspended'.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const email = emailArg.toLowerCase();
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

(async () => {
  // Create the auth user (or find + reset password if it already exists).
  let userId;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (created?.user) {
    userId = created.user.id;
  } else {
    const { data: list } = await supabase.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!found) { console.error("Create user failed:", error); process.exit(1); }
    userId = found.id;
    await supabase.auth.admin.updateUserById(userId, { password });
  }

  // Activate (or suspend) the profile. The row is auto-created by the
  // handle_new_user trigger when the auth user is created.
  const update = status === "suspended"
    ? { subscription_status: "suspended", suspended_reason: "payment_failed", subscription_renews_at: null }
    : {
        subscription_status: "active",
        suspended_reason: null,
        subscription_started_at: new Date().toISOString(),
        subscription_renews_at: new Date(Date.now() + ONE_YEAR_MS).toISOString(),
      };

  const { error: upErr } = await supabase.from("profiles").update(update).eq("id", userId);
  if (upErr) { console.error("Profile update failed:", upErr); process.exit(1); }

  console.log(`✓ ${email} is ready as '${status}'. Log in at /account/login/?login=1`);
})().catch((e) => { console.error(e); process.exit(1); });
