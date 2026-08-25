#!/usr/bin/env node
/**
 * check-layout.js — guards the dashboard's load-bearing CSS invariants.
 *
 * These are the rules that, if broken, collapse the whole two-panel layout in
 * ways that are NOT css syntax errors and so pass every normal linter. Learned
 * the hard way: an edit once left `.dash-sidebar,` dangling in front of a
 * `::-webkit-scrollbar` rule, which is perfectly legal CSS — it just silently
 * gave the sidebar `display: none`, dropping .dash-main into the sidebar's
 * 280px grid column.
 *
 *   node scripts/check-layout.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS = path.join(__dirname, "..", "tools", "dashboard.css");

const raw = fs.readFileSync(CSS, "utf8");
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "");

/** Top-level rules only — anything inside @media is intentionally scoped. */
function topLevelRules(text) {
    const rules = [];
    let depth = 0, buf = "", sel = "";
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "{") {
            if (depth === 0) { sel = buf.trim(); buf = ""; }
            else buf += ch;
            depth++;
        } else if (ch === "}") {
            depth--;
            if (depth === 0) {
                if (sel && !sel.startsWith("@")) rules.push({ sel, body: buf });
                buf = ""; sel = "";
            } else buf += ch;
        } else buf += ch;
    }
    return rules;
}

const rules = topLevelRules(src);
const failures = [];

function declarationsFor(selector) {
    const out = [];
    for (const r of rules) {
        const parts = r.sel.split(",").map((s) => s.trim());
        if (parts.includes(selector)) out.push(r.body);
    }
    return out.join(";");
}

// 1. The sidebar must never be hidden at top level (the media query may hide it).
if (/display\s*:\s*none/.test(declarationsFor(".dash-sidebar"))) {
    failures.push(".dash-sidebar is display:none at top level — the sidebar will vanish and .dash-main will fall into its grid column");
}
// 2. …and must not be zero-sized.
if (/(^|;)\s*width\s*:\s*0/.test(declarationsFor(".dash-sidebar"))) {
    failures.push(".dash-sidebar has width:0 at top level");
}
// 3. The two-panel grid must survive.
const dash = declarationsFor(".dashboard");
if (!/grid-template-columns\s*:\s*var\(--sidebar-width\)\s+1fr/.test(dash)) {
    failures.push(".dashboard lost `grid-template-columns: var(--sidebar-width) 1fr`");
}
if (!/display\s*:\s*grid/.test(dash)) {
    failures.push(".dashboard is no longer display:grid");
}
// 4. Children of the scrolling column must not be shrinkable (clips the hero).
if (!/flex\s*:\s*0\s+0\s+auto/.test(declarationsFor(".dash-main > *"))) {
    failures.push(".dash-main > * lost `flex: 0 0 auto` — the first fold will be clipped");
}
// 5. A selector list should never contain a bare element/class that only
//    belongs to a pseudo-element rule.
for (const r of rules) {
    const parts = r.sel.split(",").map((s) => s.trim());
    const pseudo = parts.filter((p) => p.includes("::"));
    const bare = parts.filter((p) => !p.includes("::"));
    if (pseudo.length && bare.length && /width\s*:\s*0|display\s*:\s*none/.test(r.body)) {
        failures.push(`suspicious mixed rule — bare selector(s) ${bare.join(", ")} share a block with pseudo-element rules: {${r.body.trim().slice(0, 60)}…}`);
    }
}

if (failures.length) {
    console.log("  LAYOUT CHECK FAILED:");
    failures.forEach((f) => console.log("    ✗ " + f));
    process.exit(1);
}
console.log("  ✓ dashboard layout invariants hold");
