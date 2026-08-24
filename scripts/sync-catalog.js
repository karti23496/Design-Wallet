/**
 * sync-catalog.js
 * One-time / repeatable import of the public Google Sheet catalog into the
 * Supabase `catalog` table. The Sheet stays the editing surface; re-run this to
 * re-sync. Mirrors the column mapping used client-side in script.js / tools.js.
 *
 * Requires:  npm i @supabase/supabase-js
 * Env:       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *            (optional) SHEET_ID, SHEET_GID  — defaults to the live catalog sheet
 *
 * Usage:     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-catalog.js
 */

const { createClient } = require("@supabase/supabase-js");

const SHEET_ID = process.env.SHEET_ID || "1tebheLiV_HPN7cqIQ4xvXEr9LWd5a72tlQIHRQQQvF8";
const SHEET_GID = process.env.SHEET_GID || "0";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function slugify(s) {
  return String(s || "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitList(v) {
  return String(v || "")
    .split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
}

// gviz returns JS wrapped as: google.visualization.Query.setResponse({...});
function parseGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1));
}

async function main() {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}&cachebust=${Date.now()}`;
  const res = await fetch(url);
  const data = parseGviz(await res.text());

  const rows = data.table.rows || [];
  // First row is the header; build a label→index map (matches client behaviour).
  const headerCells = rows[0].c || [];
  const headers = headerCells.map((c) => slugify((c && (c.v || c.f)) || ""));

  function cell(cells, label) {
    const i = headers.indexOf(label);
    if (i < 0 || !cells[i]) return "";
    return cells[i].f || cells[i].v || "";
  }

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r].c || [];
    const title = cell(cells, "title");
    if (!title) continue;
    const slug = slugify(cell(cells, "slug") || title);
    records.push({
      slug,
      title,
      subtitle: cell(cells, "subtitle") || null,
      description: cell(cells, "description") || null,
      categories: splitList(cell(cells, "categories")),
      pricing: cell(cells, "pricing") || null,
      link: cell(cells, "link") || null,
      image: cell(cells, "image") || null,
      thumbnails: splitList(cell(cells, "thumbnails")),
      sort_order: r,
    });
  }

  console.log(`Parsed ${records.length} catalog rows. Upserting…`);
  const { error } = await supabase.from("catalog").upsert(records, { onConflict: "slug" });
  if (error) {
    console.error("Upsert failed:", error);
    process.exit(1);
  }
  console.log("Catalog sync complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
