/**
 * build-india-map.js — builds salary/data/india-map.json, the dotted map of India
 * behind the "Pay across India" view on /salary/.
 *
 *   npm i --no-save puppeteer d3-geo@3     (ONE command; --no-save prunes earlier ones)
 *   node scripts/build-india-map.js path/to/india-dots-reference.png
 *
 * The LAYOUT is Karthik's own reference image (a dotted map of India): every
 * dot in it is read out and kept where it is, so the outline, the boundary
 * India uses and the island insets are exactly his, not a re-drawing.
 *
 * The image has no idea which state a dot is in, so that is worked out:
 *   1. fit a straight-line map from image pixels to longitude/latitude, by
 *      nudging it until the most dots land inside India's real outline
 *      (Natural Earth, public domain, 50m admin-1);
 *   2. give each dot the state it falls in; dots outside every state (the
 *      reference includes territory Natural Earth draws differently, and the
 *      coast) take the NEAREST state;
 *   3. the two island clusters are placed apart from the mainland in the
 *      reference, so they cannot be fitted: they are assigned by position.
 * Checked on 2026-10-20: 90% of mainland dots fall inside a state polygon, and
 * all 13 cities the dashboard covers land within 14px of a dot in the correct state.
 *
 * Output uses the same shape as world-map.json, so one renderer draws both.
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { geoContains } from "d3-geo";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";
const ISLANDS = {
    "Lakshadweep": (d) => d.x < 330 && d.y > 930,            // the group in the lower left
    "Andaman and Nicobar": (d) => d.x > 980 && d.y > 860     // the chain in the lower right
};
const VIEW_WIDTH = 1000;
const DOT_RATIO = 0.6;    // dot diameter / dot spacing, as in the reference

// Which state each city in benchmarks.json sits in, as the dots name it.
// Chandigarh is a union territory with no dots of its own; its dots belong to Haryana.
const CITY_STATE = {
    "bangalore": "karnataka", "mumbai": "maharashtra", "pune": "maharashtra",
    "delhi-ncr": "delhi", "hyderabad": "telangana", "chennai": "tamil-nadu",
    "coimbatore": "tamil-nadu", "ahmedabad": "gujarat", "kolkata": "west-bengal",
    "chandigarh": "haryana", "kochi": "kerala", "jaipur": "rajasthan", "indore": "madhya-pradesh"
};

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function readDots(imagePath) {
    const b64 = fs.readFileSync(imagePath).toString("base64");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const result = await page.evaluate(async (b64) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const dark = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) dark[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3 < 140 ? 1 : 0;
        const seen = new Uint8Array(width * height);
        const dots = [];
        for (let s = 0; s < width * height; s++) {
            if (!dark[s] || seen[s]) continue;
            const stack = [s]; seen[s] = 1;
            let n = 0, sx = 0, sy = 0;
            while (stack.length) {
                const i = stack.pop(); n++; sx += i % width; sy += (i / width) | 0;
                for (const j of [i - 1, i + 1, i - width, i + width]) {
                    if (j >= 0 && j < width * height && dark[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
                }
            }
            if (n >= 12) dots.push({ x: sx / n, y: sy / n });   // anything smaller is a speck
        }
        return dots;
    }, b64);
    await browser.close();
    return result;
}

function spacing(dots) {
    const sample = dots.filter((_, i) => i % 5 === 0);
    const near = sample.map((a) => Math.min(...dots.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
    near.sort((a, b) => a - b);
    return near[near.length >> 1];
}

const imagePath = process.argv[2];
if (!imagePath || !fs.existsSync(imagePath)) {
    console.error("Usage: node scripts/build-india-map.js path/to/india-dots-reference.png");
    process.exit(1);
}

const dots = await readDots(imagePath);
const pitch = spacing(dots);
console.log(`${dots.length} dots read · spacing ${pitch.toFixed(1)}px`);

const geo = await (await fetch(NE_URL)).json();
const states = geo.features.filter((f) => f.properties.admin === "India").map((f) => ({ f, name: f.properties.name }));
const mainland = states.filter((s) => !(s.name in ISLANDS));
const bounds = mainland.map((s) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const walk = (c) => typeof c[0] === "number" ? (x0 = Math.min(x0, c[0]), x1 = Math.max(x1, c[0]), y0 = Math.min(y0, c[1]), y1 = Math.max(y1, c[1])) : c.forEach(walk); walk(s.f.geometry.coordinates); return [x0, y0, x1, y1]; });

const islandOf = (d) => Object.keys(ISLANDS).find((name) => ISLANDS[name](d)) || null;
const main = dots.filter((d) => !islandOf(d));

// 1. a land mask at 0.1° so the fit can score thousands of candidates quickly
const STEP = 0.1, LON0 = 66, LAT0 = 5, W = 340, H = 340;
const mask = new Uint8Array(W * H);
for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
        const lon = LON0 + (i + 0.5) * STEP, lat = LAT0 + (j + 0.5) * STEP;
        for (let k = 0; k < mainland.length; k++) {
            const b = bounds[k];
            if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
            if (geoContains(mainland[k].f, [lon, lat])) { mask[j * W + i] = 1; break; }
        }
    }
}
const onLand = (lon, lat) => {
    const i = Math.floor((lon - LON0) / STEP), j = Math.floor((lat - LAT0) / STEP);
    return i >= 0 && i < W && j >= 0 && j < H && mask[j * W + i] === 1;
};
const score = (P) => main.filter((p) => onLand(P.a + P.b * p.x, P.c + P.d * p.y)).length / main.length;

// 2. fit lon = a + b·x, lat = c + d·y by coordinate descent from a landmark guess
let P = { a: 64.7, b: 0.02636, c: 38.75, d: -0.02611 };
let best = score(P);
for (const span of [0.5, 0.2, 0.1, 0.05, 0.02, 0.01]) {
    for (const key of ["a", "b", "c", "d"]) {
        const reach = key === "b" || key === "d" ? 0.008 * span : span * 4;
        for (let t = -8; t <= 8; t++) {
            const Q = { ...P, [key]: P[key] + (t / 8) * reach };
            const s = score(Q);
            if (s > best) { best = s; P = Q; }
        }
    }
}
console.log(`fit: ${(best * 100).toFixed(1)}% of mainland dots inside India's outline`);

// 3. assign states
const vertices = mainland.map((s) => { const v = []; const walk = (c) => typeof c[0] === "number" ? v.push(c) : c.forEach(walk); walk(s.f.geometry.coordinates); return v; });
const assigned = dots.map((d) => {
    const island = islandOf(d);
    if (island) return { ...d, state: island };
    const lon = P.a + P.b * d.x, lat = P.c + P.d * d.y;
    for (const s of mainland) if (geoContains(s.f, [lon, lat])) return { ...d, state: s.name };
    let nearest = null, bestD = 1e9;
    mainland.forEach((s, i) => { for (const v of vertices[i]) { const dd = (v[0] - lon) ** 2 + (v[1] - lat) ** 2; if (dd < bestD) { bestD = dd; nearest = s.name; } } });
    return { ...d, state: nearest };
});

// 4. write, in the shared shape, scaled to a 1000-unit-wide viewBox
const xs = assigned.map((d) => d.x), ys = assigned.map((d) => d.y);
const minX = Math.min(...xs) - pitch, minY = Math.min(...ys) - pitch;
const k = VIEW_WIDTH / (Math.max(...xs) + pitch - minX);
const groups = [], index = new Map(), flat = [];
for (const d of assigned) {
    if (!index.has(d.state)) { index.set(d.state, groups.length); groups.push({ id: slug(d.state), name: d.state }); }
    flat.push(Math.round((d.x - minX) * k * 10) / 10, Math.round((d.y - minY) * k * 10) / 10, index.get(d.state));
}
const cell = Math.round(pitch * k * 100) / 100;
const missingState = Object.values(CITY_STATE).filter((id) => !groups.some((g) => g.id === id));
if (missingState.length) throw new Error("Cities mapped to states with no dots: " + missingState.join(", "));

const out = {
    w: VIEW_WIDTH,
    h: Math.round((Math.max(...ys) + pitch - minY) * k),
    cell,
    dot: Math.round(cell * DOT_RATIO * 100) / 100,
    groups,
    cities: CITY_STATE,
    dots: flat
};
const file = path.join(root, "salary", "data", "india-map.json");
fs.writeFileSync(file, JSON.stringify(out));
const per = {};
assigned.forEach((d) => { per[d.state] = (per[d.state] || 0) + 1; });
console.log(`${out.w}×${out.h} · ${assigned.length} dots · ${groups.length} states and territories · ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
console.log("fewest dots:", Object.entries(per).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([n, c]) => `${n} ${c}`).join(" · "));
