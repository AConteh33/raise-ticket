const { getDb, nowIso, newId } = require("./index");
const { ESCALATION_CONTACTS } = require("./excel-fields");

const ESCALATION_VALUES = new Set(ESCALATION_CONTACTS.map((c) => c.value));

function allocateTicketNumber(db) {
  db.prepare("INSERT OR IGNORE INTO ticket_number_seq (id, next_val) VALUES (1, 1)").run();
  const row = db.prepare("SELECT next_val FROM ticket_number_seq WHERE id = 1").get();
  const ticketNumber = row.next_val;
  db.prepare("UPDATE ticket_number_seq SET next_val = next_val + 1 WHERE id = 1").run();
  return ticketNumber;
}

function parseEscalatedTo(raw) {
  let parsed = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((v) => ESCALATION_VALUES.has(v)))];
}

function mapTicket(row, imageIds = []) {
  let formData = {};
  try {
    formData = row.form_data ? JSON.parse(row.form_data) : {};
  } catch {
    formData = {};
  }

  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    applicantName: row.applicant_name,
    phoneNumber: row.phone_number,
    issueType: row.issue_type,
    explanation: row.explanation,
    leavingSoon: row.leaving_soon,
    nin: row.nin || "",
    issueSolution: row.issue_solution || "",
    calledDate: row.called_date || "",
    complianceOfficer: row.compliance_officer || "",
    issueCategory2: row.issue_category_2 || "",
    escalatedTo: parseEscalatedTo(row.escalated_to),
    formData,
    status: row.status,
    createdByUid: row.created_by_uid,
    createdByName: row.created_by_name,
    createdByRole: row.created_by_role,
    imageUrls: imageIds.map((id) => `/api/images/${id}`),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function getImageIdsForTicket(ticketId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT id FROM ticket_images WHERE ticket_id = ? ORDER BY position ASC"
    )
    .all(ticketId)
    .map((r) => r.id);
}

function listTicketsForUser(user) {
  const db = getDb();
  let rows;

  if (user.role === "admin" || user.role === "analysts") {
    rows = db
      .prepare("SELECT * FROM tickets ORDER BY created_at DESC")
      .all();
  } else {
    rows = db
      .prepare(
        "SELECT * FROM tickets WHERE created_by_uid = ? ORDER BY created_at DESC"
      )
      .all(user.uid);
  }

  return rows.map((row) => mapTicket(row, getImageIdsForTicket(row.id)));
}

function getTicketById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!row) return null;
  return mapTicket(row, getImageIdsForTicket(row.id));
}

function canViewTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (user.role === "admin" || user.role === "analysts") return true;
  return ticket.createdByUid === user.uid;
}

function canEditTicket(user, ticket) {
  if (!user || !ticket) return false;
  if (user.role === "admin") return true;
  if (user.role === "analysts") return false;
  return ticket.createdByUid === user.uid;
}

function findOpenTicketForClient(applicantName, nin) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (applicantName && applicantName !== "—") {
    conditions.push("LOWER(applicant_name) = LOWER(?)");
    params.push(applicantName);
  }
  if (nin) {
    conditions.push("LOWER(nin) = LOWER(?)");
    params.push(nin);
  }

  if (!conditions.length) return null;

  const where = conditions.join(" OR ");
  const row = db
    .prepare(
      `SELECT id, ticket_number, applicant_name, nin, status
       FROM tickets
       WHERE status IN ('open', 'in_progress')
       AND (${where})
       LIMIT 1`
    )
    .get(...params);

  return row || null;
}

function createTicket(input, images, options = {}) {
  const db = getDb();

  if (!options.skipDuplicateCheck) {
    const existing = findOpenTicketForClient(input.applicantName, input.nin);
    if (existing) {
      const err = new Error(
        `A case for this client is already open (ticket #${existing.ticket_number})`
      );
      err.statusCode = 409;
      throw err;
    }
  }

  const id = newId();
  const ticketNumber = allocateTicketNumber(db);
  const ts = nowIso();

  const insertTicket = db.prepare(`
    INSERT INTO tickets (
      id, ticket_number, applicant_name, phone_number, issue_type, explanation, leaving_soon,
      nin, issue_solution, called_date, compliance_officer, issue_category_2,
      form_data, status, created_by_uid, created_by_name, created_by_role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertImage = db.prepare(`
    INSERT INTO ticket_images (id, ticket_id, position, mime_type, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activity_logs (
      id, ticket_id, ticket_owner_uid, applicant_name, action,
      performed_by_uid, performed_by_name, performed_by_role,
      from_status, to_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialStatus = input.status || "open";

  const tx = db.transaction(() => {
    insertTicket.run(
      id,
      ticketNumber,
      input.applicantName.trim(),
      input.phoneNumber.trim(),
      input.issueType,
      input.explanation.trim(),
      input.leavingSoon || "no",
      input.nin || "",
      input.issueSolution || "",
      input.calledDate || "",
      input.complianceOfficer || "",
      input.issueCategory2 || "",
      JSON.stringify(input.formData || {}),
      initialStatus,
      input.createdByUid,
      input.createdByName,
      input.createdByRole,
      ts,
      ts
    );

    images.forEach((img, i) => {
      insertImage.run(newId(), id, i, img.mimeType, img.data, ts);
    });

    insertActivity.run(
      newId(),
      id,
      input.createdByUid,
      input.applicantName.trim(),
      "created",
      input.createdByUid,
      input.createdByName,
      input.createdByRole,
      null,
      initialStatus,
      ts
    );
  });

  tx();
  return getTicketById(id);
}

const EDITABLE_FIELDS = {
  issueSolution: "issue_solution",
  calledDate: "called_date",
  explanation: "explanation",
  nin: "nin",
  complianceOfficer: "compliance_officer",
  issueCategory2: "issue_category_2",
  phoneNumber: "phone_number",
};

function updateTicket(ticket, updates, actor) {
  const db = getDb();
  const ts = nowIso();

  if (updates.status && updates.status !== ticket.status) {
    return updateTicketStatus(ticket, updates.status, actor);
  }

  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(EDITABLE_FIELDS)) {
    if (updates[key] !== undefined) {
      sets.push(`${column} = ?`);
      params.push(String(updates[key] ?? "").trim());
    }
  }

  if (!sets.length) return ticket;

  params.push(ts, ticket.id);
  db.prepare(`UPDATE tickets SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`).run(
    ...params
  );

  return getTicketById(ticket.id);
}

function updateTicketStatus(ticket, status, actor) {
  const db = getDb();
  const ts = nowIso();
  const previous = ticket.status;

  db.prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    ts,
    ticket.id
  );

  db.prepare(`
    INSERT INTO activity_logs (
      id, ticket_id, ticket_owner_uid, applicant_name, action,
      performed_by_uid, performed_by_name, performed_by_role,
      from_status, to_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newId(),
    ticket.id,
    ticket.createdByUid,
    ticket.applicantName,
    "status_changed",
    actor.uid,
    actor.displayName,
    actor.role,
    previous,
    status,
    ts
  );

  return getTicketById(ticket.id);
}

function normalizeEscalationList(value) {
  const raw = Array.isArray(value) ? value : [value];
  return [...new Set(raw.map((v) => String(v).trim()).filter((v) => ESCALATION_VALUES.has(v)))];
}

function updateEscalation(ticket, value, actor) {
  const db = getDb();
  const ts = nowIso();

  if (ticket.status !== "in_progress") {
    const err = new Error("Escalations can only be changed while a ticket is In Progress");
    err.statusCode = 409;
    throw err;
  }

  const contacts = normalizeEscalationList(value);
  const previous = parseEscalatedTo(ticket.escalatedTo ? JSON.stringify(ticket.escalatedTo) : "[]");

  db.prepare("UPDATE tickets SET escalated_to = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify(contacts),
    ts,
    ticket.id
  );

  const changed =
    JSON.stringify([...previous].sort()) !== JSON.stringify([...contacts].sort());

  if (changed) {
    const labels = contacts.map(
      (v) => ESCALATION_CONTACTS.find((c) => c.value === v)?.label || v
    );
    db.prepare(`
      INSERT INTO activity_logs (
        id, ticket_id, ticket_owner_uid, applicant_name, action,
        performed_by_uid, performed_by_name, performed_by_role,
        from_status, to_status, created_at
      ) VALUES (?, ?, ?, ?, 'escalation_changed', ?, ?, ?, NULL, ?, ?)
    `).run(
      newId(),
      ticket.id,
      ticket.createdByUid,
      ticket.applicantName,
      actor.uid,
      actor.displayName,
      actor.role,
      labels.length ? labels.join(", ") : "—",
      ts
    );
  }

  return getTicketById(ticket.id);
}

function deleteTicket(ticket, actor) {
  const db = getDb();
  const ts = nowIso();

  db.prepare(`
    INSERT INTO activity_logs (
      id, ticket_id, ticket_owner_uid, applicant_name, action,
      performed_by_uid, performed_by_name, performed_by_role,
      from_status, to_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newId(),
    ticket.id,
    ticket.createdByUid,
    ticket.applicantName,
    "deleted",
    actor.uid,
    actor.displayName,
    actor.role,
    ticket.status,
    null,
    ts
  );

  db.prepare("DELETE FROM tickets WHERE id = ?").run(ticket.id);
}

function getImage(imageId) {
  const db = getDb();
  return db
    .prepare("SELECT id, mime_type, data, ticket_id FROM ticket_images WHERE id = ?")
    .get(imageId);
}

function getActivityForTicket(ticketId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM activity_logs WHERE ticket_id = ? ORDER BY created_at DESC"
    )
    .all(ticketId)
    .map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      ticketOwnerUid: row.ticket_owner_uid,
      applicantName: row.applicant_name,
      action: row.action,
      performedByUid: row.performed_by_uid,
      performedByName: row.performed_by_name,
      performedByRole: row.performed_by_role,
      fromStatus: row.from_status || undefined,
      toStatus: row.to_status || undefined,
      createdAt: new Date(row.created_at),
    }));
}

module.exports = {
  listTicketsForUser,
  getTicketById,
  canViewTicket,
  canEditTicket,
  createTicket,
  updateTicket,
  updateEscalation,
  updateTicketStatus,
  deleteTicket,
  getImage,
  getActivityForTicket,
};
