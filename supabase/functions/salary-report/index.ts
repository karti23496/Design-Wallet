// salary-report: the salary PDF by email, behind a 6-digit code. Logic is in
// handler.ts (so it can be tested without a network); this file only wires it up.
//
// Secrets:  supabase secrets set OTP_PEPPER=<long random string> TURNSTILE_SECRET=<from Cloudflare>
//           (RESEND_API_KEY is already set for welcome-email; the service role key is automatic)
// Deploy:   supabase functions deploy salary-report --no-verify-jwt
//
// `--no-verify-jwt` because browsers call it with the publishable key, which is
// not a JWT. The locks are the Turnstile check, the emailed code and the rate
// limits. Signed-in visitors send their access token in `x-user-jwt` (the
// Authorization header must stay the publishable key), and handler.ts asks
// Supabase Auth who it belongs to. SQL first: supabase/report-otp.sql.

import { makeHandler, readEnv } from "./handler.ts";
import { restDb } from "./store.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

/** Asks Supabase Auth who owns this access token. Null when it is invalid or expired. */
async function getUser(jwt: string) {
    if (!ANON_KEY) {
        console.error("salary-report: no anon/publishable key in the environment, so sessions cannot be checked");
        return null;
    }
    const res = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: ANON_KEY, Authorization: "Bearer " + jwt } });
    if (!res.ok) return null;
    const user = await res.json();
    if (typeof user?.email !== "string") return null;
    return { email: user.email, confirmed: !!(user.email_confirmed_at || user.confirmed_at) };
}

const db = restDb(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

Deno.serve(makeHandler({
    db,
    env: readEnv((k) => Deno.env.get(k)),
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
    getUser,
}));
