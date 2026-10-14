// brandkit-fetch — a CORS relay for the Website Brandkit Generator.
//
// A page on designwallet.in cannot read another site's HTML or CSS: the browser
// blocks it. This function fetches the page on the tool's behalf and hands the
// text back with CORS headers. All the colour and font analysis stays in the
// browser (dw-tools/brandkit-generator/brandkit.js); this only relays.
//
// Deploy:   supabase functions deploy brandkit-fetch --no-verify-jwt   (redeploy after any change)
// Local:    deno run --allow-net --allow-env supabase/functions/brandkit-fetch/index.ts
//
// `--no-verify-jwt` because the publishable key is not a JWT. The function is
// therefore public, which is why it refuses everything that is not a plain,
// public, text GET — see the guards below.

const MAX_BYTES = 2_000_000;
// Images and font files are bigger than CSS; `raw=1` mode allows them.
const MAX_RAW_BYTES = 8_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    });
}

function isPrivateIPv4(ip: string): boolean {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    return (
        p[0] === 0 || p[0] === 10 || p[0] === 127 ||
        (p[0] === 169 && p[1] === 254) ||
        (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
        (p[0] === 192 && p[1] === 168) ||
        (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
        p[0] >= 224
    );
}

function isPrivateIPv6(ip: string): boolean {
    const v = ip.toLowerCase();
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") ||
        v.startsWith("fe80") || v.startsWith("::ffff:");
}

// A relay that fetches whatever URL it is given is a gift to anyone probing the
// network behind it. Resolve the name ourselves and refuse private ranges.
async function assertPublic(url: URL): Promise<void> {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) links work.");
    if (url.username || url.password) throw new Error("Links with credentials are refused.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!host.includes(".") && !host.includes(":")) throw new Error("That does not look like a website.");
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        if (isPrivateIPv4(host)) throw new Error("That address is not public.");
        return;
    }
    if (host.includes(":")) {
        if (isPrivateIPv6(host)) throw new Error("That address is not public.");
        return;
    }
    const v4 = await Deno.resolveDns(host, "A").catch(() => [] as string[]);
    const v6 = await Deno.resolveDns(host, "AAAA").catch(() => [] as string[]);
    if (!v4.length && !v6.length) throw new Error("That domain does not resolve.");
    if (v4.some(isPrivateIPv4) || v6.some(isPrivateIPv6)) throw new Error("That address is not public.");
}

async function readBytes(res: Response, limit: number): Promise<Uint8Array> {
    const reader = res.body?.getReader();
    if (!reader) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
            await reader.cancel();
            throw new Error("That file is too large to read.");
        }
        chunks.push(value);
    }
    const all = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
    return all;
}

// Follow redirects by hand so every hop is checked, and hand back the response
// unread: the text and raw paths accept different content types and sizes.
async function fetchSafe(target: URL): Promise<{ url: string; res: Response }> {
    let current = target;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await assertPublic(current);
        const res = await fetch(current.href, {
            redirect: "manual",
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; DesignWalletBrandkit/1.0; +https://designwallet.in)",
                "Accept": "text/html,text/css,image/*,font/*,*/*;q=0.8",
            },
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
            await res.body?.cancel();
            current = new URL(res.headers.get("location")!, current);
            continue; // every hop is re-checked, so a redirect cannot reach inside
        }
        return { url: current.href, res };
    }
    throw new Error("Too many redirects.");
}

async function relayText(target: URL): Promise<{ url: string; status: number; contentType: string; body: string }> {
    const { url, res } = await fetchSafe(target);
    const contentType = res.headers.get("content-type") || "";
    if (!/text\/|css|html|xml|json/i.test(contentType)) {
        await res.body?.cancel();
        throw new Error("That link is not a web page.");
    }
    const bytes = await readBytes(res, MAX_BYTES);
    return { url, status: res.status, contentType, body: new TextDecoder("utf-8").decode(bytes) };
}

// Images and fonts, for the brandkit download. Anything else is refused, so this
// cannot be used to pull arbitrary files through the relay.
const RAW_TYPES = /^(image\/|font\/|application\/(font|x-font|vnd\.ms-fontobject|octet-stream)|binary\/octet-stream)/i;

async function relayRaw(target: URL): Promise<Response> {
    const { res } = await fetchSafe(target);
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
        await res.body?.cancel();
        throw new Error("That file could not be fetched (" + res.status + ").");
    }
    if (!RAW_TYPES.test(contentType)) {
        await res.body?.cancel();
        throw new Error("That file is not an image or a font.");
    }
    const bytes = await readBytes(res, MAX_RAW_BYTES);
    return new Response(bytes.buffer as ArrayBuffer, { // exact-size buffer, see readBytes
        status: 200,
        headers: { ...CORS, "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
}

export async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET") return json({ error: "GET only." }, 405);

    const params = new URL(req.url).searchParams;
    const raw = params.get("url");
    if (!raw) return json({ error: "Missing ?url=" }, 400);

    let target: URL;
    try { target = new URL(raw); } catch { return json({ error: "That is not a valid link." }, 400); }

    try {
        return params.get("raw") === "1" ? await relayRaw(target) : json(await relayText(target));
    } catch (err) {
        const message = err instanceof Error ? err.message : "Could not fetch that link.";
        return json({ error: message }, 502);
    }
}

// Supabase sets SUPABASE_URL for every hosted function; its absence means a
// local `deno run`, which serves on :8787 (the port brandkit.js uses on localhost).
if (Deno.env.get("SUPABASE_URL")) {
    Deno.serve(handler);
} else {
    Deno.serve({ port: 8787 }, handler);
}
