/**
 * build-world-pay.js — builds salary/data/world-pay.json: a pay index for every
 * country on the world map, so hovering ANY country can show a salary range.
 *
 *   node scripts/build-world-pay.js        (needs network: it reads the World Bank)
 *
 * HOW THESE NUMBERS ARE MADE — read this before trusting one.
 *
 * The eight markets in benchmarks.json (`international.countries`) are
 * RESEARCHED estimates: their index was set by hand from Levels.fyi, Glassdoor
 * and Built In. Those indices are copied through unchanged.
 *
 * Every OTHER country is MODELLED, not surveyed. Nobody has published a design
 * salary survey for 150 countries, so the index is taken from how rich the
 * country is: GDP per person (World Bank, NY.GDP.PCAP.CD, latest year) as a
 * share of the US figure, run through a damped curve:
 *
 *     r      = gdp_per_person / us_gdp_per_person
 *     index  = CAP                                  if r >= KNEE
 *            = CAP * (r / KNEE) ^ EXPONENT          otherwise
 *
 * CAP 0.62 is where the researched rich markets sit (UK 0.60, Australia 0.62).
 * EXPONENT 0.45 is fitted so India comes out at ~0.165, which is what the
 * dashboard's own national figure implies (a senior product designer at
 * ₹24 LPA against the US's $158K). Pay for designers falls far more slowly than
 * national income does, because designers sell into richer markets, so the
 * curve is flat at the top and concave below the KNEE.
 *
 * It is a coarse model. It cannot see that Switzerland pays above the UK, that
 * Ireland's GDP is inflated by multinationals, or that a freelancer in Lagos
 * may bill a London client. The page says so wherever it shows one.
 *
 * A figure is then  usd_baselines[level] × index × role_index[role]  (exactly the
 * formula the researched markets use), converted to ₹ lakh at the page's fx
 * rate. The browser does that sum at hover time; this file only carries indices.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8"));

const CAP = 0.62;
const KNEE = 0.6;
const EXPONENT = 0.45;

// The World Bank does not publish Taiwan (it is not a member). IMF WEO, 2024, nominal.
const MANUAL_GDP = { TWN: { value: 33000, year: "2024", note: "IMF WEO, not World Bank" } };

const benchmarks = read("salary", "data", "benchmarks.json");
const map = read("salary", "data", "world-map.json");
const intl = benchmarks.international;

async function worldBankGdp() {
    const url = "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?format=json&per_page=400&mrnev=1";
    const response = await fetch(url);
    if (!response.ok) throw new Error("World Bank answered " + response.status);
    const [, rows] = await response.json();
    const byIso = {};
    for (const row of rows) {
        if (row.value != null && row.countryiso3code) byIso[row.countryiso3code] = { value: row.value, year: row.date };
    }
    return byIso;
}

function indexFor(r) {
    return r >= KNEE ? CAP : CAP * Math.pow(r / KNEE, EXPONENT);
}

const gdp = { ...(await worldBankGdp()), ...MANUAL_GDP };
if (!gdp.USA) throw new Error("No US GDP per person; cannot scale the model");
const us = gdp.USA.value;

const researched = {};
for (const c of intl.countries) researched[c.id] = c.index;

const estimates = {};
const missing = [];
for (const country of map.groups) {
    if (researched[country.id] !== undefined) continue;
    const g = country.iso && gdp[country.iso];
    if (!g) { missing.push(country.name); continue; }
    estimates[country.id] = [Math.round(indexFor(g.value / us) * 1000) / 1000, Math.round(g.value), g.year];
}

const out = {
    generated_at: new Date().toISOString().slice(0, 10),
    basis: "Researched markets keep hand-set indices; every other country is modelled from World Bank GDP per person. See scripts/build-world-pay.js.",
    source: { indicator: "NY.GDP.PCAP.CD", publisher: "World Bank", us_gdp_per_person: Math.round(us) },
    model: { cap: CAP, knee: KNEE, exponent: EXPONENT },
    fx: intl.fx,
    usd_baselines: intl.usd_baselines,
    role_index: intl.role_index,
    researched,
    estimates
};
const file = path.join(root, "salary", "data", "world-pay.json");
fs.writeFileSync(file, JSON.stringify(out));

console.log(`${Object.keys(researched).length} researched · ${Object.keys(estimates).length} modelled · ${missing.length} with no estimate · ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
console.log("no estimate (no income figure):", missing.join(", "));
const show = (id) => estimates[id] ? `${id} idx ${estimates[id][0]} (GDP/person $${estimates[id][1]}, ${estimates[id][2]})` : `${id} idx ${researched[id]} (researched)`;
console.log(["india" in estimates ? "india" : "india", "brazil", "poland", "nigeria", "switzerland", "japan", "mexico", "philippines"].map(show).join("\n"));
console.log("model check, India:", `${(indexFor(gdp.IND.value / us) * intl.usd_baselines.senior[1]).toFixed(0)} USD senior median vs ₹24 LPA = $${(24e5 / intl.fx.usd_inr).toFixed(0)}`);
