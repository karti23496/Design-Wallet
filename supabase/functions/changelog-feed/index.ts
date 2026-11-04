// changelog-feed — the changelog's Published versions, read live from Notion.
//
// /changelog/ redraws itself from this on every visit
// (changelog/changelog-live.js), so an edit in the Notion Changelog database
// shows on the site within about 30 seconds, with no build or deploy. The
// build (scripts/build-changelog.js) still writes the same versions into the
// HTML, so the page has content before any script runs and for search engines.
//
// The Notion key stays here, as a secret; the browser never sees it. Only rows
// with Status "Published" are returned. Uploaded Notion images come back with
// their signed links, which expire after an hour; the 30-second cache keeps
// them fresh.
//
// Secrets:  supabase secrets set NOTION_API_KEY=… NOTION_CHANGELOG_DATABASE_ID=…
// Deploy:   supabase functions deploy changelog-feed --no-verify-jwt   (redeploy after any change)
// Local:    CHANGELOG_FEED_PORT=8788 deno run --allow-net --allow-env --env-file=.env supabase/functions/changelog-feed/index.ts
//
// `--no-verify-jwt` because the publishable key is not a JWT. The function is
// public and read-only: it answers GET with the published changelog and nothing else.
//
// Notion rows → versions mirrors fromNotionPage() in scripts/changelog-notion.js;
// keep the two in step.

const NOTION = "https://api.notion.com/v1";
const SITE = "https://designwallet.in";
const CACHE_MS = 30_000;

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" },
    });
}

// deno-lint-ignore no-explicit-any
type Any = any;

async function notion(path: string, body?: unknown): Promise<Any> {
    const res = await fetch(NOTION + path, {
        method: body ? "POST" : "GET",
        headers: {
            "Authorization": `Bearer ${Deno.env.get("NOTION_API_KEY")}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Notion ${res.status} on ${path}`);
    return res.json();
}

const plain = (rich: Any[] = []) => rich.map((r) => r.plain_text).join("");
const relative = (href: string | null) => (href && href.startsWith(SITE + "/") ? href.slice(SITE.length) : href);
const runs = (rich: Any[] = []) =>
    rich.map((r) => ({
        text: r.plain_text,
        bold: r.annotations.bold,
        italic: r.annotations.italic,
        underline: r.annotations.underline,
        href: r.href ? relative(r.href) : null,
    }));

async function children(id: string): Promise<Any[]> {
    const out: Any[] = [];
    let cursor: string | undefined;
    do {
        const res = await notion(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
        out.push(...res.results);
        cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
}

async function toVersion(page: Any) {
    const p = page.properties;
    const shotSrc = plain(p.Screenshot?.rich_text).trim();
    const blocks: Any[] = [];
    for (const block of await children(page.id)) {
        const last = blocks[blocks.length - 1];
        const t = block.type;
        if (t === "paragraph") {
            if (plain(block.paragraph.rich_text).trim()) blocks.push({ type: "p", rich: runs(block.paragraph.rich_text) });
        } else if (t === "bulleted_list_item" || t === "numbered_list_item") {
            const item = runs(block[t].rich_text);
            if (last && last.type === "ul") last.items.push(item);
            else blocks.push({ type: "ul", items: [item] });
        } else if (t === "heading_1" || t === "heading_2" || t === "heading_3") {
            blocks.push({ type: "h4", rich: runs(block[t].rich_text) });
        } else if (t === "image") {
            const caption = block.image.caption || [];
            const link = caption.find((r: Any) => r.href);
            const src = block.image.type === "external" ? relative(block.image.external.url) : block.image.file.url;
            blocks.push({ type: "img", src, alt: plain(caption).trim(), href: link ? relative(link.href) : null });
        }
    }
    return {
        version: plain(p.Version?.rich_text).trim(),
        majorName: plain(p["Major name"]?.rich_text).trim(),
        date: p.Date?.date?.start,
        through: p["Covers through"]?.date?.start || p.Date?.date?.start,
        title: plain(p.Title?.title).trim(),
        status: "Published",
        shot: shotSrc
            ? {
                src: shotSrc,
                href: plain(p["Screenshot link"]?.rich_text).trim() || null,
                alt: plain(p["Screenshot alt"]?.rich_text).trim(),
                label: plain(p["Screenshot label"]?.rich_text).trim() || null,
            }
            : null,
        blocks,
    };
}

async function load() {
    const rows: Any[] = [];
    let cursor: string | undefined;
    do {
        const res = await notion(`/databases/${Deno.env.get("NOTION_CHANGELOG_DATABASE_ID")}/query`, {
            filter: { property: "Status", select: { equals: "Published" } },
            page_size: 100,
            ...(cursor ? { start_cursor: cursor } : {}),
        });
        rows.push(...res.results);
        cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    const versions = await Promise.all(rows.map(toVersion));
    // A row still being filled in (no version, date or title yet) is left out.
    return versions.filter((v) => /^v\d+\.\d+$/.test(v.version) && v.date && v.title);
}

let cache: { at: number; versions: unknown[] } | null = null;

// Supabase serves on its own port; CHANGELOG_FEED_PORT is only for running it locally.
Deno.serve({ port: Number(Deno.env.get("CHANGELOG_FEED_PORT") || 8000) }, async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "GET") return json({ error: "Only GET." }, 405);
    try {
        if (!cache || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), versions: await load() };
        return json({ versions: cache.versions });
    } catch (e) {
        // Notion is down or rate-limiting: serve the last good copy if there is one.
        if (cache) return json({ versions: cache.versions, stale: true });
        return json({ error: (e as Error).message }, 502);
    }
});
