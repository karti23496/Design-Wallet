/**
 * Server side for /salary/submit/. Paste into a Google Apps Script project
 * bound to its OWN spreadsheet — not the portfolio one — then Deploy → New
 * deployment → Web app, execute as yourself, access "Anyone". Put the resulting
 * /exec URL into SUBMISSION_URL in salary/submit/submit-salary.js.
 *
 * Shape follows submit-portfolio/google-apps-script.js: LockService so two
 * simultaneous posts can't collide, ensureHeaders so a fresh sheet sets itself
 * up, and a Status dropdown Karthik drives.
 *
 * Rows land as "Pending". scripts/build-salary.js only ever reads "Approved",
 * so nothing reaches the site until it has been looked at.
 */

var SPREADSHEET_ID = "PASTE_YOUR_SALARY_SPREADSHEET_ID_HERE";
var SHEET_NAME = "Salary submissions";
var STATUS_OPTIONS = ["Pending", "Approved", "Rejected"];

/* Must match EXPECTED_HEADERS in scripts/build-salary.js. The build asserts this
   row before trusting a single value, because gviz answers `ok` with some other
   tab's rows when the tab name is wrong. Change one, change both. */
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

function doPost(event) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
        var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
        if (!sheet) {
            throw new Error("Sheet tab not found: " + SHEET_NAME);
        }

        ensureHeaders(sheet);

        var params = (event && event.parameter) || {};

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
            params.role || "",
            params.level || "",
            years,
            params.city || "",
            params.workMode || "",
            params.employerLocation || "india",
            params.companyType || "",
            params.companySize || "",
            ctc,
            params.variableOrBonusLpa || "",
            params.hasEsops || "",
            params.salaryEffectiveFrom || "",
            params.gender || "",
            "community",
            "Pending"
        ]);

        applyStatusValidation(sheet, sheet.getLastRow());

        return jsonResponse({ ok: true });
    } catch (error) {
        return jsonResponse({ ok: false, error: error.message });
    } finally {
        lock.releaseLock();
    }
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

/** Run once by hand to put the dropdown on rows that predate it. */
function setupSalaryStatusDropdowns() {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
        throw new Error("Sheet tab not found: " + SHEET_NAME);
    }

    ensureHeaders(sheet);

    var lastRow = Math.max(sheet.getLastRow(), 2);
    var column = getHeaderColumn(sheet, "Status") || HEADERS.length;
    var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUS_OPTIONS, true)
        .setAllowInvalid(false)
        .build();

    sheet.getRange(2, column, lastRow - 1, 1).setDataValidation(rule);
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
