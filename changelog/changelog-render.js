/**
 * changelog-render.js — turns changelog versions into the page's markup.
 *
 * Shared by the browser (changelog-live.js, which redraws the page from
 * Notion on every visit) and the build (scripts/build-changelog.js, which
 * writes the same markup into changelog/index.html so the page has content
 * before any script runs). No Node or browser APIs in here.
 *
 * A version looks like:
 *   { version: "v3.0", majorName: "Pegasus", date: "2026-11-01",
 *     through: "2026-11-01", title: "…", status: "Published" | "Draft",
 *     shot: { src, href, label, alt } | null,
 *     blocks: [ { type: "p", rich }, { type: "ul", items: [rich, …] },
 *               { type: "h4", rich }, { type: "img", src, href, alt } ] }
 * where rich is a list of { text, bold, italic, underline, href } runs.
 */

export const SITE = "https://designwallet.in";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function escapeText(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function escapeAttr(s) {
    return escapeText(s).replace(/"/g, "&quot;");
}

/** "v3.0" → [3, 0] */
export function versionParts(version) {
    const m = /^v(\d+)\.(\d+)$/.exec(version);
    if (!m) throw new Error(`Bad version "${version}" (expected e.g. v3.0)`);
    return [Number(m[1]), Number(m[2])];
}

/** Site links are stored absolute in Notion (it rejects relative URLs) and
 *  rendered relative on the page. */
export function toAbsolute(href) {
    return href && href.startsWith("/") ? SITE + href : href;
}
export function toRelative(href) {
    return href && href.startsWith(SITE + "/") ? href.slice(SITE.length) : href;
}

function displayDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function renderRich(rich) {
    return rich.map((run) => {
        let html = escapeText(run.text);
        if (run.underline) html = `<u>${html}</u>`;
        if (run.italic) html = `<em>${html}</em>`;
        if (run.bold) html = `<strong>${html}</strong>`;
        if (run.href) html = `<a href="${escapeAttr(toRelative(run.href))}">${html}</a>`;
        return html;
    }).join("");
}

function renderFigure(img, { natural, lazy, size, indent }) {
    const pad = " ".repeat(indent);
    const dims = size ? ` width="${size.w}" height="${size.h}"` : "";
    const tag = `<img src="${escapeAttr(img.src)}" alt="${escapeAttr(img.alt || "")}"${dims}${lazy ? ' loading="lazy"' : ""}>`;
    const inner = img.href
        // Without a label, the image's alt text names the link.
        ? `${pad}    <a class="cl-shot-link" href="${escapeAttr(img.href)}"${img.label ? ` aria-label="${escapeAttr(img.label)}"` : ""}>\n` +
          `${pad}        ${tag}\n` +
          `${pad}    </a>\n`
        : `${pad}    ${tag}\n`;
    return `${pad}<figure class="cl-shot${natural ? " cl-shot--natural" : ""}">\n${inner}${pad}</figure>\n`;
}

function renderBlocks(blocks, sizeOf) {
    const pad = " ".repeat(32);
    let out = "";
    blocks.forEach((block, i) => {
        // A subhead after other content gets a blank line before it.
        if (block.type === "h4" && i > 0) out += "\n";
        if (block.type === "p") out += `${pad}<p>${renderRich(block.rich)}</p>\n`;
        else if (block.type === "h4") out += `${pad}<h4 class="cl-subhead">${renderRich(block.rich)}</h4>\n`;
        else if (block.type === "ul") {
            out += `${pad}<ul>\n`;
            for (const item of block.items) out += `${pad}    <li>${renderRich(item)}</li>\n`;
            out += `${pad}</ul>\n`;
        } else if (block.type === "img") {
            out += renderFigure(block, { natural: true, lazy: true, size: sizeOf(block.src), indent: 32 });
        }
    });
    return out;
}

function renderEntry(entry, { sizeOf, first }) {
    const id = entry.version.replace(".", "-");
    let html =
        `                    <li class="cl-entry" id="${id}" data-through="${entry.through}">\n` +
        `                        <div class="cl-meta">\n` +
        `                            <span class="cl-version">${entry.version}</span>\n` +
        `                            <span class="cl-sep" aria-hidden="true">/</span>\n` +
        `                            <time datetime="${entry.date}">${displayDate(entry.date)}</time>\n` +
        `                        </div>\n` +
        `                        <article class="cl-body">\n` +
        `                            <h3 class="cl-title"><a href="#${id}">${escapeText(entry.title)}</a></h3>\n`;
    if (entry.shot) {
        // Release screenshots are always captured at 1440×900. Only the very
        // first one on the page loads eagerly.
        html += renderFigure(entry.shot, { natural: false, lazy: !first, size: { w: 1440, h: 900 }, indent: 28 });
    }
    html +=
        `                            <div class="cl-desc">\n` +
        renderBlocks(entry.blocks, sizeOf) +
        `                            </div>\n` +
        `                        </article>\n` +
        `                    </li>\n`;
    return html;
}

/** Every version, grouped by major (newest first), as the page's markup.
 *  sizeOf(src) gives a body image's { w, h } when it is known. */
export function renderChangelog(entries, sizeOf = () => null) {
    const sorted = [...entries].sort((a, b) => {
        const [am, an] = versionParts(a.version);
        const [bm, bn] = versionParts(b.version);
        return bm - am || bn - an;
    });
    const majors = new Map();
    for (const entry of sorted) {
        const major = versionParts(entry.version)[0];
        if (!majors.has(major)) majors.set(major, []);
        majors.get(major).push(entry);
    }
    let html = "";
    let first = true;
    for (const [major, list] of majors) {
        const name = (list.find((e) => e.majorName) || {}).majorName || "";
        html +=
            `            <section class="cl-major" id="version-${major}" aria-labelledby="version-${major}-title">\n` +
            `                <h2 class="cl-major-title" id="version-${major}-title">V${major}.0${name ? ` <span class="cl-major-name">${escapeText(name)}</span>` : ""}</h2>\n` +
            `                <ol class="cl-list">\n`;
        for (const entry of list) {
            html += "\n" + renderEntry(entry, { sizeOf, first });
            first = false;
        }
        html += `\n                </ol>\n            </section>\n\n`;
    }
    return html;
}
