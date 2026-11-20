// welcome-email — sends one "Welcome to Design Wallet" email per new account.
//
// Called only by the database (supabase/welcome-email.sql) when an account
// becomes confirmed. It's not for browsers: every call must carry the shared
// secret in `x-welcome-secret`, and the body is just the account id. The email
// address and name are looked up here, so the caller can't choose who gets
// mailed or what it says.
//
// Once per account: it claims `profiles.welcomed_at` before sending, and skips
// accounts that already have it. If Resend fails, the claim is undone.
//
// Secrets:  supabase secrets set RESEND_API_KEY=… WELCOME_EMAIL_SECRET=…
// Deploy:   supabase functions deploy welcome-email --no-verify-jwt
//
// `--no-verify-jwt` because the database sends no JWT; the shared secret is the lock.

import { SUBJECT, welcomeHtml, welcomeText } from "./template.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SECRET = Deno.env.get("WELCOME_EMAIL_SECRET") || "";
const FROM = "Design Wallet <no-reply@designwallet.in>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = {
    apikey: SERVICE_KEY,
    Authorization: "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
};

function reply(status: number, message: string): Response {
    return new Response(JSON.stringify({ message }), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" },
    });
}

// Same time whatever the input, so the secret can't be guessed a byte at a time.
function sameSecret(given: string): boolean {
    const a = new TextEncoder().encode(given);
    const b = new TextEncoder().encode(SECRET);
    let diff = a.length ^ b.length;
    for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
    return SECRET.length > 0 && diff === 0;
}

function firstName(meta: Record<string, unknown>): string {
    const full = String(meta.full_name || meta.name || "").trim();
    return full.split(/\s+/)[0].slice(0, 40);
}

async function claim(id: string): Promise<boolean> {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&welcomed_at=is.null&select=id`,
        {
            method: "PATCH",
            headers: { ...admin, Prefer: "return=representation" },
            body: JSON.stringify({ welcomed_at: new Date().toISOString() }),
        },
    );
    if (!res.ok) throw new Error("claim failed: " + res.status);
    return (await res.json()).length === 1;
}

async function unclaim(id: string): Promise<void> {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...admin, Prefer: "return=minimal" },
        body: JSON.stringify({ welcomed_at: null }),
    }).catch(() => {});
}

Deno.serve(async (req) => {
    if (req.method !== "POST") return reply(405, "POST only");
    if (!sameSecret(req.headers.get("x-welcome-secret") || "")) return reply(401, "unauthorised");
    if (!SERVICE_KEY || !RESEND_KEY) return reply(500, "missing secrets");

    let id = "";
    try {
        id = String((await req.json()).user_id || "");
    } catch { /* falls through to the check below */ }
    if (!UUID.test(id)) return reply(400, "user_id must be a uuid");

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { headers: admin });
    if (!userRes.ok) return reply(404, "no such account");
    const user = await userRes.json();
    if (!user.email || !user.email_confirmed_at) return reply(409, "account not confirmed");

    if (!(await claim(id))) return reply(200, "already welcomed");

    const name = firstName(user.user_metadata || {});
    const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: FROM,
            to: [user.email],
            subject: SUBJECT,
            html: welcomeHtml(name),
            text: welcomeText(name),
        }),
    });

    if (!sent.ok) {
        await unclaim(id);
        console.error("resend", sent.status, await sent.text());
        return reply(502, "send failed");
    }
    return reply(200, "sent");
});
