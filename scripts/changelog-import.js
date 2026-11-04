/**
 * changelog-import.js — ONE-TIME: copy the versions already on
 * changelog/index.html into a new Notion Changelog database, and mark the
 * generated part of the page with the changelog:start / changelog:end
 * markers that build-changelog.js fills.
 *
 * Run: node scripts/changelog-import.js --dry-run
 *        parses the page and checks that rendering it back changes nothing
 *        visible; touches neither Notion nor the page.
 *      node scripts/changelog-import.js
 *        creates the database inside the Notion page NOTION_CHANGELOG_PAGE_ID
 *        (shared with the integration) and prints its id for
 *        NOTION_CHANGELOG_DATABASE_ID.
 *
 * Versions listed in DRAFTS are imported as Draft (not yet released).
 */

import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { START, END, renderChangelog } from "./changelog-lib.js";
import { PROPERTIES, toNotionPage } from "./changelog-notion.js";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "changelog/index.html");
const DRAFTS = ["v3.0"];
const dryRun = process.argv.includes("--dry-run");

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attr = (tag, name) => {
    const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
    return m ? unescape(m[1]) : null;
};

/** Inline HTML (strong, em, u, a) → rich text runs. */
function parseRich(html) {
    const runs = [];
    const state = { bold: 0, italic: 0, underline: 0, href: null };
    for (const part of html.split(/(<[^>]+>)/)) {
        if (!part) continue;
        if (part.startsWith("<")) {
            const close = part.startsWith("</");
            const name = /^<\/?([a-z0-9]+)/i.exec(part)[1].toLowerCase();
            if (name === "strong" || name === "b") state.bold += close ? -1 : 1;
            else if (name === "em" || name === "i") state.italic += close ? -1 : 1;
            else if (name === "u") state.underline += close ? -1 : 1;
            else if (name === "a") state.href = close ? null : attr(part, "href");
            continue;
        }
        const text = unescape(part.replace(/\s+/g, " "));
        const prev = runs[runs.length - 1];
        const run = { text, bold: state.bold > 0, italic: state.italic > 0, underline: state.underline > 0, href: state.href };
        if (prev && prev.bold === run.bold && prev.italic === run.italic && prev.underline === run.underline && prev.href === run.href) prev.text += text;
        else runs.push(run);
    }
    return runs;
}

function parseFigure(html) {
    const link = /<a class="cl-shot-link"[^>]*>/.exec(html);
    const img = /<img [^>]*>/.exec(html)[0];
    return {
        src: attr(img, "src"),
        alt: attr(img, "alt") || "",
        href: link ? attr(link[0], "href") : null,
        label: link ? attr(link[0], "aria-label") : null,
    };
}

function parsePage(page) {
    const entries = [];
    const sections = page.split(/<section class="cl-major" id="version-/).slice(1);
    for (const section of sections) {
        const majorName = (/<span class="cl-major-name">([^<]*)<\/span>/.exec(section) || [])[1] || "";
        for (const li of section.split(/<li class="cl-entry"/).slice(1)) {
            const version = /<span class="cl-version">([^<]+)<\/span>/.exec(li)[1];
            const head = li.slice(0, li.indexOf('<div class="cl-desc">'));
            const shotHtml = /<figure class="cl-shot">[\s\S]*?<\/figure>/.exec(head);
            const desc = /<div class="cl-desc">([\s\S]*?)<\/div>\s*<\/article>/.exec(li)[1];
            const blocks = [];
            const re = /<p>([\s\S]*?)<\/p>|<h4 class="cl-subhead">([\s\S]*?)<\/h4>|<ul>([\s\S]*?)<\/ul>|<figure class="cl-shot cl-shot--natural">([\s\S]*?)<\/figure>/g;
            let m;
            while ((m = re.exec(desc))) {
                if (m[1] !== undefined) blocks.push({ type: "p", rich: parseRich(m[1].trim()) });
                else if (m[2] !== undefined) blocks.push({ type: "h4", rich: parseRich(m[2].trim()) });
                else if (m[3] !== undefined) {
                    const items = [...m[3].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => parseRich(x[1].trim()));
                    if (items.length) blocks.push({ type: "ul", items }); // empty lists are dropped
                } else blocks.push({ type: "img", ...parseFigure(m[4]) });
            }
            entries.push({
                version,
                majorName,
                date: /<time datetime="([^"]+)"/.exec(li)[1],
                through: /data-through="([^"]+)"/.exec(li)[1],
                title: unescape(/<h3 class="cl-title"><a [^>]*>([\s\S]*?)<\/a><\/h3>/.exec(li)[1]),
                status: DRAFTS.includes(version) ? "Draft" : "Published",
                shot: shotHtml ? parseFigure(shotHtml[0]) : null,
                blocks,
            });
        }
    }
    return entries;
}

let page = fs.readFileSync(FILE, "utf8");
const entries = parsePage(page);
console.log(`Parsed ${entries.length} versions: ${entries.map((e) => e.version).join(", ")}`);

// Round-trip check: the page rebuilt from what was parsed, ignoring
// whitespace, the empty <ul>s that are dropped, and screenshot-link
// aria-labels (body images lose theirs: their alt text names the link now).
const norm = (s) => s.replace(/<ul>\s*<\/ul>/g, "").replace(/(<a class="cl-shot-link"[^>]*?) aria-label="[^"]*"/g, "$1").replace(/\s+/g, " ").replace(/> </g, "><").trim();
const firstSection = page.indexOf('<section class="cl-major" id="version-');
const lastSection = page.lastIndexOf("</section>") + "</section>".length;
const a = norm(page.slice(firstSection, lastSection));
const b = norm(renderChangelog(entries, ROOT));
if (a !== b) {
    let i = 0;
    while (a[i] === b[i]) i += 1;
    console.error("Round-trip differs at " + i + ":\n  page:    …" + a.slice(Math.max(0, i - 80), i + 120) + "\n  rebuilt: …" + b.slice(Math.max(0, i - 80), i + 120));
    process.exit(1);
}
console.log("✓ Rendering the parsed versions reproduces the page.");

if (dryRun) {
    fs.writeFileSync(path.join(ROOT, "changelog-import.dry-run.json"), JSON.stringify(entries, null, 2));
    console.log("Dry run: wrote changelog-import.dry-run.json; Notion and the page are untouched.");
    process.exit(0);
}

const pageId = process.env.NOTION_CHANGELOG_PAGE_ID;
if (!process.env.NOTION_API_KEY || !pageId) {
    console.error("Missing NOTION_API_KEY or NOTION_CHANGELOG_PAGE_ID.");
    process.exit(1);
}
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const db = await notion.databases.create({
    parent: { type: "page_id", page_id: pageId },
    title: [{ type: "text", text: { content: "Changelog" } }],
    properties: PROPERTIES,
});
console.log(`✓ Created the Changelog database: ${db.id}`);

// Oldest first, so Notion's default order reads as a history.
for (const entry of [...entries].reverse()) {
    const { properties, children } = toNotionPage(entry);
    await notion.pages.create({ parent: { database_id: db.id }, properties, children });
    console.log(`  + ${entry.version} (${entry.status})`);
}

// Mark the generated part of the page for build-changelog.js.
if (!page.includes(START)) {
    page = page.slice(0, firstSection) + START + "\n" + page.slice(firstSection, lastSection) + "\n            " + END + page.slice(lastSection);
    fs.writeFileSync(FILE, page);
    console.log("✓ Added the changelog:start / changelog:end markers to changelog/index.html");
}
console.log(`\nAdd to .env:  NOTION_CHANGELOG_DATABASE_ID=${db.id}`);
