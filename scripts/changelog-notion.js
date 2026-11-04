/**
 * changelog-notion.js — the Notion side of the changelog: the database's
 * columns, and converting a version to and from Notion rows and blocks.
 * Used by build-changelog.js (Notion → page) and changelog-import.js
 * (page → Notion, once).
 */

import fs from "node:fs";
import path from "node:path";
import { toAbsolute, toRelative } from "./changelog-lib.js";

/** The database's columns. "Title" is the version's headline. */
export const PROPERTIES = {
    Title: { title: {} },
    Version: { rich_text: {} },
    "Major name": { rich_text: {} },
    Date: { date: {} },
    "Covers through": { date: {} },
    Status: { select: { options: [{ name: "Draft", color: "yellow" }, { name: "Published", color: "green" }] } },
    Screenshot: { rich_text: {} },
    "Screenshot link": { rich_text: {} },
    "Screenshot alt": { rich_text: {} },
    "Screenshot label": { rich_text: {} },
};

const text = (s) => (s ? [{ type: "text", text: { content: s } }] : []);
const plain = (rich) => (rich || []).map((r) => r.plain_text).join("");

function toNotionRich(rich) {
    return rich.map((run) => ({
        type: "text",
        text: { content: run.text, link: run.href ? { url: toAbsolute(run.href) } : null },
        annotations: { bold: !!run.bold, italic: !!run.italic, underline: !!run.underline },
    }));
}

function fromNotionRich(rich) {
    return (rich || []).map((r) => ({
        text: r.plain_text,
        bold: r.annotations.bold,
        italic: r.annotations.italic,
        underline: r.annotations.underline,
        href: r.href ? toRelative(r.href) : null,
    }));
}

/** A version → the properties and body for a new Notion row. */
export function toNotionPage(entry) {
    const shot = entry.shot || {};
    const properties = {
        Title: { title: text(entry.title) },
        Version: { rich_text: text(entry.version) },
        "Major name": { rich_text: text(entry.majorName) },
        Date: { date: { start: entry.date } },
        "Covers through": { date: { start: entry.through } },
        Status: { select: { name: entry.status } },
        Screenshot: { rich_text: text(shot.src) },
        "Screenshot link": { rich_text: text(shot.href) },
        "Screenshot alt": { rich_text: text(shot.alt) },
        "Screenshot label": { rich_text: text(shot.label) },
    };
    const children = [];
    for (const block of entry.blocks) {
        if (block.type === "p") children.push({ paragraph: { rich_text: toNotionRich(block.rich) } });
        else if (block.type === "h4") children.push({ heading_3: { rich_text: toNotionRich(block.rich) } });
        else if (block.type === "ul") for (const item of block.items) children.push({ bulleted_list_item: { rich_text: toNotionRich(item) } });
        else if (block.type === "img") {
            // The caption is the alt text, linked to the page the image opens.
            children.push({
                image: {
                    type: "external",
                    external: { url: toAbsolute(block.src) },
                    caption: toNotionRich([{ text: block.alt || "", href: block.href }]),
                },
            });
        }
    }
    return { properties, children };
}

async function allChildren(notion, blockId) {
    const out = [];
    let cursor;
    do {
        const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
        out.push(...res.results);
        cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
}

/** Images uploaded to Notion get links that expire after an hour, so they
 *  are saved into public/changelog/notion/ and served from there. */
async function localImage(root, block) {
    const img = block.image;
    if (img.type === "external") return toRelative(img.external.url);
    const url = img.file.url;
    const ext = (path.extname(new URL(url).pathname) || ".png").toLowerCase();
    const rel = `/public/changelog/notion/${block.id}${ext}`;
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Couldn't download an image from Notion (${res.status})`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    return rel;
}

/** A Notion row and its body → a version. */
export async function fromNotionPage(notion, page, root) {
    const p = page.properties;
    const shotSrc = plain(p.Screenshot?.rich_text);
    const entry = {
        version: plain(p.Version?.rich_text).trim(),
        majorName: plain(p["Major name"]?.rich_text).trim(),
        date: p.Date?.date?.start,
        through: p["Covers through"]?.date?.start || p.Date?.date?.start,
        title: plain(p.Title?.title).trim(),
        status: p.Status?.select?.name || "Draft",
        shot: shotSrc
            ? {
                  src: shotSrc.trim(),
                  href: plain(p["Screenshot link"]?.rich_text).trim() || null,
                  alt: plain(p["Screenshot alt"]?.rich_text).trim(),
                  label: plain(p["Screenshot label"]?.rich_text).trim() || null,
              }
            : null,
        blocks: [],
    };
    for (const block of await allChildren(notion, page.id)) {
        const last = entry.blocks[entry.blocks.length - 1];
        if (block.type === "paragraph") {
            if (plain(block.paragraph.rich_text).trim()) entry.blocks.push({ type: "p", rich: fromNotionRich(block.paragraph.rich_text) });
        } else if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
            const item = fromNotionRich(block[block.type].rich_text);
            if (last && last.type === "ul") last.items.push(item);
            else entry.blocks.push({ type: "ul", items: [item] });
        } else if (block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3") {
            entry.blocks.push({ type: "h4", rich: fromNotionRich(block[block.type].rich_text) });
        } else if (block.type === "image") {
            const caption = block.image.caption || [];
            const link = caption.find((r) => r.href);
            entry.blocks.push({
                type: "img",
                src: await localImage(root, block),
                alt: plain(caption).trim(),
                href: link ? toRelative(link.href) : null,
            });
        }
        // Anything else (dividers, callouts, toggles…) is left out of the page.
    }
    return entry;
}
