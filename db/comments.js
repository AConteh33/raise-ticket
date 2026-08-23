const { getDb, nowIso, newId } = require("./index");

const MAX_COMMENT_LENGTH = 2000;

function mapComment(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorUid: row.author_uid,
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: new Date(row.created_at),
  };
}

function listComments(ticketId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC, rowid ASC"
    )
    .all(ticketId)
    .map(mapComment);
}

function getCommentById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM ticket_comments WHERE id = ?").get(id);
  return row ? mapComment(row) : null;
}

function addComment(ticket, actor, body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) {
    const err = new Error("Comment cannot be empty");
    err.statusCode = 400;
    throw err;
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    const err = new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`);
    err.statusCode = 400;
    throw err;
  }

  const db = getDb();
  const id = newId();
  db.prepare(
    `INSERT INTO ticket_comments (
      id, ticket_id, author_uid, author_name, author_role, body, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, ticket.id, actor.uid, actor.displayName, actor.role, trimmed, nowIso());

  return getCommentById(id);
}

module.exports = { listComments, addComment, MAX_COMMENT_LENGTH };
