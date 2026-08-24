// resend-setup-link (FR-18)
// Backs the "Already paid but can't log in?" self-serve recovery. If the email
// matches a paid-but-incomplete payment, issues a fresh token + emails it.
// Always returns a neutral response to avoid email enumeration.
import { handleOptions, json } from "../_shared/cors.ts";
import { supabaseAdmin, newSetupToken, tokenExpiry } from "../_shared/supabaseAdmin.ts";
import { sendSetupEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { email } = await req.json();
    const normalized = String(email ?? "").toLowerCase().trim();
    if (!normalized) return json({ ok: true }); // neutral

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("id, status, signup_complete")
      .ilike("email", normalized)
      .eq("status", "paid")
      .eq("signup_complete", false)
      .maybeSingle();

    if (payment) {
      const token = newSetupToken();
      await supabaseAdmin.from("payments")
        .update({ setup_token: token, token_expires_at: tokenExpiry() })
        .eq("id", payment.id);
      await sendSetupEmail(normalized, token);
    }

    return json({ ok: true }); // neutral regardless
  } catch (err) {
    console.error("[resend] failed:", err);
    return json({ ok: true });
  }
});
