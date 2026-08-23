const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

const DB_DIR = path.resolve(
  process.env.DATABASE_PATH
    ? path.dirname(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data")
);
const DB_FILE = process.env.DATABASE_PATH || path.join(DB_DIR, "app.db");

let db;

function getDb() {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_FILE);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      applicant_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      explanation TEXT NOT NULL,
      leaving_soon TEXT NOT NULL,
      form_data TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'open',
      created_by_uid TEXT NOT NULL REFERENCES users(id),
      created_by_name TEXT NOT NULL,
      created_by_role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_images (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      ticket_owner_uid TEXT NOT NULL,
      applicant_name TEXT NOT NULL,
      action TEXT NOT NULL,
      performed_by_uid TEXT NOT NULL,
      performed_by_name TEXT NOT NULL,
      performed_by_role TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author_uid TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id);

    CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by_uid);
    CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_ticket ON activity_logs(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS ticket_number_seq (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_val INTEGER NOT NULL DEFAULT 1
    );
  `);

  const columns = database
    .prepare("PRAGMA table_info(tickets)")
    .all()
    .map((c) => c.name);
  if (!columns.includes("form_data")) {
    database.exec(
      "ALTER TABLE tickets ADD COLUMN form_data TEXT NOT NULL DEFAULT '{}'"
    );
  }
  if (!columns.includes("ticket_number")) {
    database.exec("ALTER TABLE tickets ADD COLUMN ticket_number INTEGER");
    const existing = database
      .prepare("SELECT id FROM tickets ORDER BY created_at ASC, rowid ASC")
      .all();
    const assignNumber = database.prepare(
      "UPDATE tickets SET ticket_number = ? WHERE id = ?"
    );
    existing.forEach((row, index) => assignNumber.run(index + 1, row.id));
    database
      .prepare("INSERT OR IGNORE INTO ticket_number_seq (id, next_val) VALUES (1, 1)")
      .run();
    database
      .prepare("INSERT OR REPLACE INTO ticket_number_seq (id, next_val) VALUES (1, ?)")
      .run(existing.length + 1);
    database.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets(ticket_number)"
    );
  }

  const excelColumns = {
    nin: "TEXT NOT NULL DEFAULT ''",
    issue_solution: "TEXT NOT NULL DEFAULT ''",
    called_date: "TEXT NOT NULL DEFAULT ''",
    compliance_officer: "TEXT NOT NULL DEFAULT ''",
    issue_category_2: "TEXT NOT NULL DEFAULT ''",
    escalated_to: "TEXT NOT NULL DEFAULT '[]'",
  };
  const ticketColumns = database
    .prepare("PRAGMA table_info(tickets)")
    .all()
    .map((c) => c.name);
  for (const [name, ddl] of Object.entries(excelColumns)) {
    if (!ticketColumns.includes(name)) {
      database.exec(`ALTER TABLE tickets ADD COLUMN ${name} ${ddl}`);
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return randomUUID();
}

module.exports = { getDb, nowIso, newId, DB_FILE };
