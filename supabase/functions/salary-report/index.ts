// salary-report: the salary PDF by email, behind a 6-digit code. Logic is in
// handler.ts (so it can be tested without a network); this file only wires it up.
//
// Secrets:  supabase secrets set OTP_PEPPER=<long random string> TURNSTILE_SECRET=<from Cloudflare>
//           (RESEND_API_KEY is already set for welcome-email; the service role key is automatic)
// Deploy:   supabase functions deploy salary-report --no-verify-jwt
//
// `--no-verify-jwt` because browsers call it with the publishable key, which is
// not a JWT. The locks are the Turnstile check, the emailed code and the rate
// limits, not a login. SQL first: supabase/report-otp.sql.

import { makeHandler, readEnv } from "./handler.ts";
import { restDb } from "./store.ts";

const db = restDb(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

Deno.serve(makeHandler({
    db,
    env: readEnv((k) => Deno.env.get(k)),
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
}));
