// send-renewal-reminders (FR-15)
// Run on a daily schedule. Emails every active subscriber whose renewal is
// within the next 7 days and who hasn't already been reminded for THIS cycle.
// renewal_reminder_for stores the renews_at we reminded about, so a subscriber
// gets exactly one reminder per annual cycle even if this runs daily.
import { json } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendRenewalReminderEmail } from "../_shared/email.ts";

Deno.serve(async () => {
  const now = Date.now();
  const windowEnd = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, subscription_renews_at, renewal_reminder_for, ls_customer_portal_url")
    .eq("subscription_status", "active")
    .not("subscription_renews_at", "is", null)
    .lte("subscription_renews_at", windowEnd)
    .gte("subscription_renews_at", new Date(now).toISOString());

  if (error) {
    console.error("[renewal-reminders] query failed:", error);
    return json({ error: "db_error" }, 500);
  }

  let sent = 0;
  for (const row of due ?? []) {
    // Skip if we've already reminded for this exact renewal date.
    if (row.renewal_reminder_for === row.subscription_renews_at) continue;
    await sendRenewalReminderEmail(row.email, row.subscription_renews_at, row.ls_customer_portal_url);
    await supabaseAdmin.from("profiles")
      .update({ renewal_reminder_for: row.subscription_renews_at })
      .eq("id", row.id);
    sent++;
  }

  return json({ ok: true, sent });
});
