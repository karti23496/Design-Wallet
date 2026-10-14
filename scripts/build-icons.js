#!/usr/bin/env node
/**
 * build-icons.js — prepare category icons and sync the registry in tools.js.
 *
 *   node scripts/build-icons.js          # report only, changes nothing
 *   node scripts/build-icons.js --write  # apply
 *
 * Drop icon files into public/icons/ named roughly after their category, then
 * run this. It:
 *
 *   1. Renames files to kebab-case and matches them to a REAL category slug
 *      from the live sheet. Singular/plural mismatches are common
 *      ("design course.svg" -> "design-courses"), so matching is fuzzy and
 *      anything ambiguous is reported rather than guessed.
 *   2. Pins `currentColor` to #000000 in SVGs. Icons are painted as CSS masks
 *      where only ALPHA is read, and currentColor in an isolated SVG-as-image
 *      context is unreliable — some renderers draw nothing at all.
 *   3. Flags PNGs that can't work as masks (opaque ground, or artwork that
 *      never reaches full opacity). Those need an image editor; this script
 *      will not silently "fix" artwork.
 *   4. Rewrites the CATEGORY_ICONS block in tools/tools.js.
 *
 * Files listed in KEEP_AS_SOURCE are ignored — they are raw exports kept for
 * reference, not served.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(__dirname, "..", "public", "icons");
const TOOLS_JS = path.join(__dirname, "..", "tools", "tools.js");
// The live category list comes from Supabase, which is where the site reads the
// catalogue now. The Google Sheet is still the editing surface — a sync job
// pushes it here within seconds — but this script must NOT read the sheet: once
// the sheet is restricted, an anonymous request to it fails. See DECISIONS §20a.
//
// This is the publishable key the website already ships. It can read the
// `public_*` views and nothing else.
const SUPABASE_URL = "https://ugjtyuikvdeymwsfsgfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_IOdPnIa_tf6DjQShp_gTZA_i36nRCTe";
// Not category icons — UI marks referenced straight from CSS. Without this
// the script reports them as unmatched on every run.
const KEEP_AS_SOURCE = ["3d Software.png", "all-categories.svg"];

/**
 * Filenames that can't be matched to a category automatically — abbreviations
 * the sheet uses ("img-gen"), a differently-worded category ("mockup-websites"
 * vs "mockup inspirations"), or a typo in the export. Keyed by the slugified
 * filename so re-running stays idempotent.
 */
const ALIASES = {
    "image-generation":    "img-gen",
    "video-genration":     "vid-gen",              // typo in export
    "mockup-inspitations": "mockup-websites",      // typo in export
    "prototype":           "prototyping-tools",
    "uiux":                "ui-ux-inspirations"
};

const WRITE = process.argv.includes("--write");

const slugify = (v) =>
    String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Every category that at least one live tool claims.
 *
 * This used to fetch each sheet tab in turn and locate the `categories` column
 * by reading the header row — and it read the tab list out of tools.js by regex,
 * because a second hardcoded copy had already gone stale once and would have
 * deleted two categories from the registry. Both couplings are gone: the sync
 * job merges the tabs, so one request returns the whole catalogue.
 */
async function liveCategorySlugs() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/public_tools?select=categories&limit=5000`,
        { headers: { apikey: SUPABASE_KEY } }
    );
    if (!res.ok) {
        throw new Error(`Supabase responded ${res.status}: ${await res.text()}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
        // An empty set would make every icon look unmatched, and `--write`
        // would then empty CATEGORY_ICONS. Fail loudly instead.
        throw new Error("Supabase returned no tools — refusing to rebuild the icon registry.");
    }

    const slugs = new Set();
    for (const row of rows) {
        String(row.categories || "")
            .split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
            .forEach((s) => slugs.add(slugify(s)));
    }
    return slugs;
}

/** Exact match, else singular/plural, else unique prefix. Never guesses twice. */
function matchSlug(candidate, slugs) {
    if (ALIASES[candidate] && slugs.has(ALIASES[candidate])) return ALIASES[candidate];
    if (slugs.has(candidate)) return candidate;
    for (const variant of [candidate + "s", candidate + "es", candidate.replace(/s$/, "")]) {
        if (slugs.has(variant)) return variant;
    }
    const partial = [...slugs].filter((s) => s.startsWith(candidate) || candidate.startsWith(s));
    return partial.length === 1 ? partial[0] : null;
}

function svgNeedsPinning(file) {
    return file.endsWith(".svg") &&
        fs.readFileSync(path.join(ICON_DIR, file), "utf8").includes("currentColor");
}

function main(slugs) {
    const files = fs.readdirSync(ICON_DIR)
        .filter((f) => /\.(svg|png)$/i.test(f))
        .filter((f) => !KEEP_AS_SOURCE.includes(f));

    const registry = [];
    const problems = [];

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const base = path.basename(file, ext);
        const slug = matchSlug(slugify(base), slugs);

        if (!slug) {
            problems.push(`${file} — no unique category matches "${slugify(base)}"`);
            continue;
        }

        let finalName = slug + ext;
        if (finalName !== file) {
            if (WRITE) fs.renameSync(path.join(ICON_DIR, file), path.join(ICON_DIR, finalName));
            console.log(`  rename  ${file}  ->  ${finalName}`);
        }

        const target = WRITE ? finalName : file;
        if (svgNeedsPinning(target)) {
            const p = path.join(ICON_DIR, target);
            const src = fs.readFileSync(p, "utf8");
            if (WRITE) fs.writeFileSync(p, src.replace(/currentColor/g, "#000000"));
            console.log(`  pin     ${finalName}  (currentColor -> #000000)`);
        }

        if (ext === ".png") {
            problems.push(
                `${finalName} — PNG: verify it is transparent AND reaches full opacity ` +
                `(masks read alpha only)`
            );
        }
        registry.push([slug, finalName]);
    }

    registry.sort((a, b) => a[0].localeCompare(b[0]));

    const width = Math.max(...registry.map(([s]) => s.length)) + 3;
    const body = registry
        .map(([s, f]) => `        ${(`"${s}":`).padEnd(width + 1)}"${f}"`)
        .join(",\n");
    const block = `    var CATEGORY_ICONS = {\n${body}\n    };`;

    const js = fs.readFileSync(TOOLS_JS, "utf8");
    const pattern = / {4}var CATEGORY_ICONS = \{[\s\S]*?\n {4}\};/;

    // "no match" and "matched but identical" are very different outcomes — the
    // first is a broken script, the second is the healthy steady state. They
    // used to share one alarming message, which cried wolf on every clean run.
    if (!pattern.test(js)) {
        console.log("\n  ! CATEGORY_ICONS block not found in tools.js — registry NOT updated");
    } else {
        const updated = js.replace(pattern, block);
        if (updated === js) {
            console.log("\n  registry already in sync — nothing to write");
        } else if (WRITE) {
            fs.writeFileSync(TOOLS_JS, updated);
            console.log("\n  registry updated");
        } else {
            console.log("\n  registry is OUT OF DATE — pass --write to sync");
        }
    }

    console.log(`\n  ${registry.length} icons registered:`);
    registry.forEach(([s, f]) => console.log(`    ${s.padEnd(22)} ${f}`));

    if (problems.length) {
        console.log("\n  needs a look:");
        problems.forEach((p) => console.log("    - " + p));
    }
    console.log(WRITE ? "\n  written." : "\n  dry run — pass --write to apply.");
}

liveCategorySlugs()
    .then(main)
    .catch((e) => {
        console.error("  failed:", e.message);
        process.exit(1);
    });
