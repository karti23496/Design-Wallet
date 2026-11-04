/**
 * changelog-lib.js — the Node side of rendering the changelog, shared by
 * build-changelog.js and changelog-import.js.
 *
 * The changelog is written in Notion (one database row per version) and
 * rendered into changelog/index.html between the changelog:start /
 * changelog:end markers. The markup itself comes from
 * changelog/changelog-render.js, which the page also uses to redraw itself
 * live from Notion (changelog/changelog-live.js); the version shape is
 * described there.
 */

import fs from "node:fs";
import path from "node:path";
import { renderChangelog as render } from "../changelog/changelog-render.js";

export { SITE, escapeText, escapeAttr, versionParts, toAbsolute, toRelative, renderRich } from "../changelog/changelog-render.js";

export const START = "<!-- changelog:start -->";
export const END = "<!-- changelog:end -->";

/** Width × height of a local PNG or WebP, so body images reserve their space. */
export function imageSize(root, src) {
    const file = path.join(root, src.split("?")[0]);
    if (!fs.existsSync(file)) return null;
    const b = fs.readFileSync(file);
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
        const kind = b.toString("ascii", 12, 16);
        if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
        if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
        if (kind === "VP8L") {
            const bits = b.readUInt32LE(21);
            return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
        }
    }
    if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    return null;
}

/** Every version, grouped by major (newest first), as the page's markup. */
export function renderChangelog(entries, root) {
    return render(entries, (src) => imageSize(root, src));
}

/** Swap the generated part of changelog/index.html. */
export function writeChangelog(root, entries) {
    const file = path.join(root, "changelog/index.html");
    const page = fs.readFileSync(file, "utf8");
    const a = page.indexOf(START);
    const b = page.indexOf(END);
    if (a < 0 || b < a) throw new Error("changelog/index.html is missing the changelog:start / changelog:end markers");
    const next = page.slice(0, a + START.length) + "\n" + renderChangelog(entries, root) + "            " + page.slice(b);
    fs.writeFileSync(file, next);
    return next !== page;
}
