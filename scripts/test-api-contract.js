const http = require("http");

const BASE = { hostname: "127.0.0.1", port: 8080 };

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let json = null;
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          json = JSON.parse(text);
        } catch {
          json = text;
        }
        resolve({ status: res.statusCode, headers: res.headers, json, text });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function loginAs(email, password) {
  const body = JSON.stringify({ email, password });
  const res = await request(
    {
      ...BASE,
      path: "/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );
  const token = (res.headers["set-cookie"] || [])
    .find((c) => c.startsWith("session_token="))
    ?.split(";")[0]
    ?.split("=")[1];
  if (!token) throw new Error(`Login failed for ${email}`);
  return token;
}

function login() {
  return loginAs("admin@example.com", "admin123");
}

function authed(token, path, method = "GET", body = null, headers = {}) {
  const opts = {
    ...BASE,
    path,
    method,
    headers: {
      Cookie: `session_token=${token}`,
      Origin: "https://mother-app-9ca4d.web.app",
      ...headers,
    },
  };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.headers["Content-Length"] = Buffer.byteLength(body);
  }
  return request(opts, body);
}

function assert(label, ok, detail = "") {
  const mark = ok ? "OK" : "FAIL";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function cleanupTempUsers(emails) {
  const Database = require("better-sqlite3");
  const db = new Database("data/app.db");
  db.pragma("foreign_keys = OFF");
  const placeholders = emails.map(() => "?").join(",");
  const userIds = db
    .prepare(`SELECT id FROM users WHERE email IN (${placeholders})`)
    .all(...emails)
    .map((r) => r.id);
  if (!userIds.length) {
    db.close();
    return;
  }
  const uidPlaceholders = userIds.map(() => "?").join(",");
  const ticketIds = db
    .prepare(`SELECT id FROM tickets WHERE created_by_uid IN (${uidPlaceholders})`)
    .all(...userIds)
    .map((r) => r.id);
  if (ticketIds.length) {
    const tidPlaceholders = ticketIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM activity_logs WHERE ticket_id IN (${tidPlaceholders})`).run(...ticketIds);
    db.prepare(`DELETE FROM ticket_comments WHERE ticket_id IN (${tidPlaceholders})`).run(...ticketIds);
    db.prepare(`DELETE FROM ticket_images WHERE ticket_id IN (${tidPlaceholders})`).run(...ticketIds);
    db.prepare(`DELETE FROM tickets WHERE id IN (${tidPlaceholders})`).run(...ticketIds);
  }
  db.prepare(`DELETE FROM sessions WHERE user_id IN (${uidPlaceholders})`).run(...userIds);
  db.prepare(`DELETE FROM users WHERE id IN (${uidPlaceholders})`).run(...userIds);
  db.close();
}

async function main() {
  const health = await request({ ...BASE, path: "/api/health", method: "GET" });
  assert("GET /api/health", health.status === 200 && health.json?.ok);

  const token = await login();
  const me = await authed(token, "/api/auth/me");
  assert("GET /api/auth/me", me.status === 200 && me.json?.user?.uid);
  assert("user has role", Boolean(me.json?.user?.role));

  const tickets = await authed(token, "/api/tickets");
  assert("GET /api/tickets", tickets.status === 200 && Array.isArray(tickets.json?.tickets));
  const ticket = tickets.json.tickets[0];
  if (ticket) {
    assert("ticket has imageUrls[]", Array.isArray(ticket.imageUrls));
    assert("ticket has ticketNumber", ticket.ticketNumber != null);
    assert("ticket has createdAt", Boolean(ticket.createdAt));
    assert(
      "ticket has escalatedTo[]",
      Array.isArray(ticket.escalatedTo),
      JSON.stringify(ticket.escalatedTo)
    );

    const activity = await authed(token, `/api/tickets/${ticket.id}/activity`);
    assert("GET activity", activity.status === 200 && Array.isArray(activity.json?.logs));
    if (activity.json.logs[0]) {
      assert("activity log fields", Boolean(activity.json.logs[0].performedByName));
    }

    if (ticket.imageUrls[0]) {
      const imagePath = ticket.imageUrls[0];
      const image = await authed(token, imagePath);
      const ct = image.headers["content-type"] || "";
      assert("GET image", image.status === 200 && ct.startsWith("image/"), ct);
    }
  }

  const formConfig = await authed(token, "/api/form-config");
  assert("GET /api/form-config", formConfig.status === 200 && formConfig.json?.config?.fields);

  const defaults = await authed(token, "/api/form-config/defaults");
  assert("GET form defaults", defaults.status === 200 && defaults.json?.config);

  const users = await authed(token, "/api/users");
  assert("GET /api/users", users.status === 200 && Array.isArray(users.json?.users));

  // ---- Comments + Escalation permission matrix ----
  const stamp = Date.now();
  const officerEmail = `contract-officer-${stamp}@example.com`;
  const analystEmail = `contract-analyst-${stamp}@example.com`;
  const complianceEmail = `contract-compliance-${stamp}@example.com`;
  await cleanupTempUsers([officerEmail, analystEmail, complianceEmail]);

  const mkOfficer = await authed(token, "/api/users", "POST", JSON.stringify({
    email: officerEmail,
    password: "test1234",
    displayName: "Contract Officer",
    role: "immigration",
  }));
  const mkAnalyst = await authed(token, "/api/users", "POST", JSON.stringify({
    email: analystEmail,
    password: "test1234",
    displayName: "Contract Analyst",
    role: "analysts",
  }));
  const mkCompliance = await authed(token, "/api/users", "POST", JSON.stringify({
    email: complianceEmail,
    password: "test1234",
    displayName: "Contract Compliance",
    role: "compliance",
  }));
  assert("seed temp officer + analyst + compliance", mkOfficer.status === 201 && mkAnalyst.status === 201 && mkCompliance.status === 201);

  const officerToken = await loginAs(officerEmail, "test1234");
  const analystToken = await loginAs(analystEmail, "test1234");
  const complianceToken = await loginAs(complianceEmail, "test1234");

  const complianceTickets = await authed(complianceToken, "/api/tickets");
  assert(
    "compliance role reads own (empty) ticket list",
    complianceTickets.status === 200 && Array.isArray(complianceTickets.json?.tickets) && complianceTickets.json.tickets.length === 0
  );

  const analyticsOfficerEarly = await authed(officerToken, "/api/analytics");
  assert("officer reads own analytics", analyticsOfficerEarly.status === 200);

  // Officer creates a ticket (multipart)
  const fd = new FormData();
  fd.append("applicantName", "Contract Test Client");
  fd.append("phoneNumber", "0770000000");
  fd.append("complianceOfficer", "mannah");
  fd.append("explanation", "Created by contract test");
  fd.append("nin", "TESTNIN1");
  const created = await fetch("http://127.0.0.1:8080/api/tickets", {
    method: "POST",
    headers: {
      Cookie: `session_token=${officerToken}`,
      Origin: "https://mother-app-9ca4d.web.app",
    },
    body: fd,
  });
  const createdJson = await created.json().catch(() => ({}));
  assert("officer creates ticket", created.status === 201 && createdJson.ticket?.id);

  const duplicateFd = new FormData();
  duplicateFd.append("applicantName", "Contract Test Client");
  duplicateFd.append("phoneNumber", "0770000000");
  duplicateFd.append("explanation", "Should fail - duplicate");
  duplicateFd.append("nin", "TESTNIN1");
  const duplicateRes = await fetch("http://127.0.0.1:8080/api/tickets", {
    method: "POST",
    headers: {
      Cookie: `session_token=${officerToken}`,
      Origin: "https://mother-app-9ca4d.web.app",
    },
    body: duplicateFd,
  });
  assert(
    "duplicate client blocked",
    duplicateRes.status === 409,
    `got ${duplicateRes.status}`
  );

  if (createdJson.ticket?.id) {
    const tid = createdJson.ticket.id;

    const escWhileOpen = await authed(officerToken, `/api/tickets/${tid}`, "PATCH", JSON.stringify({
      escalatedTo: ["kaseem"],
    }));
    assert(
      "escalation blocked while Open",
      escWhileOpen.status === 409,
      `got ${escWhileOpen.status}`
    );

    const toProgress = await authed(officerToken, `/api/tickets/${tid}`, "PATCH", JSON.stringify({
      status: "in_progress",
    }));
    assert("officer moves own ticket to In Progress", toProgress.status === 200 && toProgress.json?.ticket?.status === "in_progress");

    const escOn = await authed(officerToken, `/api/tickets/${tid}`, "PATCH", JSON.stringify({
      escalatedTo: ["kaseem", "janna"],
    }));
    assert(
      "officer escalates own In Progress ticket",
      escOn.status === 200 &&
        escOn.json?.ticket?.escalatedTo?.length === 2 &&
        escOn.json.ticket.escalatedTo.includes("kaseem")
    );

    const activityAfterEsc = await authed(token, `/api/tickets/${tid}/activity`);
    assert(
      "escalation logged in activity",
      activityAfterEsc.json?.logs?.some((l) => l.action === "escalation_changed")
    );

    const escInvalid = await authed(officerToken, `/api/tickets/${tid}`, "PATCH", JSON.stringify({
      escalatedTo: ["kaseem", "not-a-person"],
    }));
    assert(
      "unknown escalation contact filtered out",
      escInvalid.status === 200 &&
        escInvalid.json?.ticket?.escalatedTo?.join(",") === "kaseem"
    );

    const resolved = await authed(officerToken, `/api/tickets/${tid}`, "PATCH", JSON.stringify({
      status: "resolved",
    }));
    assert("officer resolves own ticket", resolved.status === 200 && resolved.json?.ticket?.status === "resolved");

    const escLocked = await authed(officerToken, `/api/tickets/${tid}`, "PATCH", JSON.stringify({
      escalatedTo: ["marwan"],
    }));
    assert(
      "escalation blocked once not In Progress",
      escLocked.status === 409,
      `got ${escLocked.status}`
    );

    const officerComment = await authed(officerToken, `/api/tickets/${tid}/comments`, "POST", JSON.stringify({
      body: "Officer note on own ticket",
    }));
    assert("owning officer can comment", officerComment.status === 201);

    const adminComment = await authed(token, `/api/tickets/${tid}/comments`, "POST", JSON.stringify({
      body: "Admin follow-up comment",
    }));
    assert("admin can comment on any ticket", adminComment.status === 201);

    const emptyComment = await authed(token, `/api/tickets/${tid}/comments`, "POST", JSON.stringify({
      body: "   ",
    }));
    assert("empty comment rejected", emptyComment.status === 400);

    const listComments = await authed(analystToken, `/api/tickets/${tid}/comments`);
    assert("analyst reads comments", listComments.status === 200 && listComments.json?.comments?.length === 2);

    const analystPost = await authed(analystToken, `/api/tickets/${tid}/comments`, "POST", JSON.stringify({
      body: "should fail",
    }));
    assert("analyst cannot comment", analystPost.status === 403, `got ${analystPost.status}`);

    const analystEsc = await authed(analystToken, `/api/tickets/${tid}`, "PATCH", JSON.stringify({
      escalatedTo: ["mercy"],
    }));
    assert("analyst cannot escalate", analystEsc.status === 403, `got ${analystEsc.status}`);

    const otherOfficerTicket = tickets.json.tickets.find(
      (t) => t.createdByUid !== createdJson.ticket.createdByUid && t.createdByRole !== "immigration"
    );
    if (otherOfficerTicket) {
      const foreignComment = await authed(officerToken, `/api/tickets/${otherOfficerTicket.id}/comments`, "POST", JSON.stringify({
        body: "should fail",
      }));
      assert("officer cannot comment on others' tickets", foreignComment.status === 403, `got ${foreignComment.status}`);
    }

    await cleanupTempUsers([officerEmail, analystEmail, complianceEmail]);
  }

  // ---- Admin-only Excel import/export ----
  const ExcelJS = require("exceljs");

  const analystExport = await authed(analystToken, "/api/admin/excel/export");
  assert("analyst cannot export excel", analystExport.status === 403, `got ${analystExport.status}`);

  const officerExport = await authed(officerToken, "/api/admin/excel/export");
  assert("officer cannot export excel", officerExport.status === 403, `got ${officerExport.status}`);

  async function buildImportBuffer() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Mannah");
    ws.addRow([
      "COMPLIANCE OFFICER",
      "CLIENT NAME",
      "NIN",
      "CONTACTS",
      "ISSUE CATEGORY",
      "Issue Explained",
      "Issue solution",
      "CALLED DATE",
      "STATUS",
    ]);
    ws.addRow([
      "Francess",
      "Contract Excel Client",
      "XLSNIN1",
      "0771234567",
      "Needs Edit",
      "Imported via contract test",
      "Fixed during test",
      new Date(Date.UTC(2026, 0, 15)),
      "Resolved",
    ]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const importFd = new FormData();
  importFd.append("mode", "merge");
  importFd.append(
    "file",
    new Blob([await buildImportBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "contract-import.xlsx"
  );
  const officerImport = await fetch("http://127.0.0.1:8080/api/admin/excel/import", {
    method: "POST",
    headers: {
      Cookie: `session_token=${officerToken}`,
      Origin: "https://mother-app-9ca4d.web.app",
    },
    body: importFd,
  });
  assert("officer cannot import excel", officerImport.status === 403, `got ${officerImport.status}`);

  const importFd2 = new FormData();
  importFd2.append("mode", "merge");
  importFd2.append(
    "file",
    new Blob([await buildImportBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "contract-import.xlsx"
  );
  const adminImport = await fetch("http://127.0.0.1:8080/api/admin/excel/import", {
    method: "POST",
    headers: {
      Cookie: `session_token=${token}`,
      Origin: "https://mother-app-9ca4d.web.app",
    },
    body: importFd2,
  });
  const importJson = await adminImport.json().catch(() => ({}));
  assert(
    "admin imports excel workbook",
    adminImport.status === 200 && importJson.imported === 1,
    JSON.stringify(importJson)
  );

  const afterImport = await authed(token, "/api/tickets");
  const importedTicket = (afterImport.json?.tickets || []).find(
    (t) => t.applicantName === "Contract Excel Client"
  );
  assert(
    "imported ticket mapped correctly",
    Boolean(importedTicket) &&
      importedTicket.status === "resolved" &&
      importedTicket.complianceOfficer === "francess" &&
      importedTicket.issueType === "needs_edit"
  );

  if (importedTicket) {
    const del = await authed(token, `/api/tickets/${importedTicket.id}`, "DELETE");
    assert("cleanup imported ticket", del.status === 200);
  }

  const adminExportRes = await fetch("http://127.0.0.1:8080/api/admin/excel/export", {
    headers: {
      Cookie: `session_token=${token}`,
      Origin: "https://mother-app-9ca4d.web.app",
    },
  });
  const exportBytes = Buffer.from(await adminExportRes.arrayBuffer());
  const exportCt = adminExportRes.headers.get("content-type") || "";
  assert(
    "admin exports excel workbook",
    adminExportRes.status === 200 &&
      exportCt.includes("spreadsheetml") &&
      exportBytes.length > 1000,
    `${exportBytes.length} bytes, ${exportCt}`
  );
  let exportHeadersOk = false;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(exportBytes);
    const ws = wb.worksheets[0];
    const headerTexts = [];
    ws.getRow(1).eachCell((cell) => headerTexts.push(String(cell.value).toUpperCase()));
    exportHeadersOk =
      headerTexts.includes("CLIENT NAME") &&
      headerTexts.includes("STATUS") &&
      headerTexts.includes("COMPLIANCE OFFICER") &&
      ws.rowCount > 1;
  } catch {}
  assert("export has import-compatible columns", exportHeadersOk);

  // ---- Analytics endpoint ----
  const analyticsAdmin = await authed(token, "/api/analytics");
  assert(
    "admin reads analytics",
    analyticsAdmin.status === 200 &&
      Array.isArray(analyticsAdmin.json?.weeklyCategories) &&
      typeof analyticsAdmin.json?.weeklyTotal === "number" &&
      typeof analyticsAdmin.json?.speed?.resolved?.count === "number" &&
      typeof analyticsAdmin.json?.speed?.inProgress?.count === "number",
    JSON.stringify(analyticsAdmin.json || {}).slice(0, 120)
  );
  const slaJson = analyticsAdmin.json?.sla;
  assert(
    "analytics includes SLA report",
    slaJson &&
      slaJson.businessDaysLimit === 3 &&
      typeof slaJson.open?.overdue === "number" &&
      typeof slaJson.open?.dueSoon === "number" &&
      typeof slaJson.resolved?.onTime === "number" &&
      typeof slaJson.resolved?.late === "number"
  );

  const analyticsUnauth = await request({ ...BASE, path: "/api/analytics", method: "GET" });
  assert("analytics requires auth", analyticsUnauth.status === 401);

  console.log("\nFrontend contract check complete.");
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
