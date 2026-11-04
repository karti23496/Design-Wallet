/**
 * changelog-live.js — redraws the changelog from Notion on every visit.
 *
 * The versions in the HTML come from the last build. This asks the
 * changelog-feed function for the Published versions as they are in Notion
 * right now, and swaps them in if anything differs, so an edit in Notion
 * shows here within about 30 seconds (the function's cache). It checks again
 * when you come back to the tab. If the feed can't be reached, the built
 * versions simply stay.
 */

import { renderChangelog } from "/changelog/changelog-render.js?v=20261101-1";

// The deployed function, locally too (it allows any origin). To test changes
// to the function itself, run it on port 8788 (see its header) and point
// this at http://localhost:8788/.
const FEED = "https://ugjtyuikvdeymwsfsgfl.supabase.co/functions/v1/changelog-feed";
const KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";

// The generated versions sit between two comments in <main>.
function markers() {
    const main = document.querySelector(".cl-main");
    let start = null;
    let end = null;
    for (const node of main.childNodes) {
        if (node.nodeType !== Node.COMMENT_NODE) continue;
        if (node.data.trim() === "changelog:start") start = node;
        if (node.data.trim() === "changelog:end") end = node;
    }
    return start && end ? { main, start, end } : null;
}

const squash = (html) => html.replace(/\s+/g, " ").replace(/> </g, "><").trim();

async function refresh() {
    const m = markers();
    if (!m) return;
    let versions;
    try {
        const res = await fetch(FEED, { headers: { apikey: KEY }, cache: "no-store" });
        if (!res.ok) return;
        ({ versions } = await res.json());
    } catch {
        return;
    }
    if (!Array.isArray(versions) || !versions.length) return;

    const html = renderChangelog(versions);
    let current = "";
    for (let n = m.start.nextSibling; n && n !== m.end; n = n.nextSibling) current += n.outerHTML || n.textContent || "";
    if (squash(current) === squash(html)) return;

    while (m.start.nextSibling && m.start.nextSibling !== m.end) m.start.nextSibling.remove();
    m.start.after(document.createRange().createContextualFragment(html));

    // Opened at a version's link (#v3-0)? Keep it in view after the redraw.
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

refresh();
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
});
