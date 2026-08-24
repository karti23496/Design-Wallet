// check-email-status (FR-17)
// Used only to improve the failed-login message: tells the login screen whether
// an email is a paid-but-signup-incomplete account so it can route the user into
// setup instead of showing a generic error. Returns a coarse status only.
import { handleOptions, json } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  try {
    const { email } = await req.json();
    const normalized = String(email ?? "").toLowerCase().trim();
    if (!normalized) return json({ status: "unknown" });

    // Paid but no completed signup?
    const { data: pending } = await supabaseAdmin
      .from("payments")
      .select("id")
      .ilike("email", normalized)
      .eq("status", "paid")
      .eq("signup_complete", false)
      .maybeSingle();

    if (pending) return json({ status: "paid_incomplete" });

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").ilike("email", normalized).maybeSingle();

    return json({ status: profile ? "has_account" : "none" });
  } catch (err) {
    console.error("[check-email-status] failed:", err);
    return json({ status: "unknown" });
  }
});
