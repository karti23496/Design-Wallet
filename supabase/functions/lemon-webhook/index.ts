// lemon-webhook (FR-8, FR-10, FR-11, FR-12, FR-14)
// Verifies the Lemon Squeezy X-Signature, then routes on meta.event_name.
// The zero-grace-period suspension model (PRD §5.6) depends entirely on the
// payment_failed / expired events arriving here, so every branch is idempotent:
// renewal SETS renews_at from the payload (never increments), and suspension
// emails fire only on a real state transition.
//
// Deploy with --no-verify-jwt (Lemon Squeezy calls this directly).
//
// Events handled:
//   subscription_created          → first activation (or re-subscribe); if no
//                                    account yet, seed payments + email setup link
//   subscription_payment_success  → renewal: set renews_at, (re)activate
//   subscription_payment_failed   → suspend (payment_failed) + email
//   subscription_cancelled        → keep access until ends_at (no suspend yet)
//   subscription_expired          → suspend (cancelled_and_expired) + email
//   subscription_updated/_resumed → best-effort status sync
import { verifySignature, parseEvent, type LsEvent } from "../_shared/lemonsqueezy.ts";
import { supabaseAdmin, newSetupToken, tokenExpiry } from "../_shared/supabaseAdmin.ts";
import { sendSetupEmail, sendSuspensionEmail } from "../_shared/email.ts";

const WEBHOOK_SECRET = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET") ?? "";

function ok(msg = "ok") { return new Response(msg, { status: 200 }); }

// Find the profile this event belongs to: by LS subscription id first, else email.
async function findProfile(ev: LsEvent) {
  if (ev.subscriptionId) {
    const { data } = await supabaseAdmin
      .from("profiles").select("*").eq("ls_subscription_id", ev.subscriptionId).maybeSingle();
    if (data) return data;
  }
  if (ev.email) {
    const { data } = await supabaseAdmin
      .from("profiles").select("*").ilike("email", ev.email).maybeSingle();
    if (data) return data;
  }
  return null;
}

// Activate (or reactivate) an existing profile. renews_at comes from the LS
// payload when present (authoritative + idempotent).
async function activateProfile(profile: any, ev: LsEvent, renewsAt: string | null) {
  await supabaseAdmin.from("profiles").update({
    subscription_status: "active",
    subscription_renews_at: renewsAt ?? profile.subscription_renews_at,
    subscription_started_at: profile.subscription_started_at ?? new Date().toISOString(),
    suspended_reason: null,
    ls_subscription_id: ev.subscriptionId ?? profile.ls_subscription_id,
    ls_customer_id: ev.customerId ?? profile.ls_customer_id,
    ls_customer_portal_url: ev.customerPortalUrl ?? profile.ls_customer_portal_url,
    renewal_reminder_for: null, // reset the 7-day reminder for the new cycle
  }).eq("id", profile.id);
}

// Suspend only if this is a real transition; returns true when we actually
// flipped it (so the caller emails exactly once).
async function suspendIfNeeded(profileId: string, reason: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .update({ subscription_status: "suspended", suspended_reason: reason })
    .eq("id", profileId)
    .neq("subscription_status", "suspended")
    .select("id");
  return Array.isArray(data) && data.length > 0;
}

async function handleCreated(ev: LsEvent) {
  const existing = await findProfile(ev);
  if (existing) {
    // Returning customer (e.g. re-subscribing after expiry) already has an
    // account → just (re)activate it. No setup email needed.
    await activateProfile(existing, ev, ev.renewsAt);
    return ok("reactivated");
  }

  // New payer, no account yet → record the payment and email the setup link.
  // Idempotent on ls_order_id: if we've already seen this order, don't re-email.
  const orderKey = ev.orderId ?? ev.subscriptionId;
  if (orderKey) {
    const { data: prior } = await supabaseAdmin
      .from("payments").select("id, signup_complete").eq("ls_order_id", orderKey).maybeSingle();
    if (prior) {
      await supabaseAdmin.from("payments").update({
        ls_subscription_id: ev.subscriptionId,
        ls_customer_id: ev.customerId,
        ls_customer_portal_url: ev.customerPortalUrl,
      }).eq("id", prior.id);
      return ok("payment already recorded");
    }
  }

  const token = newSetupToken();
  const { error } = await supabaseAdmin.from("payments").insert({
    email: ev.email,
    ls_order_id: orderKey,
    ls_subscription_id: ev.subscriptionId,
    ls_customer_id: ev.customerId,
    ls_customer_portal_url: ev.customerPortalUrl,
    status: "paid",
    paid_at: new Date().toISOString(),
    signup_complete: false,
    setup_token: token,
    token_expires_at: tokenExpiry(),
  });
  if (error) {
    console.error("[lemon-webhook] payments insert failed:", error);
    return new Response("db error", { status: 500 });
  }
  await sendSetupEmail(ev.email, token); // FR-8: immediate confirmation + setup link
  return ok("setup emailed");
}

async function handlePaymentSuccess(ev: LsEvent) {
  const profile = await findProfile(ev);
  if (!profile) return ok("no profile yet (signup incomplete)");
  await activateProfile(profile, ev, ev.renewsAt); // FR-11: renews_at from payload
  return ok("renewed");
}

async function handlePaymentFailed(ev: LsEvent) {
  const profile = await findProfile(ev);
  if (!profile) return ok("no profile");
  const flipped = await suspendIfNeeded(profile.id, "payment_failed"); // FR-12
  if (flipped) {
    await sendSuspensionEmail(profile.email, "payment_failed", profile.ls_customer_portal_url); // FR-14
  }
  return ok("suspended (payment_failed)");
}

async function handleCancelled(ev: LsEvent) {
  // Cancellation just turns off auto-renew; access continues until ends_at.
  // Record the access-until date so the account page can show it; suspension
  // happens later on subscription_expired.
  const profile = await findProfile(ev);
  if (!profile) return ok("no profile");
  await supabaseAdmin.from("profiles").update({
    subscription_renews_at: ev.endsAt ?? profile.subscription_renews_at,
    ls_customer_portal_url: ev.customerPortalUrl ?? profile.ls_customer_portal_url,
  }).eq("id", profile.id);
  return ok("cancellation recorded");
}

async function handleExpired(ev: LsEvent) {
  const profile = await findProfile(ev);
  if (!profile) return ok("no profile");
  const flipped = await suspendIfNeeded(profile.id, "cancelled_and_expired"); // FR-12
  if (flipped) {
    await sendSuspensionEmail(profile.email, "cancelled_and_expired", profile.ls_customer_portal_url);
  }
  return ok("suspended (cancelled_and_expired)");
}

Deno.serve(async (req) => {
  const rawBody = await req.text();
  const sig = req.headers.get("X-Signature");

  if (!(await verifySignature(rawBody, sig, WEBHOOK_SECRET))) {
    console.error("[lemon-webhook] signature verification failed");
    return new Response("invalid signature", { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(rawBody); }
  catch { return new Response("bad json", { status: 400 }); }

  const ev = parseEvent(body);
  if (!ev.eventName) return ok("no event name");

  try {
    switch (ev.eventName) {
      case "subscription_created":
        return await handleCreated(ev);
      case "subscription_payment_success":
        return await handlePaymentSuccess(ev);
      case "subscription_payment_failed":
        return await handlePaymentFailed(ev);
      case "subscription_cancelled":
        return await handleCancelled(ev);
      case "subscription_expired":
        return await handleExpired(ev);
      // Best-effort sync for resume/reactivation or a status-only update.
      case "subscription_resumed":
      case "subscription_unpaused":
        return await handlePaymentSuccess(ev);
      case "subscription_updated": {
        if (ev.status === "active") return await handlePaymentSuccess(ev);
        if (ev.status === "expired") return await handleExpired(ev);
        return ok("update ignored");
      }
      default:
        return ok("event ignored: " + ev.eventName);
    }
  } catch (err) {
    console.error("[lemon-webhook] handler error:", ev.eventName, err);
    return new Response("handler error", { status: 500 });
  }
});
