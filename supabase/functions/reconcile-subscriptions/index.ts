// reconcile-subscriptions (PRD §8 — daily reconciliation safety net)
// The zero-grace-period model has no tolerance for a missed or delayed webhook,
// so once a day we compare our local subscription_status against Lemon Squeezy's
// source of truth and correct drift in either direction:
//   - LS says the sub is dead (expired / cancelled-and-past-ends / unpaid)
//     but we still show active   → suspend
//   - LS says the sub is active but we show suspended → reactivate
// This is best-effort and idempotent; the webhook remains the primary path.
//
// Requires LEMONSQUEEZY_API_KEY (read scope). Deploy with --no-verify-jwt.
import { json } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendSuspensionEmail } from "../_shared/email.ts";

const LS_API_KEY = Deno.env.get("LEMONSQUEEZY_API_KEY") ?? "";
const LS_API = "https://api.lemonsqueezy.com/v1";

async function fetchSubscription(id: string): Promise<any | null> {
  try {
    const res = await fetch(`${LS_API}/subscriptions/${id}`, {
      headers: {
        "Authorization": `Bearer ${LS_API_KEY}`,
        "Accept": "application/vnd.api+json",
      },
    });
    if (!res.ok) {
      console.error("[reconcile] LS fetch failed", id, res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[reconcile] LS fetch error", id, err);
    return null;
  }
}

// LS statuses that mean "no access": expired, unpaid; plus cancelled once the
// ends_at date has passed. (past_due still has access until the retry window
// resolves — the webhook drives the actual failure.)
function lsGrantsAccess(attr: any): boolean {
  const status = attr?.status;
  if (status === "active" || status === "on_trial" || status === "paused") return true;
  if (status === "cancelled") {
    const ends = attr?.ends_at ? new Date(attr.ends_at).getTime() : 0;
    return ends > Date.now();
  }
  return false; // expired | unpaid | anything unexpected
}

Deno.serve(async () => {
  if (!LS_API_KEY) return json({ error: "LEMONSQUEEZY_API_KEY not set" }, 500);

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, subscription_status, subscription_renews_at, ls_subscription_id, ls_customer_portal_url")
    .not("ls_subscription_id", "is", null)
    .in("subscription_status", ["active", "suspended"]);

  if (error) {
    console.error("[reconcile] query failed:", error);
    return json({ error: "db_error" }, 500);
  }

  let suspended = 0, reactivated = 0, checked = 0;

  for (const p of profiles ?? []) {
    const sub = await fetchSubscription(p.ls_subscription_id);
    if (!sub?.data?.attributes) continue;
    checked++;
    const attr = sub.data.attributes;
    const grants = lsGrantsAccess(attr);

    if (grants && p.subscription_status === "suspended") {
      await supabaseAdmin.from("profiles").update({
        subscription_status: "active",
        suspended_reason: null,
        subscription_renews_at: attr.renews_at ?? p.subscription_renews_at,
      }).eq("id", p.id);
      reactivated++;
    } else if (!grants && p.subscription_status === "active") {
      const reason = attr?.status === "expired" || attr?.status === "cancelled"
        ? "cancelled_and_expired"
        : "payment_failed";
      await supabaseAdmin.from("profiles")
        .update({ subscription_status: "suspended", suspended_reason: reason })
        .eq("id", p.id);
      await sendSuspensionEmail(p.email, reason, p.ls_customer_portal_url);
      suspended++;
    }
  }

  return json({ ok: true, checked, suspended, reactivated });
});
