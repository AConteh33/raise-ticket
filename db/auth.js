const bcrypt = require("bcryptjs");
const { getDb, nowIso, newId } = require("./index");

const SESSION_DAYS = 7;

function normalizeRole(role) {
  if (role === "agent") return "analysts";
  return role;
}

function mapUser(row) {
  if (!row) return null;
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    role: normalizeRole(row.role),
    createdAt: new Date(row.created_at),
  };
}

function createSession(userId) {
  const db = getDb();
  const token = newId();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, userId, expiresAt.toISOString());

  return { token, expiresAt };
}

function getSessionUser(token) {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, nowIso());

  return mapUser(row);
}

function deleteSession(token) {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

async function login(email, password) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(email.trim());

  if (!row) return null;

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  const session = createSession(row.id);
  return { user: mapUser(row), ...session };
}

async function createUser({ email, password, displayName, role }) {
  const db = getDb();
  const id = newId();
  const passwordHash = await bcrypt.hash(password, 10);

  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, email.trim(), passwordHash, displayName.trim(), role, nowIso());

  return id;
}

function listUsers() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM users ORDER BY created_at DESC")
    .all()
    .map(mapUser);
}

function getUserById(id) {
  const db = getDb();
  return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

function userCount() {
  return getDb().prepare("SELECT COUNT(*) as c FROM users").get().c;
}

function updateUserRole(userId, role) {
  const db = getDb();
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
  return getUserById(userId);
}

function deleteUser(userId) {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) return null;

  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return user;
}

module.exports = {
  login,
  createUser,
  createSession,
  getSessionUser,
  deleteSession,
  listUsers,
  getUserById,
  userCount,
  normalizeRole,
  updateUserRole,
  deleteUser,
};
