const ExcelJS = require("exceljs");

const { getDb } = require("./index");
const dbTickets = require("./tickets");
const dbFormConfig = require("./form-config");
const { COMPLIANCE_OFFICERS, ESCALATION_CONTACTS } = require("./excel-fields");

const EXPORT_SHEET = "Tickets";
const SKIP_SHEETS = new Set(["stats"]);
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const CATEGORY_MAP = {
  "needs edit": "needs_edit",
  "status check": "status_check",
  draft: "draft",
  "under pay": "under_pay",
  "needs appointment": "needs_appointment",
  "missing application": "missing_application",
  information: "information",
  "card delay": "card_delay",
  "on-spot": "on_spot",
  "on spot": "on_spot",
  "wrong photo": "wrong_photo",
  approvals: "approvals",
  "wrong location": "wrong_location",
};

const OFFICER_MAP = {
  mannah: "mannah",
  hannah: "hannah",
  patrick: "patrick",
  uche: "uche",
  kumba: "kumba",
  francess: "francess",
  mercy: "francess",
};

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

function slugOfficer(value, sheetName) {
  const raw =
    value != null && String(value).trim() ? String(value).trim() : sheetName;
  const key = raw.toLowerCase().trim();
  return OFFICER_MAP[key] || key.replace(/\s+/g, "_");
}

function slugCategory(value) {
  if (value == null || !String(value).trim()) return "unspecified";
  const key = String(value).trim().toLowerCase();
  return (
    CATEGORY_MAP[key] ||
    key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  );
}

function mapStatus(value) {
  if (value == null) return "open";
  const key = String(value).trim().toUpperCase();
  if (key === "IN PROGRESS") return "in_progress";
  if (key === "RESOLVED") return "resolved";
  return "open";
}

function parseDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  for (const fmt of ["YYYY-MM-DD", "DD/MM/YYYY", "DD/MM/YY", "MM/DD/YYYY"]) {
    const parsed = tryParseDate(text, fmt);
    if (parsed) return parsed;
  }
  return text;
}

function tryParseDate(text, fmt) {
  const sep = fmt.includes("-") ? "-" : "/";
  const parts = text.split(sep).map((s) => s.trim());
  if (parts.length !== 3) return "";
  const order = fmt.split(sep);
  const nums = {};
  for (let i = 0; i < 3; i++) {
    if (!/^\d+$/.test(parts[i])) return "";
    nums[order[i]] = parseInt(parts[i], 10);
  }
  const year = nums.YYYY ?? (nums.YY < 70 ? 2000 + nums.YY : 1900 + nums.YY);
  const month = nums.MM;
  const day = nums.DD;
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function asText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    return "";
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return String(value).trim();
}

function normalizeHeader(value) {
  return asText(value).toUpperCase();
}

function buildHeaderIndex(headerRow) {
  const index = {};
  const values = headerRow.values || [];
  for (let i = 1; i < values.length; i++) {
    const header = normalizeHeader(values[i]);
    if (!header) continue;
    if (!index[header]) index[header] = i;
    if (header.includes("COMPLIANCE OFFICER") && !index.__OFFICER__) {
      index.__OFFICER__ = i;
    }
  }
  return index;
}

function pick(row, headerIndex, name) {
  const col = headerIndex[name];
  return col ? row.values[col] : undefined;
}

async function extractRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const rows = [];
  for (const sheet of workbook.worksheets) {
    if (SKIP_SHEETS.has(String(sheet.name).toLowerCase())) continue;
    let headerIndex = null;
    sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) {
        headerIndex = buildHeaderIndex(row);
        return;
      }
      if (!headerIndex) return;
      const client = asText(pick(row, headerIndex, "CLIENT NAME"));
      const explained = asText(pick(row, headerIndex, "ISSUE EXPLAINED"));
      if (!client && !explained) return;

      const categoryRaw = pick(row, headerIndex, "ISSUE CATEGORY");
      const category2Raw = pick(row, headerIndex, "ISSUE CATEGORY 2");

      rows.push({
        sheet: sheet.name,
        officer: slugOfficer(
          headerIndex.__OFFICER__
            ? row.values[headerIndex.__OFFICER__]
            : undefined,
          sheet.name
        ),
        client,
        nin: asText(pick(row, headerIndex, "NIN")),
        phone: asText(pick(row, headerIndex, "CONTACTS")),
        category: slugCategory(categoryRaw),
        category2: asText(category2Raw),
        explanation: explained,
        solution: asText(pick(row, headerIndex, "ISSUE SOLUTION")),
        called: parseDate(pick(row, headerIndex, "CALLED DATE")),
        status: mapStatus(pick(row, headerIndex, "STATUS")),
      });
    });
  }
  return rows;
}

function resetTicketData(db) {
  db.prepare("DELETE FROM activity_logs").run();
  db.prepare("DELETE FROM ticket_images").run();
  db.prepare("DELETE FROM ticket_comments").run();
  db.prepare("DELETE FROM tickets").run();
  db.prepare("UPDATE ticket_number_seq SET next_val = 1 WHERE id = 1").run();
}

async function importTickets(buffer, actor, options = {}) {
  const rows = await extractRows(buffer);
  const db = getDb();

  const run = db.transaction(() => {
    if (options.replace) resetTicketData(db);
    let imported = 0;
    for (const row of rows) {
      dbTickets.createTicket(
        {
          applicantName: row.client || "Unknown",
          phoneNumber: row.phone || "—",
          issueType: row.category,
          explanation: row.explanation || "—",
          leavingSoon: "no",
          nin: row.nin,
          issueSolution: row.solution,
          calledDate: row.called,
          complianceOfficer: row.officer,
          issueCategory2: row.category2,
          status: row.status,
          formData: {
            complianceOfficer: row.officer,
            applicantName: row.client,
            nin: row.nin,
            phoneNumber: row.phone,
            issueType: row.category,
            issueCategory2: row.category2,
            explanation: row.explanation,
            issueSolution: row.solution,
            calledDate: row.called,
          },
          createdByUid: actor.uid,
          createdByName: actor.displayName,
          createdByRole: actor.role,
        },
        [],
        { skipDuplicateCheck: true }
      );
      imported += 1;
    }
    return imported;
  });

  const imported = run();
  return { imported, replaced: options.replace === true };
}

function resolveOptionLabel(options, value, fallback) {
  const found = (options || []).find((o) => o.value === value);
  return found ? found.label : fallback;
}

async function buildExportBuffer() {
  const db = getDb();
  const ticketRows = db
    .prepare("SELECT * FROM tickets ORDER BY ticket_number ASC")
    .all();

  const config = dbFormConfig.getFormConfig();
  const issueTypeField = (config.fields || []).find((f) => f.id === "issueType");
  const issueOptions = issueTypeField?.options || [];
  const officerLabels = Object.fromEntries(
    COMPLIANCE_OFFICERS.map((o) => [o.value, o.label])
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EXPORT_SHEET);
  sheet.columns = [
    { header: "TICKET #", key: "number", width: 10 },
    { header: "COMPLIANCE OFFICER", key: "officer", width: 22 },
    { header: "CLIENT NAME", key: "client", width: 28 },
    { header: "NIN", key: "nin", width: 18 },
    { header: "CONTACTS", key: "contacts", width: 16 },
    { header: "ISSUE CATEGORY", key: "category", width: 20 },
    { header: "ISSUE CATEGORY 2", key: "category2", width: 20 },
    { header: "Issue Explained", key: "explained", width: 60 },
    { header: "Issue solution", key: "solution", width: 60 },
    { header: "CALLED DATE", key: "called", width: 14 },
    { header: "STATUS", key: "status", width: 14 },
    { header: "ESCALATED TO", key: "escalated", width: 24 },
  ];

  for (const t of ticketRows) {
    let escalatedLabels = "";
    try {
      const parsed = JSON.parse(t.escalated_to || "[]");
      const names = Array.isArray(parsed)
        ? parsed.map((v) => resolveOptionLabel(ESCALATION_CONTACTS, v, v))
        : [];
      escalatedLabels = names.join(", ");
    } catch {
      escalatedLabels = "";
    }

    sheet.addRow({
      number: t.ticket_number,
      officer: officerLabels[t.compliance_officer] || t.compliance_officer || "",
      client: t.applicant_name || "",
      nin: t.nin || "",
      contacts: t.phone_number === "—" ? "" : t.phone_number || "",
      category: resolveOptionLabel(issueOptions, t.issue_type, t.issue_type),
      category2: t.issue_category_2 || "",
      explained: t.explanation === "—" ? "" : t.explanation || "",
      solution: t.issue_solution || "",
      called: t.called_date || "",
      status: STATUS_LABELS[t.status] || t.status || "",
      escalated: escalatedLabels,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, count: ticketRows.length };
}

module.exports = {
  importTickets,
  buildExportBuffer,
  extractRows,
  XLSX_MIME,
};
