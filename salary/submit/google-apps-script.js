/**
 * Server side for BOTH Design Wallet forms.
 *
 *   Know your money  — stores submissions from /salary/submit/ and serves the
 *                      live community figures /salary/ reads.
 *   Portfolios       — stores submissions from /submit-portfolio/ and serves
 *                      the approved ones to /wall-of-portfolios/.
 *
 * WHY ONE SCRIPT FOR TWO FORMS (2026-09-16): the portfolio form had its own
 * deployment, and that deployment was at some point overwritten with THIS
 * script's code — so portfolio submissions were being posted into the salary
 * doPost, rejected, and silently lost. Rather than stand up a second project
 * that can drift the same way again, both forms now share this one deployment
 * and are told apart by an explicit field. One URL, one thing to redeploy.
 *
 *   doPost  routes on `form`: "portfolio" → portfolio, anything else → salary.
 *   doGet   routes on `type`: "portfolios" → portfolio, otherwise → salary.
 *
 * The salary paths are untouched by that routing: a request with no `form` or
 * `type` behaves exactly as it did before, so the dashboard keeps working.
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
 * doPost  — one submission → one row, landing as "Rejected" (Karthik's call,
 *           2026-09-16). It is invisible to the dashboard until he sets Status
 *           to "Approved" by hand. Approval is opt-in for BOTH forms now.
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

/* Karthik's call, 2026-09-16, reversing the 2026-09-15 "no approval needed":
   a salary row lands "Rejected" and is invisible to the dashboard until he
   sets it to "Approved" by hand — the same opt-in rule the portfolio wall
   uses. Nothing unreviewed can ever move a published figure.
   readRows() keeps only "approved" rows, so this is the whole mechanism. */
var SALARY_DEFAULT_STATUS = "Rejected";

/* ── Portfolios (/submit-portfolio/ → /wall-of-portfolios/) ────────────────
   A different tab of the SAME private spreadsheet. Unlike salary, portfolio
   entries are opt-in: every new row lands "Rejected" and only shows on the
   site once Karthik sets it to "Approved" by hand, so an unreviewed spam
   entry can never appear. */
var PORTFOLIO_SHEET_NAME = "List of design portfolio";
var PORTFOLIO_DEFAULT_STATUS = "Rejected";
var PORTFOLIO_CACHE_KEY = "portfolios-approved";

var PORTFOLIO_HEADERS = [
    "Submitted At",
    "Full Name",
    "Email Address",
    "Portfolio Website URL",
    "Designer Role",
    "Country / Location",
    "Primary Tools Used",
    "Portfolio Description",
    "Permission",
    "Status",
    // Filled in by hand at approval time. Both optional — a card falls back to
    // a lettered avatar and a title-only thumbnail when they are blank.
    "Profile Image URL",
    "Thumbnail URL"
];

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

/* Foreign-employer submissions give a COUNTRY instead of an Indian city — the
   same swap the dashboard makes, where city and country are mutually
   exclusive. Ids must match `countries` in salaries.json / benchmarks.json. */
var COUNTRIES = ["united-states", "australia", "united-kingdom", "netherlands",
    "singapore", "germany", "uae", "canada"];
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
    "Status",
    // Added 2026-09-16. Set instead of City when the employer is foreign; the
    // two are never both filled. Appended at the end by ensureHeaders, and
    // placed by NAME on write, so its position in the sheet doesn't matter.
    "Country"
];

// ── write ────────────────────────────────────────────────────────────────────

function doPost(event) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
        if (!underFloodLimit()) {
            throw new Error("Too many submissions right now");
        }

        var params = (event && event.parameter) || {};

        // Route first. `form=portfolio` is sent as a hidden field by
        // /submit-portfolio/; `portfolioUrl` is a belt-and-braces fallback in
        // case that field is ever dropped from the form. A salary submission
        // has neither, so it falls through to the original path below.
        if (String(params.form || "").toLowerCase() === "portfolio" || params.portfolioUrl) {
            return handlePortfolioPost(event, params);
        }

        var sheet = getSheet();
        ensureHeaders(sheet);

        var role = oneOf(params.role, ROLES, "role");
        var level = oneOf(params.level, LEVELS, "level");
        var workMode = oneOf(params.workMode, WORK_MODES, "work mode");
        var employer = oneOf(params.employerLocation, EMPLOYERS, "employer");

        // City and country are mutually exclusive, exactly as on the dashboard:
        // a foreign employer means the location question is "which country",
        // and an Indian one means "which city". Exactly one is ever stored.
        var city = "";
        var country = "";
        if (employer === "foreign") {
            country = oneOf(params.country, COUNTRIES, "country");
        } else {
            city = oneOf(params.city, Object.keys(CITY_TIERS), "city");
        }

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

        // By NAME, not position — the "Country" column was appended to the end
        // of an existing sheet, so a positional write would have put it in the
        // wrong place (and shifted nothing else, which is worse: it would look
        // fine). Same helper the portfolio path uses.
        writeRowByHeader(sheet, {
            "Timestamp": new Date(),
            "Role": role,
            "Level": level,
            "Years of experience": years,
            "City": city,
            "Country": country,
            "Work mode": workMode,
            "Employer location": employer,
            "Company type": companyType,
            "Company size": companySize,
            "Annual fixed CTC LPA": ctc,
            "Variable or bonus LPA": variable,
            "Has ESOPs": hasEsops,
            "Salary effective from": effectiveYear,
            "Gender": gender,
            "Source": "community",
            "Status": SALARY_DEFAULT_STATUS
        });

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

function doGet(event) {
    var params = (event && event.parameter) || {};

    if (String(params.type || "").toLowerCase() === "portfolios") {
        return servePortfolios(params.callback);
    }

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
    var groups = { national: {}, tier: {}, cells: {}, workmode: {}, employer: {}, company: {}, country: {} };

    rows.forEach(function (row) {
        var pair = row.role + "|" + row.level;

        // "National" means the Indian market, so a foreign-employer row must
        // not be averaged into it — it would drag every Indian figure upward.
        // Those rows are published under `country` instead.
        if (row.city) {
            push(groups.national, pair, row.ctc);
            push(groups.tier, pair + "|" + CITY_TIERS[row.city], row.ctc);
            push(groups.cells, pair + "|" + row.city, row.ctc);
        } else {
            push(groups.country, pair + "|" + row.country, row.ctc);
        }

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

        // A row carries EITHER an Indian city or a country. Anything with
        // neither is unusable, but a foreign row without a city is normal and
        // must not be dropped — that was the trap: the old check discarded
        // every foreign-employer submission before it could be counted.
        var city = String(get("city")).trim();
        var country = String(get("country")).trim();
        if (!CITY_TIERS[city]) city = "";
        if (COUNTRIES.indexOf(country) === -1) country = "";
        if (!city && !country) continue;

        kept.push({
            role: String(get("role")).trim(),
            level: String(get("level")).trim(),
            city: city,
            country: country,
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

// ── portfolios ───────────────────────────────────────────────────────────────

/** One submission from /submit-portfolio/ → one row, always "Rejected". */
function handlePortfolioPost(event, params) {
    var sheet = getPortfolioSheet();
    ensurePortfolioHeaders(sheet);

    var multi = (event && event.parameters) || {};
    var tools = multi.primaryTools ? multi.primaryTools.join(", ") : "";

    var url = String(params.portfolioUrl || "").trim();
    if (!/^https?:\/\//i.test(url)) {
        throw new Error("Portfolio URL must start with http:// or https://");
    }
    if (!String(params.fullName || "").trim()) {
        throw new Error("Full name is required");
    }

    writeRowByHeader(sheet, {
        "Submitted At": new Date(),
        "Full Name": String(params.fullName || "").trim(),
        "Email Address": String(params.email || "").trim(),
        "Portfolio Website URL": url,
        "Designer Role": String(params.designerRole || "").trim(),
        "Country / Location": String(params.location || "").trim(),
        "Primary Tools Used": tools,
        "Portfolio Description": String(params.portfolioDescription || "").trim(),
        "Permission": params.permission === "on" ? "Yes" : String(params.permission || "").trim(),
        "Status": PORTFOLIO_DEFAULT_STATUS
    });

    applyPortfolioStatusValidation(sheet, sheet.getLastRow());
    CacheService.getScriptCache().remove(PORTFOLIO_CACHE_KEY);

    return jsonResponse({ ok: true });
}

/** The approved rows, for /wall-of-portfolios/. JSONP when a callback is given:
    the wall reads this cross-origin and Apps Script sends no CORS headers. */
function servePortfolios(callback) {
    var cache = CacheService.getScriptCache();
    var body = cache.get(PORTFOLIO_CACHE_KEY);

    if (!body) {
        body = JSON.stringify({ ok: true, items: getApprovedPortfolios() });
        if (body.length < 95000) cache.put(PORTFOLIO_CACHE_KEY, body, CACHE_SECONDS);
    }

    if (callback && /^[a-zA-Z_$][\w.$]*$/.test(callback)) {
        return ContentService
            .createTextOutput(callback + "(" + body + ");")
            .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/** Approved rows only. The email address is deliberately NOT returned — the
    website has no use for it, and this endpoint is public. */
function getApprovedPortfolios() {
    var sheet = getPortfolioSheet();
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    var headers = values[0].map(normalizeHeader);

    return values.slice(1).map(function (row) {
        var record = {};
        headers.forEach(function (header, index) {
            if (header) record[header] = row[index];
        });
        return record;
    }).filter(function (record) {
        return String(record.status || "").trim().toLowerCase() === "approved" &&
            String(record.full_name || "").trim() &&
            String(record.portfolio_website_url || "").trim();
    }).map(function (record) {
        return {
            fullName: String(record.full_name || "").trim(),
            portfolioUrl: String(record.portfolio_website_url || "").trim(),
            designerRole: String(record.designer_role || "").trim(),
            location: String(record.country_location || "").trim(),
            description: String(record.portfolio_description || "").trim(),
            profileImage: String(record.profile_image_url || "").trim(),
            thumbnail: String(record.thumbnail_url || "").trim()
        };
    });
}

/* ⚠️ Writes each value into the column whose HEADER matches, never by position.
 *
 * Not defensive padding — the live tab really does disagree with
 * PORTFOLIO_HEADERS. It carries a "Social Link" column at position 7 that this
 * script has no field for (the form dropped it), so a positional appendRow
 * would put the tools into Social Link, the description into Primary Tools
 * Used and THE STATUS INTO PERMISSION — leaving Status blank, which never
 * matches "approved", so no submission could ever reach the site.
 */
function writeRowByHeader(sheet, values) {
    var lastColumn = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(normalizeHeader);
    var row = [];
    var i;

    for (i = 0; i < lastColumn; i += 1) row.push("");

    Object.keys(values).forEach(function (key) {
        var index = headers.indexOf(normalizeHeader(key));
        if (index !== -1) row[index] = values[key];
    });

    sheet.appendRow(row);
}

function getPortfolioSheet() {
    var book = SPREADSHEET_ID
        ? SpreadsheetApp.openById(SPREADSHEET_ID)
        : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = book.getSheetByName(PORTFOLIO_SHEET_NAME);
    if (!sheet) {
        throw new Error("Sheet tab not found: " + PORTFOLIO_SHEET_NAME);
    }
    return sheet;
}

/** Writes the header row when the tab is empty, and appends any header that is
    missing — so the two image columns arrive without anyone editing the sheet. */
function ensurePortfolioHeaders(sheet) {
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    var hasHeaders = current.some(function (value) {
        return String(value || "").trim();
    });

    if (!hasHeaders) {
        sheet.getRange(1, 1, 1, PORTFOLIO_HEADERS.length).setValues([PORTFOLIO_HEADERS]);
        sheet.setFrozenRows(1);
        return;
    }

    var present = current.map(normalizeHeader);
    PORTFOLIO_HEADERS.forEach(function (header) {
        if (present.indexOf(normalizeHeader(header)) === -1) {
            sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
            present.push(normalizeHeader(header));
        }
    });
}

function applyPortfolioStatusValidation(sheet, row) {
    var column = getHeaderColumn(sheet, "Status");
    if (!column) return;

    var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUS_OPTIONS, true)
        .setAllowInvalid(false)
        .build();

    sheet.getRange(row, column).setDataValidation(rule);
}

/** Run ONCE by hand after deploying. Adds the two image columns, puts the
    Approved/Rejected dropdown on every row, and converts the old statuses:
    "Uploaded" meant live, so it becomes "Approved"; everything else ("In
    Review", "New") becomes "Rejected", which is the safe direction. */
function migratePortfolioStatuses() {
    var sheet = getPortfolioSheet();
    ensurePortfolioHeaders(sheet);

    var column = getHeaderColumn(sheet, "Status");
    if (!column) throw new Error("No Status column found.");

    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
        var range = sheet.getRange(2, column, lastRow - 1, 1);
        var converted = range.getValues().map(function (cell) {
            var value = String(cell[0] || "").trim().toLowerCase();
            var isLive = value === "uploaded" || value === "upload" || value === "approved";
            return [isLive ? "Approved" : "Rejected"];
        });

        // Clear validation first: the old rule rejects the new values.
        range.setDataValidation(null);
        range.setValues(converted);
    }

    // Cover the rows in use plus room to grow, so rows added by hand get the
    // dropdown too.
    var rows = Math.max(lastRow, 2) - 1 + 200;
    var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUS_OPTIONS, true)
        .setAllowInvalid(false)
        .build();
    sheet.getRange(2, column, rows, 1).setDataValidation(rule);

    CacheService.getScriptCache().remove(PORTFOLIO_CACHE_KEY);
    Logger.log("Portfolio statuses migrated. Approved rows now: " +
        getApprovedPortfolios().length);
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

/* Writes the header row on an empty tab, and APPENDS any header that is
   missing from an existing one. The append matters: the live sheet predates
   the "Country" column, and the old version of this function did nothing at
   all once headers existed, so the column would never have arrived. Safe to
   run on every post — it only ever adds. */
function ensureHeaders(sheet) {
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    var hasHeaders = current.some(function (value) {
        return String(value || "").trim();
    });

    if (!hasHeaders) {
        sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
        sheet.setFrozenRows(1);
        return;
    }

    var present = current.map(normalizeHeader);
    HEADERS.forEach(function (header) {
        if (present.indexOf(normalizeHeader(header)) === -1) {
            sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
            present.push(normalizeHeader(header));
        }
    });
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
