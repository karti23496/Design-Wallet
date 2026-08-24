// complete-account-setup (FR-9, FR-10)
// Validates the single-use setup token, creates the auth user with the chosen
// password, activates the subscription (status=active, started_at=paid date,
// renews_at = paid date + 365 days), copies the Lemon Squeezy linkage onto the
// profile, and burns the token. Called by the login/setup screen.
// Deploy with --no-verify-jwt (no session exists yet).
import { handleOptions, json } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { token, email, password } = await req.json();
    if (!token || !email || !password || String(password).length < 8) {
      return json({ error: "invalid_input" }, 400);
    }
    const normalized = String(email).toLowerCase();

    // Validate token: must match, be unused, unexpired, and belong to this email.
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, email, status, token_expires_at, signup_complete, paid_at, ls_subscription_id, ls_customer_id, ls_customer_portal_url")
      .eq("setup_token", token)
      .maybeSingle();

    if (
      !payment ||
      payment.status !== "paid" ||
      payment.email.toLowerCase() !== normalized ||
      payment.signup_complete ||
      !payment.token_expires_at ||
      new Date(payment.token_expires_at).getTime() < Date.now()
    ) {
      return json({ error: "invalid_or_expired_token" }, 400);
    }

    // Activation dates: anchor to the original purchase date (FR-10).
    const startedAt = payment.paid_at ?? new Date().toISOString();
    const renewsAt = new Date(new Date(startedAt).getTime() + ONE_YEAR_MS).toISOString();

    const activation = {
      subscription_status: "active",
      subscription_started_at: startedAt,
      subscription_renews_at: renewsAt,
      suspended_reason: null,
      ls_subscription_id: payment.ls_subscription_id,
      ls_customer_id: payment.ls_customer_id,
      ls_customer_portal_url: payment.ls_customer_portal_url,
    };

    // Create the auth user (email pre-confirmed — payment proves ownership).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin
      .createUser({ email: normalized, password, email_confirm: true });

    let userId = created?.user?.id ?? null;
    if (createErr || !userId) {
      // User already exists → set their password instead of failing.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const found = list?.users?.find((u) => u.email?.toLowerCase() === normalized);
      if (!found) {
        console.error("[setup] create user failed:", createErr);
        return json({ error: "account_creation_failed" }, 500);
      }
      await supabaseAdmin.auth.admin.updateUserById(found.id, { password });
      userId = found.id;
    }

    // Activate the profile (row auto-created by the handle_new_user trigger).
    await supabaseAdmin.from("profiles").update(activation).eq("id", userId);

    // Burn the token + mark signup complete (single-use).
    await supabaseAdmin.from("payments")
      .update({ signup_complete: true, setup_token: null, token_expires_at: null })
      .eq("id", payment.id);

    return json({ ok: true });
  } catch (err) {
    console.error("[setup] failed:", err);
    return json({ error: "internal_error" }, 500);
  }
});
