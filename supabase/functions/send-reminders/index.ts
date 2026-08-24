// send-reminders (FR-16)
// Run on a schedule (Supabase cron, e.g. hourly). Sends ONE follow-up reminder
// to anyone who paid ~24h+ ago but hasn't completed signup. reminder_sent
// guards against repeat nagging. Issues a fresh token with each reminder.
import { json } from "../_shared/cors.ts";
import { supabaseAdmin, newSetupToken, tokenExpiry } from "../_shared/supabaseAdmin.ts";
import { sendReminderEmail } from "../_shared/email.ts";

Deno.serve(async () => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("payments")
    .select("id, email")
    .eq("status", "paid")
    .eq("signup_complete", false)
    .eq("reminder_sent", false)
    .lte("paid_at", cutoff);

  if (error) {
    console.error("[reminders] query failed:", error);
    return json({ error: "db_error" }, 500);
  }

  let sent = 0;
  for (const row of due ?? []) {
    const token = newSetupToken();
    await supabaseAdmin.from("payments")
      .update({ setup_token: token, token_expires_at: tokenExpiry(), reminder_sent: true })
      .eq("id", row.id);
    await sendReminderEmail(row.email, token);
    sent++;
  }

  return json({ ok: true, sent });
});
