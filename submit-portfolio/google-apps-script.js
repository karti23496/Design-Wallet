var SPREADSHEET_ID = "1aKs9XEJUsbmpax583dCsVPEJzmZ5F_L3u-xf1PFRLGc";
var SHEET_NAME = "List of design portfolio";
var STATUS_OPTIONS = ["In Review", "Uploaded"];

function doPost(event) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error("Sheet tab not found: " + SHEET_NAME);
    }

    ensureHeaders(sheet);

    var params = event && event.parameter ? event.parameter : {};
    var multiParams = event && event.parameters ? event.parameters : {};
    var tools = multiParams.primaryTools ? multiParams.primaryTools.join(", ") : "";

    sheet.appendRow([
      new Date(),
      params.fullName || "",
      params.email || "",
      params.portfolioUrl || "",
      params.designerRole || "",
      params.location || "",
      tools,
      params.portfolioDescription || "",
      params.permission === "on" ? "Yes" : params.permission || "",
      "In Review"
    ]);
    applyStatusValidation(sheet, sheet.getLastRow());

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  } finally {
    lock.releaseLock();
  }
}

function doGet(event) {
  try {
    var payload = {
      ok: true,
      items: getUploadedPortfolioItems()
    };
    var callback = event && event.parameter ? event.parameter.callback : "";

    if (callback && /^[a-zA-Z_$][\w.$]*$/.test(callback)) {
      return ContentService
        .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function ensureHeaders(sheet) {
  var headers = [
    "Submitted At",
    "Full Name",
    "Email Address",
    "Portfolio Website URL",
    "Designer Role",
    "Country / Location",
    "Primary Tools Used",
    "Portfolio Description",
    "Permission",
    "Status"
  ];

  var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var hasHeaders = currentHeaders.some(function (value) {
    return String(value || "").trim();
  });

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function setupPortfolioStatusDropdowns() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet tab not found: " + SHEET_NAME);
  }

  ensureHeaders(sheet);

  var lastRow = Math.max(sheet.getLastRow(), 2);
  var statusColumn = getHeaderColumn(sheet, "Status") || 10;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_OPTIONS, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, statusColumn, lastRow - 1, 1).setDataValidation(rule);
}

function removeSocialLinkColumn() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet tab not found: " + SHEET_NAME);
  }

  var socialLinkColumn = getHeaderColumn(sheet, "Social Link");
  if (socialLinkColumn) {
    sheet.deleteColumn(socialLinkColumn);
  }

  setupPortfolioStatusDropdowns();
}

function applyStatusValidation(sheet, row) {
  var statusColumn = getHeaderColumn(sheet, "Status") || 10;
  var statusCell = sheet.getRange(row, statusColumn);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_OPTIONS, true)
    .setAllowInvalid(false)
    .build();

  statusCell.setDataValidation(rule);
}

function getUploadedPortfolioItems() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet tab not found: " + SHEET_NAME);
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(normalizeHeader);
  return values.slice(1).map(function (row) {
    var record = {};

    headers.forEach(function (header, index) {
      if (header) record[header] = row[index];
    });

    return {
      submittedAt: record.submitted_at || "",
      fullName: record.full_name || "",
      email: record.email_address || "",
      portfolioUrl: record.portfolio_website_url || "",
      designerRole: record.designer_role || "",
      location: record.country_location || "",
      primaryTools: record.primary_tools_used || "",
      description: record.portfolio_description || "",
      status: record.status || ""
    };
  }).filter(function (item) {
    var status = String(item.status || "").trim().toLowerCase();
    return item.fullName && item.portfolioUrl && (status === "uploaded" || status === "upload");
  });
}

function getHeaderColumn(sheet, headerName) {
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn) return 0;

  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var normalizedTarget = normalizeHeader(headerName);

  for (var i = 0; i < headers.length; i += 1) {
    if (normalizeHeader(headers[i]) === normalizedTarget) {
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
