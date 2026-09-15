/**
 * Server side for Know your money: stores submissions from /salary/submit/ and
 * serves the live community figures /salary/ reads.
 *
 * WHERE IT LIVES: rows go to the "Salary Submission" tab of the private
 * subscriber-responses spreadsheet (restricted, shared with no one). That
 * spreadsheet also takes newsletter and portfolio submissions through their own
 * Apps Script projects, so this script is a SEPARATE, STANDALONE project
 * (script.google.com → New project) that opens the sheet by ID. Do not paste
 * it into the sheet's Extensions → Apps Script project — its doPost would
 * replace the newsletter's.
 *
 * SET UP (once):
 *   1. script.google.com → New project, name it "Design Wallet – Salary".
 *   2. Replace the sample code with this whole file, save.
 *   3. Run testSetup once and allow access (writes the header row).
 *   4. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *      ("Anyone" can call the web app; it does NOT share the spreadsheet.)
 *   5. Copy the /exec URL into DW_SALARY_ENDPOINT in salary/endpoint.js.
 *   After editing this file later: Deploy → Manage deployments → edit → New
 *   version, or the live URL keeps running the old code.
 *
 * doPost  — one submission → one row. No approval step (Karthik's call,
 *           2026-09-15): rows land as "Approved" and count straight away. Set a
 *           row's Status to "Rejected" to pull it out of the dashboard.
 * doGet   — the community figures: percentiles per role/level at each grain,
 *           ONLY for groups with MIN_REPORTS or more. Raw rows never leave the
 *           sheet, so no individual submission can be read back from the site.
 *
 * The option ids below must match salary/data/benchmarks.json. Add a role, city
 * or company type there and add it here too, or its submissions are refused.
 */

// The private subscriber-responses spreadsheet. Never point this at the public
// Design Wallet database: that one is readable by anyone, rows and all.
var SPREADSHEET_ID = "1aKs9XEJUsbmpax583dCsVPEJzmZ5F_L3u-xf1PFRLGc";
var SHEET_NAME = "Salary Submission";
var STATUS_OPTIONS = ["Approved", "Rejected"];

var MIN_REPORTS = 5;          // below this a group is not published
var RECENCY_MONTHS = 24;      // older salaries are ignored
var CACHE_SECONDS = 60;       // doGet recomputes at most once a minute
var MAX_POSTS_PER_MINUTE = 20; // flood guard across all visitors

var ROLES = ["product-designer", "ux-researcher", "design-systems-designer", "visual-designer",
    "brand-designer", "3d-designer", "motion-designer", "graphic-designer", "illustrator",
    "animator", "video-editor"];
var LEVELS = ["intern", "junior", "mid", "senior", "lead", "manager", "director", "vp"];
var CITY_TIERS = {
    "bangalore": "tier-1", "mumbai": "tier-1", "delhi-ncr": "tier-1", "hyderabad": "tier-1",
    "pune": "tier-1", "chennai": "tier-1", "ahmedabad": "tier-2", "kolkata": "tier-2",
    "chandigarh": "tier-2", "kochi": "tier-2", "jaipur": "tier-2", "coimbatore": "tier-2",
    "indore": "tier-2"
};
var WORK_MODES = ["onsite", "hybrid", "remote"];
var EMPLOYERS = ["india", "foreign"];
var COMPANY_TYPES = ["product", "enterprise", "it-services", "freelance", "agency"];
// Every form field is required; these four also accept "NIL" (prefer not to say).
var COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+", "NIL"];
var ESOP_ANSWERS = ["Yes", "No", "NIL"];
var GENDERS = ["Woman", "Man", "Non-binary", "NIL"];

/* Column order of the sheet. scripts/build-salary.js checks the same names. */
var HEADERS = [
    "Timestamp",
    "Role",
    "Level",
    "Years of experience",
    "City",
    "Work mode",
    "Employer location",
    "Company type",
    "Company size",
    "Annual fixed CTC LPA",
    "Variable or bonus LPA",
    "Has ESOPs",
    "Salary effective from",
    "Gender",
    "Source",
    "Status"
];

// ── write ────────────────────────────────────────────────────────────────────

function doPost(event) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
        if (!underFloodLimit()) {
            throw new Error("Too many submissions right now");
        }

        var sheet = getSheet();
        ensureHeaders(sheet);

        var params = (event && event.parameter) || {};

        var role = oneOf(params.role, ROLES, "role");
        var level = oneOf(params.level, LEVELS, "level");
        var city = oneOf(params.city, Object.keys(CITY_TIERS), "city");
        var workMode = oneOf(params.workMode, WORK_MODES, "work mode");
        var employer = oneOf(params.employerLocation, EMPLOYERS, "employer");
        var companyType = oneOf(params.companyType, COMPANY_TYPES, "company type");
        var companySize = oneOf(params.companySize, COMPANY_SIZES, "company size");
        var hasEsops = oneOf(params.hasEsops, ESOP_ANSWERS, "ESOP answer");
        var gender = oneOf(params.gender, GENDERS, "gender");
        var effectiveYear = parseInt(params.salaryEffectiveFrom, 10);
        if (!isFinite(effectiveYear) || effectiveYear < 2000 || effectiveYear > new Date().getFullYear()) {
            throw new Error("Salary year out of range");
        }

        var variable = String(params.variableOrBonusLpa || "").trim();
        if (/^nil$/i.test(variable)) {
            variable = "NIL";
        } else {
            var variableNumber = parseFloat(variable);
            if (!isFinite(variableNumber) || variableNumber < 0 || variableNumber > 200) {
                throw new Error("Variable pay must be a number or NIL");
            }
            variable = variableNumber;
        }

        var ctc = parseFloat(params.annualFixedCtcLpa);
        if (!isFinite(ctc) || ctc < 0.5 || ctc > 200) {
            throw new Error("Fixed CTC out of range");
        }

        var years = parseFloat(params.yearsOfExperience);
        if (!isFinite(years) || years < 0 || years > 45) {
            throw new Error("Years of experience out of range");
        }

        sheet.appendRow([
            new Date(),
            role,
            level,
            years,
            city,
            workMode,
            employer,
            companyType,
            companySize,
            ctc,
            variable,
            hasEsops,
            effectiveYear,
            gender,
            "community",
            "Approved"
        ]);

        applyStatusValidation(sheet, sheet.getLastRow());

        // The next dashboard poll should see this row, not a minute-old cache.
        CacheService.getScriptCache().remove("community");

        return jsonResponse({ ok: true });
    } catch (error) {
        return jsonResponse({ ok: false, error: error.message });
    } finally {
        lock.releaseLock();
    }
}

function oneOf(value, allowed, label) {
    var clean = String(value || "").trim();
    if (allowed.indexOf(clean) === -1) {
        throw new Error("Unknown " + label);
    }
    return clean;
}

function underFloodLimit() {
    var cache = CacheService.getScriptCache();
    var key = "posts-" + Math.floor(Date.now() / 60000);
    var count = Number(cache.get(key) || 0) + 1;
    cache.put(key, String(count), 120);
    return count <= MAX_POSTS_PER_MINUTE;
}

// ── read ─────────────────────────────────────────────────────────────────────

function doGet() {
    var cache = CacheService.getScriptCache();
    var cached = cache.get("community");
    if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }

    var body = JSON.stringify(buildCommunity());
    // CacheService caps a value at 100 KB; skip caching rather than fail.
    if (body.length < 95000) cache.put("community", body, CACHE_SECONDS);
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Same rules as scripts/build-salary.js: approved, recent, in-range rows;
 * outliers beyond 1.5×IQR dropped; a group published only at MIN_REPORTS.
 * Every cell is [p25, p50, p75, n, "c"].
 */
function buildCommunity() {
    var rows = readRows();
    var groups = { national: {}, tier: {}, cells: {}, workmode: {}, employer: {}, company: {} };

    rows.forEach(function (row) {
        var pair = row.role + "|" + row.level;
        push(groups.national, pair, row.ctc);
        push(groups.tier, pair + "|" + CITY_TIERS[row.city], row.ctc);
        push(groups.cells, pair + "|" + row.city, row.ctc);
        push(groups.workmode, pair + "|" + row.workMode, row.ctc);
        push(groups.employer, pair + "|" + row.employer, row.ctc);
        push(groups.company, pair + "|" + row.companyType, row.ctc);
    });

    var out = {
        updated_at: new Date().toISOString(),
        submission_count: rows.length,
        min_reports: MIN_REPORTS
    };

    Object.keys(groups).forEach(function (bucket) {
        out[bucket] = {};
        Object.keys(groups[bucket]).forEach(function (key) {
            var values = groups[bucket][key];
            if (values.length < MIN_REPORTS) return;
            var cell = summarize(values);
            if (cell) out[bucket][key] = cell;
        });
    });

    return out;
}

function readRows() {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var values = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    var index = {};
    values[0].forEach(function (name, column) {
        index[normalizeHeader(name)] = column;
    });

    var cutoffYear = new Date().getFullYear() - Math.floor(RECENCY_MONTHS / 12);
    var kept = [];

    for (var r = 1; r < values.length; r += 1) {
        var row = values[r];
        var get = function (name) {
            return index[name] === undefined ? "" : row[index[name]];
        };

        if (String(get("status")).trim().toLowerCase() !== "approved") continue;

        var ctc = parseFloat(get("annual_fixed_ctc_lpa"));
        if (!isFinite(ctc) || ctc < 0.5 || ctc > 200) continue;

        var year = parseInt(get("salary_effective_from"), 10);
        if (isFinite(year) && year < cutoffYear) continue;

        var city = String(get("city")).trim();
        if (!CITY_TIERS[city]) continue;

        kept.push({
            role: String(get("role")).trim(),
            level: String(get("level")).trim(),
            city: city,
            workMode: String(get("work_mode")).trim(),
            employer: String(get("employer_location")).trim() || "india",
            companyType: String(get("company_type")).trim(),
            ctc: ctc
        });
    }

    return kept;
}

function push(map, key, value) {
    if (!map[key]) map[key] = [];
    map[key].push(value);
}

function percentile(sorted, p) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var position = (sorted.length - 1) * p;
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    if (sorted.length >= 8) {
        var q1 = percentile(sorted, 0.25);
        var q3 = percentile(sorted, 0.75);
        var iqr = q3 - q1;
        sorted = sorted.filter(function (value) {
            return value >= q1 - 1.5 * iqr && value <= q3 + 1.5 * iqr;
        });
    }
    if (sorted.length < MIN_REPORTS) return null;
    return [
        round1(percentile(sorted, 0.25)),
        round1(percentile(sorted, 0.5)),
        round1(percentile(sorted, 0.75)),
        sorted.length,
        "c"
    ];
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

// ── sheet helpers ────────────────────────────────────────────────────────────

function getSheet() {
    var book = SPREADSHEET_ID
        ? SpreadsheetApp.openById(SPREADSHEET_ID)
        : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = book.getSheetByName(SHEET_NAME);
    if (!sheet) {
        throw new Error("Sheet tab not found: " + SHEET_NAME);
    }
    return sheet;
}

function ensureHeaders(sheet) {
    var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    var hasHeaders = current.some(function (value) {
        return String(value || "").trim();
    });

    if (!hasHeaders) {
        sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
        sheet.setFrozenRows(1);
    }
}

function applyStatusValidation(sheet, row) {
    var column = getHeaderColumn(sheet, "Status") || HEADERS.length;
    var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUS_OPTIONS, true)
        .setAllowInvalid(false)
        .build();

    sheet.getRange(row, column).setDataValidation(rule);
}

/** Run once by hand from the Apps Script editor to check the setup: it writes
    the header row if missing and logs what doGet would serve. */
function testSetup() {
    var sheet = getSheet();
    ensureHeaders(sheet);
    Logger.log(JSON.stringify(buildCommunity()).slice(0, 2000));
}

function getHeaderColumn(sheet, headerName) {
    var lastColumn = sheet.getLastColumn();
    if (!lastColumn) return 0;

    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    var target = normalizeHeader(headerName);

    for (var i = 0; i < headers.length; i += 1) {
        if (normalizeHeader(headers[i]) === target) {
            return i + 1;
        }
    }

    return 0;
}

function normalizeHeader(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function jsonResponse(payload) {
    return ContentService
        .createTextOutput(JSON.stringify(payload))
        .setMimeType(ContentService.MimeType.JSON);
}
