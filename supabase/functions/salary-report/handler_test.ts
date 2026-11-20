// Tests for the salary-report handler. No network and no database: an in-memory
// Db understands the same PostgREST query strings the real one sends, and a fake
// fetch stands in for Resend and Cloudflare Turnstile.
//
//   deno test supabase/functions/salary-report/

import { makeHandler, MAX_ATTEMPTS, MAX_PDF_BYTES, clean, checkPdf, safeFilename } from "./handler.ts";
import type { Db, Row } from "./store.ts";

// ── tiny assertions (no remote imports) ─────────────────────────────────
function eq(actual: unknown, expected: unknown, msg = "") {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${msg}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
    }
}
function ok(cond: unknown, msg = "expected truthy") { if (!cond) throw new Error(msg); }

// ── in-memory PostgREST ─────────────────────────────────────────────────
function memoryDb(clock: () => number) {
    const tables = new Map<string, Row[]>();
    const t = (name: string) => { if (!tables.has(name)) tables.set(name, []); return tables.get(name)!; };
    let n = 0;
    const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

    function match(row: Row, query: string): boolean {
        for (const part of query.split("&")) {
            const [key, raw] = [part.slice(0, part.indexOf("=")), decodeURIComponent(part.slice(part.indexOf("=") + 1))];
            if (["select", "order", "limit"].includes(key)) continue;
            const v = row[key];
            if (raw === "is.null") { if (v != null) return false; continue; }
            const [op, val] = [raw.slice(0, raw.indexOf(".")), raw.slice(raw.indexOf(".") + 1)];
            const numeric = typeof v === "number";
            const cmp = (numeric ? Number(v) : String(v ?? "")) as number | string;
            const rhs = (numeric ? Number(val) : val) as number | string;
            if (op === "eq" && cmp !== rhs) return false;
            if (op === "gt" && !(cmp > rhs)) return false;
            if (op === "gte" && !(cmp >= rhs)) return false;
            if (op === "lt" && !(cmp < rhs)) return false;
        }
        return true;
    }

    const db: Db = {
        select(table, query) {
            let rows = t(table).filter((r) => match(r, query));
            const order = /order=([a-z_]+)\.(asc|desc)/.exec(query);
            if (order) rows = rows.slice().sort((a, b) => String(a[order[1]]).localeCompare(String(b[order[1]])) * (order[2] === "desc" ? -1 : 1));
            const limit = /limit=(\d+)/.exec(query);
            if (limit) rows = rows.slice(0, Number(limit[1]));
            return Promise.resolve(rows.map((r) => ({ ...r })));
        },
        count(table, query) { return Promise.resolve(t(table).filter((r) => match(r, query)).length); },
        insert(table, row) {
            const full: Row = { ...row };
            const stamp = new Date(clock()).toISOString();
            if (table === "report_otps") Object.assign(full, { id: uuid(), attempts: 0, consumed_at: null, created_at: stamp, ...row });
            if (table === "report_tokens") Object.assign(full, { used_at: null, created_at: stamp, ...row });
            if (table === "subscribers") Object.assign(full, { unsubscribe_token: uuid(), unsubscribed_at: null, created_at: stamp, ...row });
            t(table).push(full);
            return Promise.resolve([{ ...full }]);
        },
        patch(table, query, body) {
            const hit = t(table).filter((r) => match(r, query));
            for (const r of hit) Object.assign(r, body);
            return Promise.resolve(hit.map((r) => ({ ...r })));
        },
    };
    return { db, t };
}

// ── harness ─────────────────────────────────────────────────────────────
interface Sent { to: string[]; from: string; subject: string; text: string; html: string; reply_to?: string; attachments?: { filename: string; content: string }[]; headers?: Record<string, string> }

function setup(opts: { turnstileSecret?: string; resendFails?: boolean } = {}) {
    let now = Date.parse("2026-11-20T10:00:00Z");
    const clock = () => now;
    const { db, t } = memoryDb(clock);
    const sent: Sent[] = [];
    const state = { resendFails: opts.resendFails === true };

    const fakeFetch = ((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("api.resend.com")) {
            if (state.resendFails) return Promise.resolve(new Response("boom", { status: 500 }));
            sent.push(JSON.parse(String(init!.body)));
            return Promise.resolve(new Response("{}", { status: 200 }));
        }
        if (url.includes("turnstile")) {
            const ok = String((init!.body as URLSearchParams).get("response")) === "good";
            return Promise.resolve(new Response(JSON.stringify({ success: ok }), { status: 200 }));
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
    }) as typeof fetch;

    const handler = makeHandler({
        db, fetch: fakeFetch, now: clock,
        env: { pepper: "test-pepper", resendKey: "re_test", turnstileSecret: opts.turnstileSecret || "", origins: ["https://designwallet.in", "http://localhost:8123"] },
        getUser: (jwt) => Promise.resolve(USERS[jwt] ?? null),
    });

    async function call(body: unknown, headers: Record<string, string> = {}) {
        const res = await handler(new Request("https://x.supabase.co/functions/v1/salary-report", {
            method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers }, body: JSON.stringify(body),
        }));
        return { status: res.status, body: await res.json(), res };
    }
    return { call, sent, t, advance: (ms: number) => { now += ms; }, state, handler };
}

const EMAIL = "designer@example.com";
// Fake Supabase sessions: access token -> who it belongs to.
const USERS: Record<string, { email: string; confirmed: boolean }> = {
    "jwt-signed-in-designer-0001": { email: "Account@Example.com", confirmed: true },
    "jwt-unconfirmed-designer-001": { email: "pending@example.com", confirmed: false },
};
const GOOD_JWT = "jwt-signed-in-designer-0001";
const codeFrom = (s: Sent) => /(\d{6})/.exec(s.subject)![1];
// A minimal, valid-looking PDF.
const PDF = btoa("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const REPORT = { action: "send_report_account", pdf_base64: PDF, filename: "design-wallet-salary-product-designer.pdf", role: "Product Designer", level: "Senior", location: "Pune" };

async function getToken(h: ReturnType<typeof setup>, newsletter = false, email = EMAIL) {
    await h.call({ action: "send_code", email, newsletter });
    const code = codeFrom(h.sent[h.sent.length - 1]);
    const r = await h.call({ action: "verify_code", email, code });
    return r.body.token as string;
}

// ── tests ───────────────────────────────────────────────────────────────
Deno.test("happy path: code, token, report, and the token is single use", async () => {
    const h = setup();
    const r1 = await h.call({ action: "send_code", email: "  Designer@Example.com ", newsletter: false });
    eq(r1.status, 200);
    eq(h.sent[0].to, [EMAIL], "address is lowercased and trimmed");
    eq(h.sent[0].from, "Design Wallet <no-reply@designwallet.in>");
    ok(/^Your Design Wallet code: \d{6}$/.test(h.sent[0].subject));
    ok(h.sent[0].text.includes(codeFrom(h.sent[0])));

    const v = await h.call({ action: "verify_code", email: EMAIL, code: codeFrom(h.sent[0]) });
    eq(v.status, 200);
    ok(v.body.token.length >= 40);

    const rep = await h.call({ action: "send_report", token: v.body.token, pdf_base64: PDF, filename: "design-wallet-salary-product-designer-senior.pdf", role: "Product Designer", level: "Senior", location: "Bengaluru" });
    eq(rep.status, 200);
    const mail = h.sent[1];
    eq(mail.to, [EMAIL]);
    eq(mail.from, "Karthik from Design Wallet <hello@designwallet.in>");
    eq(mail.reply_to, "hello@designwallet.in");
    eq(mail.subject, "Your Product Designer salary report is attached");
    eq(mail.attachments![0].filename, "design-wallet-salary-product-designer-senior.pdf");
    eq(mail.attachments![0].content, PDF);
    ok(mail.text.includes("Product Designer, Senior, Bengaluru"));
    ok(mail.text.includes("utm_source=report-email&utm_medium=email&utm_campaign=salary-report"), "UTM tags on the submit link");
    ok(!mail.text.includes("—") && !mail.html.includes("—"), "no em dashes");
    ok(/<a href="https:\/\/designwallet\.in\/salary\/submit\/\?utm_source=report-email&amp;utm_medium=email&amp;utm_campaign=salary-report"[^>]*>adding it takes about two minutes<\/a>/.test(mail.html), "the words are the hyperlink, with UTM tags");
    ok(!/>https?:\/\/designwallet\.in\/salary\/submit[^<]*</.test(mail.html), "the long address is not shown as text in the HTML");
    ok(mail.html.includes('<p style="margin:0 0 16px;">Hey,</p>'), "greeting on its own line");
    ok(mail.text.startsWith("Hey,\n\nThanks for asking for the report."), "plain text greeting on its own line");

    const again = await h.call({ action: "send_report", token: v.body.token, pdf_base64: PDF });
    eq(again.status, 401, "token is single use");
    eq(h.sent.length, 2, "no second email");
});

Deno.test("the recipient comes from the token, never from the request body", async () => {
    const h = setup();
    const token = await getToken(h);
    const r = await h.call({ action: "send_report", token, pdf_base64: PDF, email: "victim@example.com", to: ["victim@example.com"], recipient: "victim@example.com" });
    eq(r.status, 200);
    eq(h.sent[h.sent.length - 1].to, [EMAIL]);
});

Deno.test("a made-up token sends nothing", async () => {
    const h = setup();
    const r = await h.call({ action: "send_report", token: "x".repeat(43), pdf_base64: PDF });
    eq(r.status, 401);
    eq(h.sent.length, 0);
});

Deno.test("wrong code counts down, and five wrong tries lock even the right code", async () => {
    const h = setup();
    await h.call({ action: "send_code", email: EMAIL });
    const code = codeFrom(h.sent[0]);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
        const r = await h.call({ action: "verify_code", email: EMAIL, code: wrong });
        eq(r.status, 400); eq(r.body.error, "wrong_code"); eq(r.body.tries_left, MAX_ATTEMPTS - i);
    }
    const locked = await h.call({ action: "verify_code", email: EMAIL, code });
    eq(locked.status, 429); eq(locked.body.error, "locked");
});

Deno.test("a code expires after 10 minutes", async () => {
    const h = setup();
    await h.call({ action: "send_code", email: EMAIL });
    const code = codeFrom(h.sent[0]);
    h.advance(10 * 60 * 1000 + 1000);
    const r = await h.call({ action: "verify_code", email: EMAIL, code });
    eq(r.body.error, "expired");
});

Deno.test("a code works once", async () => {
    const h = setup();
    await h.call({ action: "send_code", email: EMAIL });
    const code = codeFrom(h.sent[0]);
    eq((await h.call({ action: "verify_code", email: EMAIL, code })).status, 200);
    eq((await h.call({ action: "verify_code", email: EMAIL, code })).body.error, "expired");
});

Deno.test("parallel guesses cannot beat the attempt limit", async () => {
    const h = setup();
    await h.call({ action: "send_code", email: EMAIL });
    const code = codeFrom(h.sent[0]);
    const wrong = code === "000000" ? "111111" : "000000";
    const results = await Promise.all(Array.from({ length: 12 }, () => h.call({ action: "verify_code", email: EMAIL, code: wrong })));
    const counted = results.filter((r) => r.body.error === "wrong_code").length;
    ok(counted <= MAX_ATTEMPTS, `${counted} guesses were judged, limit is ${MAX_ATTEMPTS}`);
    const row = h.t("report_otps")[0];
    ok(Number(row.attempts) <= MAX_ATTEMPTS, "stored attempts never pass the limit");
});

Deno.test("resend cooldown, per-email and per-IP hourly limits", async () => {
    const h = setup();
    eq((await h.call({ action: "send_code", email: EMAIL })).status, 200);
    const cool = await h.call({ action: "send_code", email: EMAIL });
    eq(cool.status, 429); eq(cool.body.error, "cooldown");

    // Four more over the hour (each after the 60 s cooldown) fill the per-email limit of 5.
    for (let i = 0; i < 4; i++) { h.advance(61_000); eq((await h.call({ action: "send_code", email: EMAIL })).status, 200); }
    h.advance(61_000);
    const limited = await h.call({ action: "send_code", email: EMAIL });
    eq(limited.status, 429); eq(limited.body.error, "rate_limited");

    // Per IP: one address, many different mailboxes.
    const h2 = setup();
    let last = 200;
    for (let i = 0; i < 16; i++) last = (await h2.call({ action: "send_code", email: `person${i}@example.com` })).status;
    eq(last, 429, "the 16th send from one IP in an hour is refused");
});

Deno.test("invalid email, bad input and unknown action are refused", async () => {
    const h = setup();
    eq((await h.call({ action: "send_code", email: "nope" })).body.error, "invalid_email");
    eq((await h.call({ action: "verify_code", email: EMAIL, code: "12" })).body.error, "invalid_input");
    eq((await h.call({ action: "dance" })).body.error, "unknown_action");
    eq(h.sent.length, 0);
});

Deno.test("newsletter: only added when the box is ticked, and the footer matches", async () => {
    const off = setup();
    const t1 = await getToken(off, false);
    eq(off.t("subscribers").length, 0, "not ticked: no subscriber row");
    await off.call({ action: "send_report", token: t1, pdf_base64: PDF });
    const m1 = off.sent[off.sent.length - 1];
    ok(m1.text.includes("one-off email"), "one-off footer");
    ok(!m1.headers, "no List-Unsubscribe header");

    const on = setup();
    const t2 = await getToken(on, true);
    const sub = on.t("subscribers");
    eq(sub.length, 1);
    eq(sub[0].email, EMAIL); eq(sub[0].source, "salary-report");
    ok(sub[0].confirmed_at, "confirmed");
    await on.call({ action: "send_report", token: t2, pdf_base64: PDF });
    const m2 = on.sent[on.sent.length - 1];
    ok(m2.text.includes("Designer's Weekly Drop"));
    ok(m2.text.includes(`https://designwallet.in/unsubscribe/?t=${sub[0].unsubscribe_token}`), "unsubscribe link carries the token, not the email");
    ok(!m2.text.includes("designer%40") && !/unsubscribe\/\?t=.*@/.test(m2.text), "no email address in the link");
    ok(m2.headers!["List-Unsubscribe"].includes(String(sub[0].unsubscribe_token)));
});

Deno.test("ticking again after an unsubscribe re-subscribes, and keeps the original source", async () => {
    const h = setup();
    h.t("subscribers").push({ email: EMAIL, source: "/", unsubscribe_token: "11111111-1111-4111-8111-111111111111", unsubscribed_at: "2026-10-01T00:00:00Z", confirmed_at: null });
    await getToken(h, true);
    const row = h.t("subscribers")[0];
    eq(row.unsubscribed_at, null); ok(row.confirmed_at);
    eq(row.source, "/", "original source kept");
    eq(h.t("subscribers").length, 1, "no duplicate row");
});

Deno.test("a bad PDF is refused and does NOT spend the token", async () => {
    const h = setup();
    const token = await getToken(h);
    const evil = btoa("%PDF-1.4\n1 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj\n%%EOF\n");
    const link = btoa("%PDF-1.4\n1 0 obj<</S/URI/URI(http://evil)>>endobj\n%%EOF\n");
    const notPdf = btoa("<html>hello</html>");
    const noEof = btoa("%PDF-1.4\n1 0 obj<<>>endobj\n");
    for (const bad of [evil, link, notPdf, noEof, "", "!!!not base64!!!"]) {
        const r = await h.call({ action: "send_report", token, pdf_base64: bad });
        eq(r.status, 400, "bad file refused");
    }
    const big = btoa("%PDF-1.4\n" + "A".repeat(MAX_PDF_BYTES + 10) + "\n%%EOF\n");
    eq((await h.call({ action: "send_report", token, pdf_base64: big })).body.error, "pdf_too_large");
    eq((await h.call({ action: "send_report", token, pdf_base64: PDF })).status, 200, "token still works afterwards");
});

Deno.test("if Resend fails on the report, the token is given back", async () => {
    const h = setup();
    const token = await getToken(h);
    h.state.resendFails = true;
    eq((await h.call({ action: "send_report", token, pdf_base64: PDF })).status, 502);
    h.state.resendFails = false;
    eq((await h.call({ action: "send_report", token, pdf_base64: PDF })).status, 200, "retry works without re-verifying");
});

Deno.test("if Resend fails on the code, the user is told", async () => {
    const h = setup({ resendFails: true });
    const r = await h.call({ action: "send_code", email: EMAIL });
    eq(r.status, 502); eq(r.body.error, "send_failed");
});

Deno.test("Turnstile: skipped only when no secret is set, enforced when it is", async () => {
    const off = setup();
    eq((await off.call({ action: "send_code", email: EMAIL })).status, 200, "no secret: check skipped");

    const on = setup({ turnstileSecret: "secret" });
    eq((await on.call({ action: "send_code", email: EMAIL })).body.error, "bot_check", "no token");
    eq((await on.call({ action: "send_code", email: EMAIL, turnstile: "bad" })).body.error, "bot_check", "bad token");
    eq((await on.call({ action: "send_code", email: EMAIL, turnstile: "good" })).status, 200, "good token");
    eq(on.sent.length, 1, "only the good one sent an email");
});

Deno.test("stored codes and tokens are hashes, never the real values", async () => {
    const h = setup();
    const token = await getToken(h);
    const code = codeFrom(h.sent[0]);
    const dump = JSON.stringify([h.t("report_otps"), h.t("report_tokens")]);
    ok(!dump.includes(code), "plain code is not stored");
    ok(!dump.includes(token), "plain token is not stored");
    ok(!dump.includes("203.0.113.7"), "plain IP is not stored");
});

Deno.test("CORS: allowed origins are echoed, others get none, OPTIONS answers", async () => {
    const h = setup();
    const allowed = await h.call({ action: "dance" }, { origin: "https://designwallet.in" });
    eq(allowed.res.headers.get("access-control-allow-origin"), "https://designwallet.in");
    const other = await h.call({ action: "dance" }, { origin: "https://evil.example" });
    eq(other.res.headers.get("access-control-allow-origin"), null);
    const pre = await h.handler(new Request("https://x/", { method: "OPTIONS", headers: { origin: "https://designwallet.in" } }));
    eq(pre.status, 204);
    eq((await h.handler(new Request("https://x/", { method: "GET" }))).status, 405);
});

Deno.test("text from the browser is sanitised before it reaches an email", () => {
    const hostile = clean("<script>alert(1)</script>\"><img src=x onerror=1>Product Designer", 80, "x");
    ok(!/[<>"=]/.test(hostile), "no angle brackets, quotes or equals signs survive: " + hostile);
    ok(hostile.includes("Product Designer"));
    eq(clean("UI/UX Designer", 60, "x"), "UI/UX Designer", "slash is allowed for UI/UX");
    eq(clean("   ", 10, "fallback"), "fallback");
    eq(clean("A".repeat(100), 10, "x").length, 10);
    eq(clean("Bengaluru · ₹24 LPA", 60, "x"), "Bengaluru · ₹24 LPA");
    eq(safeFilename("../../etc/passwd"), "design-wallet-salary-report.pdf");
    eq(safeFilename("design-wallet-salary-product-designer-senior.pdf"), "design-wallet-salary-product-designer-senior.pdf");
    eq(checkPdf(PDF), "");
});

Deno.test("signed in: no code, the report goes to the session's email, nobody else's", async () => {
    const h = setup();
    // The body names a different address; it must be ignored.
    const r = await h.call({ ...REPORT, email: "victim@example.com", to: "victim@example.com" }, { "x-user-jwt": GOOD_JWT });
    eq(r.status, 200);
    eq(h.sent.length, 1, "one email, no code email");
    eq(h.sent[0].to, ["account@example.com"]);
    eq(h.sent[0].from, "Karthik from Design Wallet <hello@designwallet.in>");
    ok(h.sent[0].attachments![0].filename.endsWith(".pdf"));
    eq(h.sent[0].headers, undefined, "no List-Unsubscribe when the box was not ticked");
    eq(h.t("subscribers").length, 0, "not subscribed unless the box was ticked");
});

Deno.test("signed in: the newsletter only when the box is ticked", async () => {
    const h = setup();
    const r = await h.call({ ...REPORT, newsletter: true }, { "x-user-jwt": GOOD_JWT });
    eq(r.status, 200);
    eq(h.t("subscribers").length, 1);
    eq(h.t("subscribers")[0].email, "account@example.com");
    ok(h.sent[0].headers!["List-Unsubscribe"]);
});

Deno.test("signed in: no session, a bad session or an unconfirmed email is refused and sends nothing", async () => {
    const h = setup();
    eq((await h.call(REPORT)).body.error, "not_signed_in");
    eq((await h.call(REPORT, { "x-user-jwt": "jwt-forged-by-somebody-else" })).status, 401);
    eq((await h.call(REPORT, { "x-user-jwt": "jwt-unconfirmed-designer-001" })).status, 401);
    // The publishable key in Authorization is not a session.
    eq((await h.call(REPORT, { authorization: "Bearer " + GOOD_JWT })).status, 401);
    eq(h.sent.length, 0);
});

Deno.test("signed in: a bad PDF is refused, and sends are rate limited per account", async () => {
    const h = setup();
    eq((await h.call({ ...REPORT, pdf_base64: btoa("hello") }, { "x-user-jwt": GOOD_JWT })).body.error, "bad_pdf");
    for (let i = 0; i < 5; i++) eq((await h.call(REPORT, { "x-user-jwt": GOOD_JWT })).status, 200);
    eq((await h.call(REPORT, { "x-user-jwt": GOOD_JWT })).body.error, "rate_limited");
    h.advance(61 * 60 * 1000);
    eq((await h.call(REPORT, { "x-user-jwt": GOOD_JWT })).status, 200, "the hour passes");
});

Deno.test("signed in: a Resend failure is reported and does not use up the allowance", async () => {
    const h = setup({ resendFails: true });
    eq((await h.call(REPORT, { "x-user-jwt": GOOD_JWT })).body.error, "send_failed");
    eq(h.t("report_tokens").length, 0);
});

Deno.test("an unconfigured function refuses to run", async () => {
    const h = makeHandler({
        db: memoryDb(() => 0).db, fetch, now: () => 0,
        env: { pepper: "", resendKey: "", turnstileSecret: "", origins: [] },
        getUser: () => Promise.resolve(null),
    });
    const res = await h(new Request("https://x/", { method: "POST", body: "{}" }));
    eq(res.status, 500);
});
