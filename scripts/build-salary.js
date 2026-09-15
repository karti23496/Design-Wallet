/**
 * build-salary.js — Sheet → aggregate → salary/data/salaries.json
 *
 * Reads the hand-authored seed in salary/data/benchmarks.json, optionally pulls
 * approved community submissions from a Google Sheet, and writes one static JSON
 * file that /salary/ loads. The page never talks to Google.
 *
 * Run: npm run build-salary
 *
 * The Sheet is optional. Until SALARY_SHEET_ID is set the build runs on the seed
 * alone, which is how the dashboard ships on day one.
 *
 * See .claude/SALARY-PROJECT.md §4 and .claude/DECISIONS.md §12.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = resolve(ROOT, "salary/data/benchmarks.json");
const OUT_PATH = resolve(ROOT, "salary/data/salaries.json");

const METHODOLOGY_VERSION = 1;

/* Suppression threshold — below this many community reports a cell is not
   published at that grain and rolls up. Protects anonymity and credibility. */
const MIN_REPORTS = 5;

/* Rows older than this are dropped. Stale comp data is worse than none. */
const RECENCY_MONTHS = 24;

/* Sheet config. Leave SALARY_SHEET_ID unset to build from the seed only. */
const SHEET_ID = process.env.SALARY_SHEET_ID || "";
const SHEET_TAB = process.env.SALARY_SHEET_TAB || "Salary submissions";

/* The exact header row the Sheet must have. gviz silently returns SOME OTHER
   TAB's rows when the tab name is wrong (DECISIONS §8c) — it never errors. So
   the header is the signature we verify before trusting a single row. */
const EXPECTED_HEADERS = [
    "timestamp",
    "role",
    "level",
    "years_of_experience",
    "city",
    "work_mode",
    "employer_location",
    "company_type",
    "company_size",
    "annual_fixed_ctc_lpa",
    "variable_or_bonus_lpa",
    "has_esops",
    "salary_effective_from",
    "gender",
    "source",
    "status"
];

/* Grain codes, kept one character because they repeat ~1,500 times in the output.
   c = city (community) · t = tier · n = national · b = benchmark */
const GRAIN = { CITY: "c", TIER: "t", NATIONAL: "n", BENCHMARK: "b" };

// ── helpers ─────────────────────────────────────────────────────────────────

function round(value, places = 1) {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

function normalizeHeader(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/** Linear-interpolated percentile over a sorted numeric array. */
function percentile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    const position = (sorted.length - 1) * p;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Drop points beyond 1.5×IQR. Guards against fat-finger and joke entries that
    got past review. Needs enough points for an IQR to mean anything. */
function trimOutliers(values) {
    if (values.length < 8) return values;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = percentile(sorted, 0.25);
    const q3 = percentile(sorted, 0.75);
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    return sorted.filter((value) => value >= low && value <= high);
}

/** [p25, p50, p75, n, grain] — the shape every cell in the output uses. */
function summarize(values, grain) {
    const trimmed = trimOutliers(values);
    if (!trimmed.length) return null;
    const sorted = [...trimmed].sort((a, b) => a - b);
    return [
        round(percentile(sorted, 0.25)),
        round(percentile(sorted, 0.5)),
        round(percentile(sorted, 0.75)),
        sorted.length,
        grain
    ];
}

function scaleBenchmark(baseline, factor) {
    return [
        round(baseline[0] * factor),
        round(baseline[1] * factor),
        round(baseline[2] * factor),
        0,
        GRAIN.BENCHMARK
    ];
}

// ── Sheet ───────────────────────────────────────────────────────────────────

/** Minimal CSV parser — handles quoted fields, embedded commas and doubled quotes. */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (char !== "\r") {
            field += char;
        }
    }

    if (field || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((entry) => entry.some((cell) => String(cell).trim()));
}

async function fetchSubmissions() {
    if (!SHEET_ID) {
        console.log("· No SALARY_SHEET_ID set — building from the seed only.");
        return [];
    }

    const url =
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}` +
        `/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}` +
        `&cachebust=${Date.now()}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Sheet fetch failed: HTTP ${response.status}`);
    }

    const rows = parseCsv(await response.text());
    if (!rows.length) {
        throw new Error("Sheet returned no rows at all — refusing to build.");
    }

    // THE GUARD. gviz answers `ok` with another tab's data when the tab name is
    // wrong, so a successful response proves nothing. Only the header does.
    const headers = rows[0].map(normalizeHeader);
    const missing = EXPECTED_HEADERS.filter((name) => !headers.includes(name));
    if (missing.length) {
        throw new Error(
            `Sheet header does not match the expected schema — missing: ${missing.join(", ")}.\n` +
            `  Got: ${headers.join(", ")}\n` +
            `  This usually means SALARY_SHEET_TAB ("${SHEET_TAB}") is wrong. gviz does not\n` +
            `  error on a bad tab name, it returns a DIFFERENT tab. Refusing to build.`
        );
    }

    return rows.slice(1).map((cells) => {
        const record = {};
        headers.forEach((name, index) => {
            if (name) record[name] = String(cells[index] ?? "").trim();
        });
        return record;
    });
}

/** Approved, recent, numerically sane rows only. */
function cleanSubmissions(rows) {
    const cutoffYear = new Date().getFullYear() - Math.floor(RECENCY_MONTHS / 12);
    const kept = [];

    for (const row of rows) {
        if (row.status.toLowerCase() !== "approved") continue;

        const ctc = Number.parseFloat(row.annual_fixed_ctc_lpa);
        if (!Number.isFinite(ctc) || ctc < 0.5 || ctc > 200) continue;

        const year = Number.parseInt(row.salary_effective_from, 10);
        if (Number.isFinite(year) && year < cutoffYear) continue;

        kept.push({
            role: row.role,
            level: row.level,
            city: row.city,
            workMode: row.work_mode,
            employer: row.employer_location || "india",
            companyType: row.company_type,
            ctc
        });
    }

    return kept;
}

// ── aggregation ─────────────────────────────────────────────────────────────

function groupBy(rows, keyFn) {
    const map = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row.ctc);
    }
    return map;
}

/**
 * A density shape for the distribution chart, as 24 normalized 0–1 bins.
 *
 * With enough real reports these are actual counts. Below that they are a
 * log-normal curve fitted to the quartiles — which is why the page labels the
 * axis "relative density" and never prints a count. A shape derived from the
 * published quartiles is a picture of the range, not an invented sample.
 */
function distributionShape(summary, values) {
    const [p25, p50, p75] = summary;
    const min = Math.max(0, p25 - (p50 - p25) * 2.2);
    const max = p75 + (p75 - p50) * 2.6;
    const bins = 24;
    const width = (max - min) / bins;
    if (!(width > 0)) return null;

    const counts = new Array(bins).fill(0);

    if (values && values.length >= MIN_REPORTS * 4) {
        for (const value of values) {
            const index = Math.min(bins - 1, Math.max(0, Math.floor((value - min) / width)));
            counts[index] += 1;
        }
    } else {
        // Log-normal fitted so the median lands on p50 and the quartile spread
        // matches p25/p75.
        const mu = Math.log(Math.max(p50, 0.01));
        const sigma = Math.max(
            0.08,
            (Math.log(Math.max(p75, 0.02)) - Math.log(Math.max(p25, 0.01))) / 1.349
        );
        for (let i = 0; i < bins; i += 1) {
            const x = min + width * (i + 0.5);
            if (x <= 0) continue;
            const z = (Math.log(x) - mu) / sigma;
            counts[i] = Math.exp(-0.5 * z * z) / x;
        }
    }

    const peak = Math.max(...counts);
    if (!(peak > 0)) return null;

    return {
        min: round(min),
        max: round(max),
        bins: counts.map((count) => round(count / peak, 3))
    };
}

function build(seed, submissions) {
    const cityById = new Map(seed.cities.map((city) => [city.id, city]));
    const modeById = new Map(seed.work_modes.map((mode) => [mode.id, mode]));
    const employerById = new Map(seed.employers.map((employer) => [employer.id, employer]));
    const companyById = new Map(seed.company_types.map((company) => [company.id, company]));

    const byCity = groupBy(submissions, (row) => `${row.role}|${row.level}|${row.city}`);
    const byTier = groupBy(submissions, (row) => {
        const city = cityById.get(row.city);
        return city ? `${row.role}|${row.level}|${city.tier}` : null;
    });
    const byNational = groupBy(submissions, (row) => `${row.role}|${row.level}`);
    const byMode = groupBy(submissions, (row) => `${row.role}|${row.level}|${row.workMode}`);
    const byEmployer = groupBy(submissions, (row) => `${row.role}|${row.level}|${row.employer}`);
    const byCompany = groupBy(submissions, (row) => `${row.role}|${row.level}|${row.companyType}`);

    /** Community summary if it clears the threshold, else null. */
    const community = (map, key) => {
        const values = map.get(key);
        if (!values || values.length < MIN_REPORTS) return null;
        return summarize(values, GRAIN.CITY);
    };

    const output = {
        generated_at: new Date().toISOString().slice(0, 10),
        methodology_version: METHODOLOGY_VERSION,
        currency: seed.currency,
        unit: seed.unit,
        community_submission_count: submissions.length,
        min_reports: MIN_REPORTS,
        roles: seed.roles,
        levels: seed.levels,
        cities: seed.cities,
        tiers: seed.tiers,
        work_modes: seed.work_modes,
        employers: seed.employers,
        company_types: seed.company_types,
        extras: Object.fromEntries(
            Object.entries(seed.extras).filter(([key]) => !key.startsWith("_"))
        ),
        cells: {},
        national: {},
        tier: {},
        workmode: {},
        employer: {},
        company: {},
        distribution: {},
        highest_city: {},
        leaderboard: [],
        fx: seed.international.fx,
        countries: seed.international.countries,
        country_cells: {}
    };

    // Country markets, for a foreign employer. Seed only — the submission form
    // collects Indian cities, so there is no community data to cascade from.
    // Stored in INR lakh like every other cell; the page converts for display.
    const usdToLakh = seed.international.fx.usd_inr / 100000;

    for (const role of seed.roles) {
        for (const level of seed.levels) {
            const pairKey = `${role.id}|${level.id}`;
            const baseline = seed.baselines[pairKey];
            if (!baseline) continue;

            // National — community if it clears, else the seed baseline as-is.
            const nationalValues = byNational.get(pairKey);
            const nationalCommunity =
                nationalValues && nationalValues.length >= MIN_REPORTS
                    ? summarize(nationalValues, GRAIN.NATIONAL)
                    : null;
            const national = nationalCommunity || [...baseline, 0, GRAIN.BENCHMARK];
            output.national[pairKey] = national;

            output.distribution[pairKey] = distributionShape(national, nationalValues);

            const usdBaseline = seed.international.usd_baselines[level.id];
            const roleIndex = seed.international.role_index[role.id];
            if (usdBaseline && roleIndex) {
                for (const country of seed.international.countries) {
                    output.country_cells[`${pairKey}|${country.id}`] =
                        scaleBenchmark(usdBaseline, usdToLakh * country.index * roleIndex);
                }
            }

            // Tier.
            for (const tier of seed.tiers) {
                const tierKey = `${pairKey}|${tier.id}`;
                const tierValues = byTier.get(tierKey);
                const tierCommunity =
                    tierValues && tierValues.length >= MIN_REPORTS
                        ? summarize(tierValues, GRAIN.TIER)
                        : null;
                if (tierCommunity) {
                    output.tier[tierKey] = tierCommunity;
                } else {
                    const members = seed.cities.filter((city) => city.tier === tier.id);
                    const meanIndex =
                        members.reduce((sum, city) => sum + city.index, 0) / members.length;
                    output.tier[tierKey] = scaleBenchmark(baseline, meanIndex);
                }
            }

            // City — the suppression cascade lives here.
            let best = null;
            for (const city of seed.cities) {
                const cityKey = `${pairKey}|${city.id}`;
                const cell =
                    community(byCity, cityKey) ||
                    output.tier[`${pairKey}|${city.tier}`] ||
                    scaleBenchmark(baseline, city.index);

                // A tier fallback is the tier's own figure, so re-scale from the
                // benchmark instead when the tier cell is itself a benchmark —
                // otherwise every city in a tier shows an identical number.
                const resolved =
                    cell[4] === GRAIN.BENCHMARK ? scaleBenchmark(baseline, city.index) : cell;

                output.cells[cityKey] = resolved;

                if (!best || resolved[1] > best.median) {
                    best = { city: city.id, median: resolved[1] };
                }
            }

            if (best) {
                output.highest_city[pairKey] = [
                    best.city,
                    best.median,
                    round(((best.median - national[1]) / national[1]) * 100, 0)
                ];
                output.leaderboard.push({
                    role: role.id,
                    level: level.id,
                    city: best.city,
                    median: best.median
                });
            }

            // Work mode, employer, company type — national grain only. Crossing
            // these with city would put nearly every cell under the threshold.
            for (const mode of seed.work_modes) {
                const key = `${pairKey}|${mode.id}`;
                output.workmode[key] =
                    community(byMode, key) || scaleBenchmark(national.slice(0, 3), mode.index);
            }
            for (const employer of seed.employers) {
                const key = `${pairKey}|${employer.id}`;
                output.employer[key] =
                    community(byEmployer, key) ||
                    scaleBenchmark(national.slice(0, 3), employer.index);
            }
            for (const company of seed.company_types) {
                const key = `${pairKey}|${company.id}`;
                output.company[key] =
                    community(byCompany, key) ||
                    scaleBenchmark(national.slice(0, 3), company.index);
            }
        }
    }

    output.leaderboard.sort((a, b) => b.median - a.median);
    output.leaderboard = output.leaderboard.slice(0, 10);

    // Silence unused-map lint noise while keeping the lookups above readable.
    void modeById;
    void employerById;
    void companyById;

    return output;
}

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
    const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));

    const rawRows = await fetchSubmissions();
    const submissions = cleanSubmissions(rawRows);
    if (rawRows.length) {
        console.log(`· ${rawRows.length} rows read, ${submissions.length} approved and in-window.`);
    }

    const output = build(seed, submissions);

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(output), "utf8");

    const bytes = Buffer.byteLength(JSON.stringify(output));
    console.log(
        `✓ salary/data/salaries.json — ${Object.keys(output.cells).length} city cells, ` +
        `${output.community_submission_count} community rows, ${(bytes / 1024).toFixed(1)} KB`
    );
}

main().catch((error) => {
    console.error(`✗ build-salary failed: ${error.message}`);
    process.exit(1);
});
