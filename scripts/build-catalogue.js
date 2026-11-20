#!/usr/bin/env node
/**
 * build-catalogue.js — static HTML for every catalogue page, so Google gets a
 * real 200 instead of the 404 GitHub Pages sends for 404.html.
 *
 * Until now /category/, /category/<cat>/ and /category/<cat>/<tool>/ existed
 * only because 404.html drew them client-side. GitHub Pages answers those URLs
 * with HTTP 404, so none of them were indexable. This script writes a real file
 * for each:
 *
 *   category/index.html                    the All view
 *   category/<cat>/index.html              one per category
 *   category/<cat>/<tool>/index.html       one per (category, tool) pair
 *
 *   node scripts/build-catalogue.js
 *
 * Every page is the 404.html shell with the right view un-hidden and
 * pre-filled, plus a unique <title>, description, canonical URL, Open Graph
 * tags and JSON-LD (SoftwareApplication / ItemList / BreadcrumbList).
 *
 * DECISIONS (Karthik, 2026-11-20): "do both". The static HTML is for crawlers
 * and first paint; tools/tools.js still runs on load, fetches the live
 * catalogue and re-renders, so a listing added after this build still shows.
 * <html data-prerendered> tells tools.js to leave the title and description
 * alone, because the ones written here are the better SEO copy.
 *
 * A tool in several categories has one page per category (the link a visitor
 * follows depends on the category they were browsing). Every copy names its
 * FIRST category's URL as canonical, and only canonical URLs go in the sitemap.
 *
 * Constants (featured tools, trends, category icons, slug aliases) are read out
 * of tools/tools.js, so there is one source of truth.
 *
 * Data: Supabase `public_tools`, with the same publishable, read-only key the
 * browser uses.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://designwallet.in";
const SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
const DEFAULT_OG = SITE + "/public/illustrations/Meta%20Image.jpg";

// ── Constants shared with tools.js ──────────────────────────────────────────
const TOOLS_JS = fs.readFileSync(path.join(ROOT, "tools/tools.js"), "utf8");
function fromToolsJs(name) {
    const m = TOOLS_JS.match(new RegExp("var " + name + " = ([\\s\\S]*?);\\n"));
    if (!m) throw new Error("Could not find " + name + " in tools/tools.js");
    return vm.runInNewContext("(" + m[1] + ")");
}
const DW_FEATURED = fromToolsJs("DW_FEATURED");
const DW_TRENDS = fromToolsJs("DW_TRENDS");
const CATEGORY_ICONS = fromToolsJs("CATEGORY_ICONS");
const ALIASES = fromToolsJs("CATEGORY_SLUG_ALIASES");

// ── Ports of the small helpers in tools.js ──────────────────────────────────
const esc = (v) => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const slugify = (v) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normCat = (s) => ALIASES[s] || s;
const catHref = (s) => "/category/" + encodeURIComponent(normCat(slugify(s))) + "/";
const parseCats = (v) => String(v || "").split(/[,;]/).map((p) => p.trim()).filter(Boolean);
const initials = (t) => String(t || "").split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase()).join("") || "DW";

function normalizePrice(v) {
    const c = String(v || "").trim().toLowerCase();
    if (!c) return "free";
    if (c.includes("freemium")) return "freemium";
    if (c.includes("paid") || c.includes("premium")) return "paid";
    if (c.includes("free")) return "free";
    return c;
}
const priceClass = (p) => (p === "free" ? "price-free" : p === "freemium" ? "price-freemium" : "price-paid");

function iconUrl(url) {
    if (!url || !url.includes("ik.imagekit.io") || url.includes("tr=")) return url;
    return url + (url.includes("?") ? "&" : "?") + "tr=w-128,h-128,cm-pad_resize,bg-00000000";
}

function addRef(link) {
    try {
        const u = new URL(link);
        if (!u.searchParams.has("ref")) u.searchParams.set("ref", "designwallet");
        u.searchParams.delete("via");
        return u.toString();
    } catch (e) { return link; }
}

function toTool(row) {
    const thumbs = String(row.thumbnails || "").split(/\n+|,\s*(?=https?:\/\/)/).map((p) => p.trim()).filter(Boolean);
    const price = normalizePrice(row.pricing);
    return {
        title: row.title || "",
        subtitle: row.subtitle || row.description || "",
        description: row.description || row.subtitle || "Curated design resource.",
        categories: parseCats(row.categories),
        price,
        priceLabel: price.replace(/-/g, " ").toUpperCase(),
        link: row.link || "",
        icon: row.image || "",
        thumbnails: thumbs,
        platforms: row.platforms || "",
        slug: row.slug || "",
    };
}

function dedupe(tools) {
    const by = {};
    const out = [];
    for (const t of tools) {
        if (!by[t.slug]) { by[t.slug] = t; out.push(t); continue; }
        const e = by[t.slug];
        e.categories = [...new Set(e.categories.concat(t.categories).filter(Boolean))];
        if (!e.icon && t.icon) e.icon = t.icon;
        if (!e.link && t.link) e.link = t.link;
        if (!e.subtitle && t.subtitle) e.subtitle = t.subtitle;
        e.thumbnails = [...new Set(e.thumbnails.concat(t.thumbnails).filter(Boolean))];
    }
    return out;
}

function groupsOf(tools) {
    const g = {};
    for (const t of tools) {
        for (const c of t.categories) {
            const slug = normCat(slugify(c));
            if (!slug) continue;
            (g[slug] ??= { title: c, slug, tools: [] }).tools.push(t);
        }
    }
    return Object.values(g).sort((a, b) => a.title.localeCompare(b.title));
}

const primaryCatSlug = (t) => (t.categories.length ? normCat(slugify(t.categories[0])) : "tools");
const toolPath = (t, catSlug) => catHref(catSlug) + encodeURIComponent(t.slug) + "/";
const byTitle = (a, b) => a.title.localeCompare(b.title);

// ── Markup (mirrors tools.js; tools.js replaces it on load anyway) ─────────
function catIcon(slug, size, fallback) {
    const file = CATEGORY_ICONS[slug];
    if (!file) return fallback;
    const url = "/public/icons/" + file;
    return `<span class="dash-icon-mask" style="width:${size}px;height:${size}px;-webkit-mask-image:url('${url}');mask-image:url('${url}')"></span>`;
}
const GENERIC_ICON = (n) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>`;
const ALL_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

function navRow(label, href, count, active, isAll, slug) {
    const icon = isAll ? ALL_ICON : catIcon(slug, 16, GENERIC_ICON(16));
    return `<a class="dash-nav-row"${active ? ' aria-current="true"' : ""} href="${href}">` +
        `<span class="dash-nav-icon">${icon}</span><span class="dash-nav-label">${esc(label)}</span>` +
        `<span class="dash-nav-count">${count}</span></a>`;
}

function card(tool, catSlug) {
    const logo = tool.icon
        ? `<span class="dash-card-logo"><img src="${esc(iconUrl(tool.icon))}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
        : `<span class="dash-card-logo">${esc(initials(tool.title))}</span>`;
    const dollar = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
    const arrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H8M17 7V16"/></svg>';
    const primary = tool.categories[0] || "";
    const pSlug = primary ? normCat(slugify(primary)) : "";
    const tag = primary
        ? `<a class="dash-card-tag" href="${catHref(pSlug)}">${catIcon(pSlug, 13, GENERIC_ICON(13))}<span>${esc(primary)}</span></a>`
        : "<span></span>";
    const fav = `<button class="dw-fav" type="button" data-fav="${esc(tool.slug)}" data-fav-name="${esc(tool.title)}"></button>`;
    return '<div class="dash-card">' +
        `<a class="dash-card-hit" href="${toolPath(tool, catSlug)}" aria-label="Open ${esc(tool.title)}"></a>` +
        `<div class="dash-card-top">${logo}<div class="dash-card-badges">${fav}<span class="dash-badge ${priceClass(tool.price)}">${dollar}${esc(tool.priceLabel)}</span></div></div>` +
        `<h3 class="dash-card-title">${esc(tool.title)}</h3>` +
        `<p class="dash-card-desc">${esc(tool.description)}</p>` +
        `<div class="dash-card-footer">${tag}<a class="dash-card-visit" href="${esc(addRef(tool.link))}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${esc(tool.title)}">${arrow}</a></div>` +
        "</div>";
}

// ── Page shell: 404.html with fail-loud substitutions ──────────────────────
const SHELL = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");

function sub(html, re, replacement, what) {
    if (!re.test(html)) throw new Error("404.html has changed: could not find " + what);
    return html.replace(re, typeof replacement === "function" ? replacement : () => replacement);
}

// Fill an EMPTY element found by id. Every target in the shell is empty.
function fill(html, id, inner, attrs) {
    const re = new RegExp(`(<(\\w+)([^>]*\\bid="${id}"[^>]*)>)([\\s\\S]*?)(</\\2>)`);
    if (!re.test(html)) throw new Error("404.html has changed: no #" + id);
    return html.replace(re, (_, open, tag, rest, _old, close) =>
        `<${tag}${attrs ? attrs(rest) : rest}>${inner}${close}`);
}

const clip = (s, n) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    if (t.length <= n) return t;
    const cut = t.slice(0, n - 1);
    return cut.slice(0, cut.lastIndexOf(" ") > n * 0.6 ? cut.lastIndexOf(" ") : cut.length).replace(/[,.;:\s-]+$/, "") + "…";
};

const jsonLd = (obj) =>
    `    <script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>\n`;

function shell({ title, description, canonical, ogImage, ogType, ld }) {
    let h = SHELL;
    h = sub(h, /<html lang="en">/, '<html lang="en" data-prerendered>', "<html>");
    h = sub(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`, "<title>");
    h = sub(h, /<meta name="description" content="[^"]*">/,
        `<meta name="description" content="${esc(description)}">\n    <link rel="canonical" href="${canonical}">\n    <meta property="og:url" content="${canonical}">\n    <meta property="og:type" content="${ogType}">`, "description");
    h = sub(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`, "og:title");
    h = sub(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`, "og:description");
    h = sub(h, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(ogImage)}">`, "og:image");
    h = sub(h, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(ogImage)}">`, "twitter:image");
    // The shell hard-codes 1200x630 for the default image only.
    if (ogImage !== DEFAULT_OG) h = h.replace(/\s*<meta property="og:image:(width|height)" content="\d+">/g, "");
    h = sub(h, /<\/head>/, ld.map(jsonLd).join("") + "</head>", "</head>");
    h = sub(h, /<div class="tool-loading" id="tool-loading">/, '<div class="tool-loading" id="tool-loading" hidden>', "#tool-loading");
    return h;
}

function crumbs(items) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it[0], item: SITE + it[1] })),
    };
}

// ── Page: tool ─────────────────────────────────────────────────────────────
function toolPage(tool, catSlug, group, allTools) {
    const canonical = SITE + toolPath(tool, primaryCatSlug(tool));
    const catTitle = (group && group.title) || tool.categories[0] || "Design";
    const tail = `${tool.title} is a ${tool.price} tool in ${catTitle}. Discover it and similar tools on Design Wallet.`;
    const sub1 = String(tool.subtitle || "").trim();
    const desc = clip(sub1.length >= 60 ? sub1 : (sub1 ? sub1.replace(/[.\s]+$/, "") + ". " : "") + tail, 158);
    const image = tool.thumbnails[0] && /^https:/.test(tool.thumbnails[0]) ? tool.thumbnails[0]
        : (tool.icon && /^https:/.test(tool.icon) ? tool.icon : DEFAULT_OG);

    const app = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: tool.title,
        description: tool.subtitle || desc,
        url: canonical,
        image,
        applicationCategory: "DesignApplication",
        operatingSystem: tool.platforms ? tool.platforms.split(",").map((s) => s.trim()).filter(Boolean).join(", ") : "Web",
    };
    // A free tier means a real price of 0. A paid tool's price is unknown, so
    // it gets no offer rather than an invented one.
    if (tool.price === "free" || tool.price === "freemium") {
        app.offers = { "@type": "Offer", price: "0", priceCurrency: "USD" };
    }
    if (tool.link) app.sameAs = tool.link;

    let h = shell({
        title: `${tool.title} — ${catTitle} | Design Wallet`,
        description: desc, canonical, ogImage: image, ogType: "website",
        ld: [app, crumbs([["Categories", "/category/"], [catTitle, catHref(catSlug)], [tool.title, toolPath(tool, catSlug)]])],
    });

    h = sub(h, /<div class="tool-content" id="tool-content" hidden>/, '<div class="tool-content" id="tool-content">', "#tool-content");
    h = sub(h, /(<a href=")\/category\/(" class="tool-back-link")/, (_, a, b) => a + (group ? catHref(catSlug) : "/category/") + b, "back link");

    h = fill(h, "tool-icon", tool.icon
        ? `<img src="${esc(iconUrl(tool.icon))}" alt="${esc(tool.title)}">` : esc(initials(tool.title)),
        tool.icon ? null : (r) => r.replace('class="tool-icon"', 'class="tool-icon tool-icon-fallback"'));
    h = fill(h, "tool-title", esc(tool.title));
    h = fill(h, "tool-subtitle", esc(tool.subtitle));
    h = fill(h, "tool-categories", tool.categories.map((c) => `<span class="tool-tag">${esc(c)}</span>`).join(""));
    h = sub(h, /(<a class="tool-visit-btn" id="tool-visit-btn" href=")#(")/, (_, a, b) => a + esc(addRef(tool.link)) + b, "visit button");

    const shots = tool.thumbnails;
    h = fill(h, "tool-screenshot",
        shots.map((src, i) => `<img src="${esc(src)}" alt="${esc(tool.title)} screenshot${i ? " " + (i + 1) : ""}" loading="lazy">`).join(""),
        (r) => r.replace('class="tool-screenshot"', `class="tool-screenshot${shots.length > 1 ? " is-gallery" : ""}"`) + (shots.length ? "" : " hidden"));

    // Prev / next stay inside THIS category, A to Z. (tools.js walks the whole
    // catalogue in database order, which here would link a 3D tool to a tool
    // that has no page under /category/3d-tools/ - a 404 for every crawler.)
    const peers = group ? group.tools.slice().sort(byTitle) : [];
    const i = peers.findIndex((t) => t.slug === tool.slug);
    const prev = i > 0 ? peers[i - 1] : null;
    const next = i !== -1 && i < peers.length - 1 ? peers[i + 1] : null;
    const link = (id, nameId, t) => {
        h = sub(h, new RegExp(`(<a class="tool-nav-link tool-nav-${id}" id="tool-${id}" href=")#(")`),
            (_, a, b) => a + (t ? toolPath(t, catSlug) + b : '#' + b + ' style="visibility:hidden"'), "#tool-" + id);
        h = fill(h, nameId, t ? esc(t.title) : "");
    };
    link("prev", "tool-prev-name", prev);
    link("next", "tool-next-name", next);
    return h;
}

// ── Page: category and All ─────────────────────────────────────────────────
function trendsMarkup(groups, selected) {
    const by = Object.fromEntries(groups.map((g) => [g.slug, g]));
    return DW_TRENDS.filter((t) => by[t.slug]).map((t) =>
        navRow(t.label, catHref(t.slug), by[t.slug].tools.length, t.slug === selected, false, t.slug)).join("");
}

function categoryIntro(group) {
    const sorted = group.tools.slice().sort((a, b) => {
        const fa = DW_FEATURED.includes(a.slug) ? 0 : 1, fb = DW_FEATURED.includes(b.slug) ? 0 : 1;
        return fa - fb || byTitle(a, b);
    });
    // Strip a trailing tagline and any trailing full stop ("Colorkit Co." would
    // otherwise end the sentence with "..").
    const names = sorted.slice(0, 3).map((t) => t.title.replace(/\s+[-–—|:].*$/, "").replace(/\.+$/, ""));
    const list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0];
    // No counts anywhere in the copy (Karthik, 2026-11-20): a small number
    // makes a small category look thin. Name the price types present instead.
    const kinds = ["free", "freemium", "paid"].filter((p) => group.tools.some((t) => t.price === p));
    const kindText = kinds.length > 1 ? kinds.slice(0, -1).join(", ") + " and " + kinds[kinds.length - 1] : kinds[0];
    const cap = kindText ? kindText.charAt(0).toUpperCase() + kindText.slice(1) : "";
    return `Curated ${group.title} in Design Wallet, including ${list}. ` +
        (cap ? `${cap} options, ` : "") + "hand-picked for working designers.";
}

function dashboardPage(groups, allTools, group) {
    const selected = group ? group.slug : "";
    const canonical = SITE + (group ? catHref(group.slug) : "/category/");
    const intro = group ? categoryIntro(group) : "";
    const title = group ? `Browse curated tools in ${group.title} | Design Wallet`
        : "Curated design tools by category | Design Wallet";
    const description = group ? clip(intro, 158)
        : "Curated design tools in Design Wallet, by category: AI, prototyping, icons, fonts, inspiration and more. Free to explore.";

    const list = group ? group.tools.slice().sort(byTitle)
        : DW_FEATURED.map((s) => allTools.find((t) => t.slug === s)).filter(Boolean);

    const ld = [];
    if (group) {
        ld.push({
            "@context": "https://schema.org", "@type": "CollectionPage",
            name: group.title, description: intro, url: canonical,
            mainEntity: {
                "@type": "ItemList", numberOfItems: group.tools.length,
                itemListElement: list.map((t, i) => ({
                    "@type": "ListItem", position: i + 1, name: t.title, url: SITE + toolPath(t, group.slug),
                })),
            },
        });
        ld.push(crumbs([["Categories", "/category/"], [group.title, catHref(group.slug)]]));
    } else {
        ld.push({
            "@context": "https://schema.org", "@type": "CollectionPage", name: "Design tools by category", url: canonical,
            mainEntity: {
                "@type": "ItemList", numberOfItems: groups.length,
                itemListElement: groups.map((g, i) => ({
                    "@type": "ListItem", position: i + 1, name: g.title, url: SITE + catHref(g.slug),
                })),
            },
        });
    }

    let h = shell({ title, description, canonical, ogImage: DEFAULT_OG, ogType: "website", ld });
    h = sub(h, /<body>/, '<body class="is-dashboard">', "<body>");
    h = sub(h, /<div class="dashboard" id="dashboard-view" hidden>/, '<div class="dashboard" id="dashboard-view">', "#dashboard-view");

    const trends = trendsMarkup(groups, selected);
    if (trends) {
        h = sub(h, /(<div class="dash-trends-section" id="dash-trends-section") hidden>/, (_, a) => a + ">", "trends section");
        h = fill(h, "dash-trends", trends);
    }
    h = fill(h, "dash-nav", navRow("All", "/category/", allTools.length, !selected, true) +
        groups.map((g) => navRow(g.title, catHref(g.slug), g.tools.length, g.slug === selected, false, g.slug)).join(""));
    h = fill(h, "dash-title", esc(group ? group.title : "All Tools"));
    h = fill(h, "dash-count", group ? `${group.tools.length} tool${group.tools.length === 1 ? "" : "s"}` : "");
    h = fill(h, "dash-grid", list.map((t) => card(t, group ? group.slug : primaryCatSlug(t))).join(""));
    if (group) {
        // On a category page the hero says what the page is, not what the site
        // is (Karthik, 2026-11-20). The headline is the page title and the
        // sub-copy is the intro, so the search snippet, the <title> and what
        // the visitor reads all agree. The heading under the search bar
        // becomes an <h2> so the page keeps a single <h1>.
        h = sub(h, /<h1>All-in-one design library for curious designers\.<\/h1>/, `<h1>${esc("Browse curated tools in " + group.title)}</h1>`, "hero h1");
        h = sub(h, /<p class="dash-hero-copy">[^<]*<\/p>/, `<p class="dash-hero-copy">${esc(intro)}</p>`, "hero copy");
        h = sub(h, /<h1 id="dash-title">([^<]*)<\/h1>/, (_, t) => `<h2 id="dash-title">${t}</h2>`, "#dash-title");
    }
    return h;
}

// ── Output ─────────────────────────────────────────────────────────────────
function write(rel, html) {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
}

async function main() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/public_tools?select=*&limit=5000`, { headers: { apikey: SUPABASE_KEY } });
    if (!res.ok) throw new Error("Supabase responded " + res.status);
    const rows = await res.json();
    if (rows.length >= 5000) console.warn("Hit the 5000-row ceiling; raise the limit.");

    const tools = dedupe(rows.map(toTool).filter((t) => t.title && t.slug));
    if (tools.length < 100) throw new Error("Only " + tools.length + " tools came back; refusing to overwrite the pages.");

    // A scraped bot-check page saved as a tool name would be indexed as-is.
    const BOT = /just a moment|attention required|security checkpoint|access denied|checking your browser|are you a robot/i;
    const bad = tools.filter((t) => BOT.test(t.title));
    if (bad.length) console.warn("Bot-check titles skipped:", bad.map((t) => t.slug).join(", "));
    const clean = tools.filter((t) => !BOT.test(t.title));

    const groups = groupsOf(clean);
    const bySlug = Object.fromEntries(groups.map((g) => [g.slug, g]));

    // The whole directory is generated, so clear it to drop pages for tools
    // that have since been removed.
    fs.rmSync(path.join(ROOT, "category"), { recursive: true, force: true });

    write("category/index.html", dashboardPage(groups, clean, null));
    let pages = 1;
    for (const g of groups) { write(`category/${g.slug}/index.html`, dashboardPage(groups, clean, g)); pages++; }

    const urls = ["/category/", ...groups.map((g) => catHref(g.slug))];
    for (const t of clean) {
        const slugs = t.categories.length ? [...new Set(t.categories.map((c) => normCat(slugify(c))))] : ["tools"];
        for (const s of slugs) {
            write(`category/${s}/${t.slug}/index.html`, toolPage(t, s, bySlug[s], clean));
            pages++;
        }
        urls.push(toolPath(t, primaryCatSlug(t)));
    }

    // Sitemap: replace the generated block, and drop /tools/ (replaced by /category/).
    const smPath = path.join(ROOT, "sitemap.xml");
    let sm = fs.readFileSync(smPath, "utf8");
    sm = sm.replace(/  <url>\s*<loc>https:\/\/designwallet\.in\/tools\/<\/loc>[\s\S]*?<\/url>\n/, "");
    const entry = (u) => {
        const top = u === "/category/";
        const kind = top ? ["daily", "0.9"] : u.split("/").filter(Boolean).length === 2 ? ["weekly", "0.7"] : ["monthly", "0.5"];
        return `  <url>\n    <loc>${SITE}${u}</loc>\n    <changefreq>${kind[0]}</changefreq>\n    <priority>${kind[1]}</priority>\n  </url>\n`;
    };
    const block = "  <!-- CATALOGUE-PAGES:START (scripts/build-catalogue.js) -->\n" + urls.map(entry).join("") + "  <!-- CATALOGUE-PAGES:END -->\n";
    if (sm.includes("CATALOGUE-PAGES:START")) {
        sm = sm.replace(/  <!-- CATALOGUE-PAGES:START[\s\S]*?CATALOGUE-PAGES:END -->\n/, block);
    } else {
        sm = sm.replace("</urlset>", block + "</urlset>");
    }
    sm = sm.replace(/  \/category\/\* routes are served by 404\.html client-side rather than existing as\n  files, so they are not listed\./,
        "  /category/ pages are generated by scripts/build-catalogue.js.");
    fs.writeFileSync(smPath, sm);

    console.log(`${clean.length} tools, ${groups.length} categories -> ${pages} pages, ${urls.length} sitemap URLs`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
