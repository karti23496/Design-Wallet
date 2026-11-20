// salary-report: the salary PDF by email, behind a 6-digit code.
//
// One endpoint, three actions (POST JSON, `action` picks one):
//
//   send_code    { email, newsletter, turnstile }   emails a 6-digit code
//   verify_code  { email, code }                    -> { token } (single use, 15 min)
//   send_report  { token, pdf_base64, filename, role, level, location }
//                emails the PDF, to the address that owns the token, and nobody else
//   send_report_account  { pdf_base64, filename, role, level, location, newsletter }
//                + header `x-user-jwt: <Supabase access token>`. For SIGNED-IN visitors
//                (Karthik, 2026-11-20): no code. The recipient is the verified email of
//                the session, never anything the browser sends.
//
// WHY IT IS BUILT THIS WAY (Karthik, 2026-11-20, "Option 2"):
// The PDF is built in the browser. A server that emails whatever PDF a browser
// posts, to whatever address it names, is a spam and phishing relay that sends
// from designwallet.in. So the recipient is never chosen by the caller of
// send_report: it comes from the token, and the token is only issued to someone
// who typed a code that was emailed to that inbox. An attacker can only ever
// send a PDF to an address they control.
//
// Codes and tokens are stored hashed (HMAC-SHA256 with OTP_PEPPER). The service
// role key never leaves this function. See supabase/report-otp.sql.

import type { Db } from "./store.ts";
import { codeEmail, reportEmail } from "./templates.ts";

// ── Rules ───────────────────────────────────────────────────────────────
export const CODE_TTL_MS = 10 * 60 * 1000;
export const TOKEN_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_S = 60;
export const MAX_SENDS_PER_EMAIL_PER_HOUR = 5;
export const MAX_SENDS_PER_IP_PER_HOUR = 15;
export const MAX_PDF_BYTES = 3_000_000;
export const MAX_ACCOUNT_SENDS_PER_HOUR = 5;

const SITE = "https://designwallet.in";
const FROM_CODE = "Design Wallet <no-reply@designwallet.in>";
const FROM_REPORT = "Karthik from Design Wallet <hello@designwallet.in>";
const REPLY_TO = "hello@designwallet.in";
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/;
const DEFAULT_ORIGINS = [
    "https://designwallet.in",
    "https://www.designwallet.in",
    "http://localhost:8000",
    "http://localhost:8123",
];

// A PDF that opens a link, runs a script or carries a file is not our report.
const FORBIDDEN_IN_PDF = /\/(JavaScript|JS|URI|Launch|EmbeddedFile|OpenAction|AA|SubmitForm|ImportData|GoToR|RichMedia|XFA)\b/;

export interface Env {
    pepper: string;
    resendKey: string;
    /** Empty means "bot check not configured yet": the check is skipped, loudly. */
    turnstileSecret: string;
    origins: string[];
}

export interface Deps {
    db: Db;
    env: Env;
    fetch: typeof fetch;
    now: () => number;
    /** Resolves a Supabase access token to its owner, or null. Only a CONFIRMED email counts. */
    getUser: (jwt: string) => Promise<{ email: string; confirmed: boolean } | null>;
}

export function readEnv(get: (k: string) => string | undefined): Env {
    return {
        pepper: get("OTP_PEPPER") || "",
        resendKey: get("RESEND_API_KEY") || "",
        turnstileSecret: get("TURNSTILE_SECRET") || "",
        origins: DEFAULT_ORIGINS.concat((get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean)),
    };
}

// ── Small helpers ───────────────────────────────────────────────────────
const enc = new TextEncoder();

async function hmac(pepper: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
    return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
}

/** Six digits, uniformly (rejection sampling, so no modulo bias). */
function randomCode(): string {
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf); while (buf[0] >= 4_294_000_000);
    return String(buf[0] % 1_000_000).padStart(6, "0");
}

function randomToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Text from the browser that ends up in an email: letters, digits and a few marks only. */
export function clean(value: unknown, max: number, fallback: string): string {
    const s = String(value ?? "").replace(/[^\p{L}\p{N} &()/.,'+\-·₹$%]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
    return s || fallback;
}

export function safeFilename(value: unknown): string {
    const s = String(value ?? "").toLowerCase();
    return /^[a-z0-9][a-z0-9-]{0,100}\.pdf$/.test(s) ? s : "design-wallet-salary-report.pdf";
}

/** Returns an error string, or "" when the PDF is acceptable. */
export function checkPdf(b64: unknown): string {
    if (typeof b64 !== "string" || !b64) return "no_pdf";
    if (b64.length > Math.ceil(MAX_PDF_BYTES * 4 / 3) + 8) return "pdf_too_large";
    let bin: string;
    try {
        bin = atob(b64);
    } catch {
        return "bad_pdf";
    }
    if (bin.length > MAX_PDF_BYTES) return "pdf_too_large";
    if (!bin.startsWith("%PDF-")) return "bad_pdf";
    if (!bin.slice(-1024).includes("%%EOF")) return "bad_pdf";
    if (FORBIDDEN_IN_PDF.test(bin)) return "bad_pdf";
    return "";
}

// ── The handler ─────────────────────────────────────────────────────────
export function makeHandler(deps: Deps) {
    const { db, env } = deps;

    function cors(req: Request): Record<string, string> {
        const origin = req.headers.get("origin") || "";
        return env.origins.includes(origin)
            ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
            : { Vary: "Origin" };
    }

    function json(req: Request, status: number, body: Record<string, unknown>): Response {
        return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors(req) },
        });
    }

    async function sendEmail(payload: Record<string, unknown>): Promise<boolean> {
        const res = await deps.fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: "Bearer " + env.resendKey, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) console.error("resend", res.status, await res.text());
        return res.ok;
    }

    async function botCheckPasses(token: unknown, ip: string): Promise<boolean> {
        if (!env.turnstileSecret) {
            console.warn("TURNSTILE_SECRET is not set: the bot check is being skipped");
            return true;
        }
        if (typeof token !== "string" || !token) return false;
        const form = new URLSearchParams({ secret: env.turnstileSecret, response: token });
        if (ip && ip !== "unknown") form.set("remoteip", ip);
        const res = await deps.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
        if (!res.ok) return false;
        return (await res.json()).success === true;
    }

    // ── send_code ───────────────────────────────────────────────────────
    async function sendCode(req: Request, body: Record<string, unknown>, ip: string): Promise<Response> {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!EMAIL_RE.test(email) || email.length < 6 || email.length > 254) return json(req, 400, { error: "invalid_email" });
        if (!(await botCheckPasses(body.turnstile, ip))) return json(req, 400, { error: "bot_check" });

        const now = deps.now();
        const ipHash = await hmac(env.pepper, "ip:" + ip);
        const e = encodeURIComponent(email);

        // A resend must wait. Server-enforced, so the button's countdown is a courtesy.
        const recent = await db.select("report_otps", `email=eq.${e}&created_at=gte.${encodeURIComponent(iso(now - RESEND_COOLDOWN_S * 1000))}&order=created_at.desc&limit=1`);
        if (recent.length) return json(req, 429, { error: "cooldown", retry_after: RESEND_COOLDOWN_S });

        const hourAgo = encodeURIComponent(iso(now - 3600_000));
        if ((await db.count("report_otps", `email=eq.${e}&created_at=gte.${hourAgo}`)) >= MAX_SENDS_PER_EMAIL_PER_HOUR) return json(req, 429, { error: "rate_limited" });
        if ((await db.count("report_otps", `ip_hash=eq.${ipHash}&created_at=gte.${hourAgo}`)) >= MAX_SENDS_PER_IP_PER_HOUR) return json(req, 429, { error: "rate_limited" });

        const code = randomCode();
        await db.insert("report_otps", {
            email,
            code_hash: await hmac(env.pepper, `otp:${email}:${code}`),
            ip_hash: ipHash,
            newsletter_opt_in: body.newsletter === true,
            expires_at: iso(now + CODE_TTL_MS),
        });

        const mail = codeEmail(code);
        const ok = await sendEmail({ from: FROM_CODE, to: [email], subject: mail.subject, html: mail.html, text: mail.text });
        if (!ok) return json(req, 502, { error: "send_failed" });
        return json(req, 200, { ok: true, retry_after: RESEND_COOLDOWN_S });
    }

    /** Adds (or re-confirms) a subscriber. Call only for an address that is proven and a box that was ticked. */
    async function subscribe(email: string, now: number): Promise<string | null> {
        const e = encodeURIComponent(email);
        const existing = await db.select("subscribers", `email=eq.${e}&select=email`);
        const stamped = existing.length
            // Explicit consent again clears an earlier unsubscribe.
            ? await db.patch("subscribers", `email=eq.${e}`, { confirmed_at: iso(now), unsubscribed_at: null })
            : await db.insert("subscribers", { email, source: "salary-report", confirmed_at: iso(now) });
        return (stamped[0]?.unsubscribe_token as string) ?? null;
    }

    // ── verify_code ─────────────────────────────────────────────────────
    async function verifyCode(req: Request, body: Record<string, unknown>): Promise<Response> {
        const email = String(body.email ?? "").trim().toLowerCase();
        const code = String(body.code ?? "").trim();
        if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return json(req, 400, { error: "invalid_input" });

        const now = deps.now();
        const e = encodeURIComponent(email);
        const rows = await db.select("report_otps", `email=eq.${e}&consumed_at=is.null&order=created_at.desc&limit=1`);
        const otp = rows[0];
        if (!otp || Date.parse(String(otp.expires_at)) <= now) return json(req, 400, { error: "expired" });

        const attempts = Number(otp.attempts);
        if (attempts >= MAX_ATTEMPTS) return json(req, 429, { error: "locked" });

        // Count the guess BEFORE judging it, and only if nobody else counted one
        // first. Two parallel guesses cannot both slip in under the limit.
        const counted = await db.patch("report_otps", `id=eq.${otp.id}&attempts=eq.${attempts}`, { attempts: attempts + 1 });
        if (!counted.length) return json(req, 409, { error: "retry" });

        const given = await hmac(env.pepper, `otp:${email}:${code}`);
        if (!sameHash(given, String(otp.code_hash))) {
            return json(req, 400, { error: "wrong_code", tries_left: MAX_ATTEMPTS - (attempts + 1) });
        }

        // Single use: only one request can flip consumed_at.
        const used = await db.patch("report_otps", `id=eq.${otp.id}&consumed_at=is.null`, { consumed_at: iso(now) });
        if (!used.length) return json(req, 409, { error: "retry" });

        // The newsletter only if the box was ticked, and only now the address is proven.
        const unsubscribeToken = otp.newsletter_opt_in === true ? await subscribe(email, now) : null;

        const token = randomToken();
        await db.insert("report_tokens", {
            token_hash: await hmac(env.pepper, "tok:" + token),
            email,
            newsletter_opt_in: otp.newsletter_opt_in === true,
            unsubscribe_token: unsubscribeToken,
            expires_at: iso(now + TOKEN_TTL_MS),
        });
        return json(req, 200, { ok: true, token });
    }

    // ── send_report ─────────────────────────────────────────────────────
    async function sendReport(req: Request, body: Record<string, unknown>): Promise<Response> {
        const token = String(body.token ?? "");
        if (token.length < 20 || token.length > 100) return json(req, 401, { error: "invalid_token" });

        // Check the file BEFORE spending the token, so a bad file does not cost a re-verify.
        const bad = checkPdf(body.pdf_base64);
        if (bad) return json(req, 400, { error: bad });

        const now = deps.now();
        const tokenHash = await hmac(env.pepper, "tok:" + token);
        const claimed = await db.patch(
            "report_tokens",
            `token_hash=eq.${tokenHash}&used_at=is.null&expires_at=gt.${encodeURIComponent(iso(now))}`,
            { used_at: iso(now) },
        );
        if (!claimed.length) return json(req, 401, { error: "invalid_token" });
        const grant = claimed[0];

        const newsletter = grant.newsletter_opt_in === true;
        const mail = reportEmail({
            role: clean(body.role, 60, "Design"),
            level: clean(body.level, 40, "All levels"),
            location: clean(body.location, 60, "India"),
            newsletter,
            unsubscribeUrl: `${SITE}/unsubscribe/?t=${grant.unsubscribe_token ?? ""}`,
        });

        const payload: Record<string, unknown> = {
            from: FROM_REPORT,
            to: [String(grant.email)],
            reply_to: REPLY_TO,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachments: [{ filename: safeFilename(body.filename), content: body.pdf_base64 }],
        };
        if (newsletter && grant.unsubscribe_token) {
            payload.headers = { "List-Unsubscribe": `<${SITE}/unsubscribe/?t=${grant.unsubscribe_token}>` };
        }

        if (!(await sendEmail(payload))) {
            // Give the token back: the person proved their address and should not have to again.
            await db.patch("report_tokens", `token_hash=eq.${tokenHash}`, { used_at: null }).catch(() => {});
            return json(req, 502, { error: "send_failed" });
        }
        return json(req, 200, { ok: true });
    }

    // ── send_report_account ─────────────────────────────────────────────
    // A signed-in visitor already proved their address when they signed in, so
    // no code. The recipient comes ONLY from the verified session.
    async function sendReportAccount(req: Request, body: Record<string, unknown>): Promise<Response> {
        const jwt = (req.headers.get("x-user-jwt") || "").trim();
        if (jwt.length < 20 || jwt.length > 4096) return json(req, 401, { error: "not_signed_in" });
        const user = await deps.getUser(jwt);
        if (!user || !user.confirmed || !EMAIL_RE.test(user.email)) return json(req, 401, { error: "not_signed_in" });
        const email = user.email.trim().toLowerCase();

        const bad = checkPdf(body.pdf_base64);
        if (bad) return json(req, 400, { error: bad });

        // Rate limit per account. Each send leaves a spent row in report_tokens, so
        // the existing table doubles as the audit trail (no schema change).
        const now = deps.now();
        const e = encodeURIComponent(email);
        const hourAgo = encodeURIComponent(iso(now - 3600_000));
        if ((await db.count("report_tokens", `email=eq.${e}&used_at=gte.${hourAgo}`)) >= MAX_ACCOUNT_SENDS_PER_HOUR) {
            return json(req, 429, { error: "rate_limited" });
        }

        const newsletter = body.newsletter === true;
        const unsubscribeToken = newsletter ? await subscribe(email, now) : null;

        const mail = reportEmail({
            role: clean(body.role, 60, "Design"),
            level: clean(body.level, 40, "All levels"),
            location: clean(body.location, 60, "India"),
            newsletter,
            unsubscribeUrl: `${SITE}/unsubscribe/?t=${unsubscribeToken ?? ""}`,
        });
        const payload: Record<string, unknown> = {
            from: FROM_REPORT,
            to: [email],
            reply_to: REPLY_TO,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachments: [{ filename: safeFilename(body.filename), content: body.pdf_base64 }],
        };
        if (newsletter && unsubscribeToken) payload.headers = { "List-Unsubscribe": `<${SITE}/unsubscribe/?t=${unsubscribeToken}>` };

        if (!(await sendEmail(payload))) return json(req, 502, { error: "send_failed" });

        await db.insert("report_tokens", {
            token_hash: "acct:" + await hmac(env.pepper, `acct:${email}:${now}:${randomToken()}`),
            email,
            newsletter_opt_in: newsletter,
            unsubscribe_token: unsubscribeToken,
            expires_at: iso(now),
            used_at: iso(now),
        });
        return json(req, 200, { ok: true, email });
    }

    // ── routing ─────────────────────────────────────────────────────────
    return async (req: Request): Promise<Response> => {
        if (req.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    ...cors(req),
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info, x-user-jwt",
                    "Access-Control-Max-Age": "86400",
                },
            });
        }
        if (req.method !== "POST") return json(req, 405, { error: "post_only" });
        if (!env.pepper || !env.resendKey) {
            console.error("salary-report: OTP_PEPPER or RESEND_API_KEY is missing");
            return json(req, 500, { error: "not_configured" });
        }

        let body: Record<string, unknown>;
        try {
            body = await req.json();
        } catch {
            return json(req, 400, { error: "bad_request" });
        }
        if (!body || typeof body !== "object") return json(req, 400, { error: "bad_request" });

        const ip = (req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown");

        try {
            switch (body.action) {
                case "send_code": return await sendCode(req, body, ip);
                case "verify_code": return await verifyCode(req, body);
                case "send_report": return await sendReport(req, body);
                case "send_report_account": return await sendReportAccount(req, body);
                default: return json(req, 400, { error: "unknown_action" });
            }
        } catch (error) {
            console.error("salary-report", error);
            return json(req, 500, { error: "server_error" });
        }
    };
}
