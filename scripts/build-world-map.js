/**
 * build-world-map.js — builds salary/data/world-map.json, the dotted world map
 * behind the "Pay around the world" view on /salary/ (foreign employer only).
 *
 * The map is a grid of dots. Every grid cell whose centre falls on land becomes
 * one dot, and each dot remembers the country it landed in, so the page can
 * light a whole country on hover. There is no map library at runtime: the
 * browser gets this JSON and draws it.
 *
 *   npm i --no-save puppeteer d3-geo@3 topojson-client@3 world-atlas@2 i18n-iso-countries@7
 *   node scripts/build-world-map.js
 *
 * (Install them in ONE command: `npm i --no-save` prunes anything installed
 * the same way earlier, so a second call would remove the first call's packages.)
 *
 * The packages are build-time only and deliberately NOT in package.json: the
 * output is committed, so nothing needs rebuilding unless the map changes.
 * Country shapes are Natural Earth (public domain), via world-atlas, at the
 * 110m scale: coarse, which is what a 150-column dot map wants.
 *
 * Projection is Mercator, clipped to 84°N … 57°S so Antarctica is left off,
 * like the design (Figma node 829:179).
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { geoContains, geoBounds } from "d3-geo";
import { feature } from "topojson-client";
import isoCountries from "i18n-iso-countries";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const COLS = 150;                 // dots across; the design's pitch at ~1000px wide is ~7px
const LON_MIN = -170;             // Alaska's west edge. East Siberia's tip beyond -170 is clipped.
const LON_MAX = 180;
const LAT_MAX = 84;
const LAT_MIN = -57;

// The salary data's own country ids. Every other country gets a slug of its name.
const OURS = {
    "United States of America": "united-states",
    "Australia": "australia",
    "United Kingdom": "united-kingdom",
    "Netherlands": "netherlands",
    "Singapore": "singapore",
    "Germany": "germany",
    "United Arab Emirates": "uae",
    "Canada": "canada"
};

// A country too small for the 110m shapes to contain a single grid point still
// has to be on the map, so it is given one dot at its capital's cell.
const FALLBACK_POINTS = {
    "singapore": { at: [103.82, 1.35], name: "Singapore", iso: "SGP" }
};

// Natural Earth entries with no ISO numeric of their own: borrow their parent's
// code so they share its income figure.
const ISO_OVERRIDES = { "Somaliland": "SOM", "N. Cyprus": "CYP", "Kosovo": "XKX" };

const topo = require("world-atlas/countries-110m.json");
const features = feature(topo, topo.objects.countries).features.map((f) => {
    const name = f.properties.name;
    const [[w, s], [e, n]] = geoBounds(f);
    // world-atlas ids are ISO 3166-1 numeric; the pay model joins on alpha-3. Kosovo has no numeric.
    const iso = ISO_OVERRIDES[name] || (f.id ? isoCountries.numericToAlpha3(String(f.id).padStart(3, "0")) || null : null);
    return { f, name, iso, id: OURS[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), w, s, e, n };
});

const merc = (deg) => Math.log(Math.tan(Math.PI / 4 + (deg * Math.PI) / 360));
const unmerc = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

// One grid cell is square in Mercator space.
const cell = ((LON_MAX - LON_MIN) * Math.PI) / 180 / COLS;
const yTop = merc(LAT_MAX);
const yBottom = merc(LAT_MIN);
const ROWS = Math.round((yTop - yBottom) / cell);

const lonOf = (col) => LON_MIN + ((col + 0.5) / COLS) * (LON_MAX - LON_MIN);
const latOf = (row) => unmerc(yTop - (row + 0.5) * cell);

function inBounds(item, lon, lat) {
    if (lat < item.s || lat > item.n) return false;
    // d3 reports a country that crosses the antimeridian (Russia, Fiji) with west > east.
    return item.w <= item.e ? lon >= item.w && lon <= item.e : lon >= item.w || lon <= item.e;
}

function countryAt(lon, lat) {
    for (const item of features) {
        if (inBounds(item, lon, lat) && geoContains(item.f, [lon, lat])) return item;
    }
    return null;
}

const countries = [];
const indexOf = new Map();
const dots = [];                  // flat: col, row, country index, col, row, country index, ...

function remember(item) {
    if (!indexOf.has(item.id)) {
        indexOf.set(item.id, countries.length);
        countries.push({ id: item.id, name: item.name, iso: item.iso || null });
    }
    return indexOf.get(item.id);
}

for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
        const item = countryAt(lonOf(col), latOf(row));
        if (item) dots.push(col, row, remember(item));
    }
}

// Guarantee one dot for every country the salary data covers.
const taken = new Set();
for (let i = 0; i < dots.length; i += 3) taken.add(dots[i] + "," + dots[i + 1]);
for (const [id, { at: [lon, lat], name, iso }] of Object.entries(FALLBACK_POINTS)) {
    if (indexOf.has(id)) continue;
    const item = features.find((x) => x.id === id);
    const col = Math.min(COLS - 1, Math.max(0, Math.round(((lon - LON_MIN) / (LON_MAX - LON_MIN)) * COLS - 0.5)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.round((yTop - merc(lat)) / cell - 0.5)));
    const idx = remember(item || { id, name, iso });
    // A neighbour may already own that cell; the covered country wins it.
    for (let i = 0; i < dots.length; i += 3) {
        if (dots[i] === col && dots[i + 1] === row) { dots[i + 2] = idx; break; }
    }
    if (!taken.has(col + "," + row)) dots.push(col, row, idx);
}

const missing = Object.values(OURS).filter((id) => !indexOf.has(id));
if (missing.length) throw new Error("Covered countries with no dot on the map: " + missing.join(", "));

// The shape salary/world-map.js reads for every dot map (this one and the India
// one): coordinates in viewBox units, `cell` the spacing (and hit size), `dot`
// the drawn diameter. Here one grid cell is one unit.
const flat = [];
for (let i = 0; i < dots.length; i += 3) flat.push(dots[i] + 0.5, dots[i + 1] + 0.5, dots[i + 2]);
const out = { w: COLS, h: ROWS, cell: 1, dot: 0.62, groups: countries, dots: flat };
const file = path.join(root, "salary", "data", "world-map.json");
fs.writeFileSync(file, JSON.stringify(out));

const perCountry = {};
for (let i = 0; i < dots.length; i += 3) perCountry[countries[dots[i + 2]].id] = (perCountry[countries[dots[i + 2]].id] || 0) + 1;
console.log(`${COLS}×${ROWS} grid · ${dots.length / 3} dots · ${countries.length} countries · ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
console.log("covered countries (dots):", Object.values(OURS).map((id) => `${id} ${perCountry[id]}`).join(" · "));
