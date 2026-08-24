require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });

const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const path = require("path");

const dbAuth = require("../db/auth");
const dbTickets = require("../db/tickets");
const dbFormConfig = require("../db/form-config");
const dbComments = require("../db/comments");
const dbExcel = require("../db/excel");
const dbAnalytics = require("../db/analytics");
const { canCreateTickets, canDeleteTicket, canCommentTicket } = require("../db/permissions");
const { getDb } = require("../db/index");

const app = express();
const PORT = process.env.PORT || process.env.HTML_SITE_PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const SESSION_COOKIE = "session_token";
const MAX_IMAGE_SIZE_MB = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024, files: 10 },
});

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

app.use(express.json());
app.use(cookieParser());

const isApiOnlyMode =
  process.env.API_ONLY === "true" ||
  process.env.API_ONLY === "1" ||
  String(process.env.npm_lifecycle_event || "") === "dev:api";

function resolveCorsAllowAll() {
  const flag = (process.env.CORS_ALLOW_ALL || "").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  if ((process.env.CORS_ORIGIN || "").trim() === "*") return true;
  // Remote frontends (Firebase/Netlify) need cross-origin API access by default.
  if (isApiOnlyMode) return true;
  return false;
}

const CORS_ALLOW_ALL = resolveCorsAllowAll();

const CORS_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((s) => s !== "*");

const crossOrigin = CORS_ALLOW_ALL || CORS_ORIGINS.length > 0;

const CORS_ALLOW_HEADERS =
  "Content-Type, Authorization, ngrok-skip-browser-warning, X-Requested-With";

if (crossOrigin) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigin =
      origin &&
      (CORS_ALLOW_ALL || CORS_ORIGINS.includes(origin));

    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] || CORS_ALLOW_HEADERS
    );
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

function getUser(req) {
  const token = req.cookies[SESSION_COOKIE];
  return dbAuth.getSessionUser(token);
}

function isRemoteHttpsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]";
    return url.protocol === "https:" && !isLocal;
  } catch {
    return false;
  }
}

function cookieFlags(req) {
  const remote = isRemoteHttpsOrigin(req);
  return {
    httpOnly: true,
    sameSite: remote ? "none" : "lax",
    secure: remote,
    path: "/",
  };
}

function setSession(res, token, expiresAt, req) {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieFlags(req),
    expires: expiresAt,
  });
}

function clearSession(res, req) {
  res.clearCookie(SESSION_COOKIE, cookieFlags(req));
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await dbAuth.login(email, password);
    if (!result) return res.status(401).json({ error: "Invalid email or password" });
    setSession(res, result.token, result.expiresAt, req);
    res.json({ user: result.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) dbAuth.deleteSession(token);
  clearSession(res, req);
  res.json({ ok: true });
});

app.post("/api/reset-password", (req, res) => {
  const bcrypt = require("bcryptjs");
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { newPassword, pincode } = req.body || {};
  if (pincode !== "1007") return res.status(403).json({ error: "Invalid pincode" });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const hash = bcrypt.hashSync(newPassword, 10);
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
  res.json({ ok: true, message: "Password updated" });
});

app.get("/api/auth/me", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ user });
});

app.get("/api/form-config", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ config: dbFormConfig.getFormConfig() });
});

app.put("/api/form-config", (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const errors = dbFormConfig.validateAdminConfig(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(". ") });

  const config = dbFormConfig.saveFormConfig(req.body, user.uid);
  res.json({ config });
});

app.get("/api/form-config/defaults", (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  res.json({ config: dbFormConfig.normalizeConfig(dbFormConfig.DEFAULT_FORM_CONFIG) });
});

app.get("/api/tickets", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ tickets: dbTickets.listTicketsForUser(user) });
});

app.get("/api/analytics", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json(dbAnalytics.getAnalyticsForUser(user));
});

app.post("/api/tickets", upload.array("images", 10), (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!canCreateTickets(user.role)) return res.status(403).json({ error: "Forbidden" });

  const config = dbFormConfig.getFormConfig();
  const files = req.files || [];
  const { errors, values } = dbFormConfig.validateSubmission(config, req.body, files);

  if (errors.length) return res.status(400).json({ error: errors[0] });

  try {
    const images = files.map((f) => ({
      mimeType: dbFormConfig.resolveImageMimeType(f),
      data: f.buffer,
    }));
    const ticket = dbTickets.createTicket(
      dbFormConfig.mapToTicketInput(values, user),
      images
    );
    res.status(201).json({ ticket });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

app.patch("/api/tickets/:id", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  let ticket = dbTickets.getTicketById(req.params.id);
  if (!ticket || !dbTickets.canEditTicket(user, ticket)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const body = req.body || {};
  const actor = {
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
  };

  try {
    if (body.escalatedTo !== undefined) {
      if (body.status && body.status !== ticket.status) {
        ticket = dbTickets.updateTicket(ticket, { status: body.status }, actor);
      }
      ticket = dbTickets.updateEscalation(ticket, body.escalatedTo, actor);
      return res.json({ ticket });
    }

    const allowed = [
      "status",
      "issueSolution",
      "calledDate",
      "explanation",
      "nin",
      "complianceOfficer",
      "issueCategory2",
      "phoneNumber",
    ];
    const updates = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = dbTickets.updateTicket(ticket, updates, actor);
    res.json({ ticket: updated });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.delete("/api/tickets/:id", (req, res) => {
  const user = getUser(req);
  if (!user || !canDeleteTicket(user.role)) return res.status(403).json({ error: "Forbidden" });
  const ticket = dbTickets.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  dbTickets.deleteTicket(ticket, {
    uid: user.uid,
    displayName: user.displayName,
    role: user.role,
  });
  res.json({ ok: true });
});

app.get("/api/tickets/:id/activity", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const ticket = dbTickets.getTicketById(req.params.id);
  if (!ticket || !dbTickets.canViewTicket(user, ticket)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ logs: dbTickets.getActivityForTicket(req.params.id) });
});

app.get("/api/tickets/:id/comments", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const ticket = dbTickets.getTicketById(req.params.id);
  if (!ticket || !dbTickets.canViewTicket(user, ticket)) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json({ comments: dbComments.listComments(req.params.id) });
});

app.post("/api/tickets/:id/comments", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const ticket = dbTickets.getTicketById(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  if (!canCommentTicket(user.role, ticket.createdByUid, user.uid)) {
    return res
      .status(403)
      .json({ error: "Only admins and the owning officer can comment" });
  }

  try {
    const comment = dbComments.addComment(
      ticket,
      { uid: user.uid, displayName: user.displayName, role: user.role },
      (req.body || {}).body
    );
    res.status(201).json({ comment });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get("/api/images/:id", (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const image = dbTickets.getImage(req.params.id);
  if (!image) return res.status(404).json({ error: "Not found" });
  const ticket = dbTickets.getTicketById(image.ticket_id);
  if (!ticket || !dbTickets.canViewTicket(user, ticket)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.setHeader("Content-Type", image.mime_type);
  res.send(image.data);
});

app.get("/api/users", (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  res.json({ users: dbAuth.listUsers() });
});

app.post("/api/users", async (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  try {
    await dbAuth.createUser(req.body);
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message.includes("UNIQUE") ? "Email already exists" : error.message });
  }
});

app.patch("/api/users/:id", (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { id } = req.params;
  const { role } = req.body || {};

  if (id === user.uid) {
    return res.status(400).json({ error: "Cannot change your own role" });
  }

  if (!role || !["admin", "immigration", "labour", "protec", "compliance", "analysts"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const target = dbAuth.getUserById(id);
  if (!target) return res.status(404).json({ error: "User not found" });

  const updated = dbAuth.updateUserRole(id, role);
  res.json({ user: updated });
});

app.delete("/api/users/:id", (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const { id } = req.params;

  if (id === user.uid) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  const target = dbAuth.getUserById(id);
  if (!target) return res.status(404).json({ error: "User not found" });

  dbAuth.deleteUser(id);
  res.json({ ok: true });
});

app.post("/api/admin/excel/import", uploadExcel.single("file"), async (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  if (!/\.xlsx$/i.test(file.originalname || "")) {
    return res.status(400).json({ error: "Only .xlsx files are supported" });
  }

  try {
    const result = await dbExcel.importTickets(
      file.buffer,
      { uid: user.uid, displayName: user.displayName, role: user.role },
      { replace: (req.body || {}).mode === "replace" }
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: `Import failed: ${error.message}` });
  }
});

app.get("/api/admin/excel/export", async (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  try {
    const { buffer } = await dbExcel.buildExportBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", dbExcel.XLSX_MIME);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tickets-export-${stamp}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({ error: `Export failed: ${error.message}` });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "raise-ticket-api",
    cors: CORS_ALLOW_ALL ? "allow-all" : CORS_ORIGINS.length ? "restricted" : "off",
  });
});

app.post("/api/setup", async (req, res) => {
  const bcrypt = require("bcryptjs");
  const { getDb, nowIso, newId } = require("../db/index");
  const { userCount } = require("../db/auth");

  function env(name) {
    return process.env[name] || process.env[name.toLowerCase()] || process.env[name.toUpperCase()];
  }

  if (userCount() > 0) {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    const user = getDb().prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!user) return res.status(404).json({ error: "User not found" });
    const hash = bcrypt.hashSync(password, 10);
    getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
    return res.json({ ok: true, message: `Password updated for ${email}` });
  }

  const email = env("ADMIN_EMAIL") || "admin@example.com";
  const password = env("ADMIN_PASSWORD") || "admin123";
  const displayName = env("ADMIN_NAME") || "Admin";
  const hash = bcrypt.hashSync(password, 10);
  getDb().prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)`
  ).run(newId(), email, hash, displayName, nowIso());
  res.json({ ok: true, message: `Admin created: ${email}` });
});

app.post("/api/seed-users", (req, res) => {
  const bcrypt = require("bcryptjs");
  const { getDb, nowIso, newId } = require("../db/index");

  const defaults = [
    { email: "immigration@ticket.com", name: "Immigration Officer", role: "immigration" },
    { email: "labour@ticket.com", name: "Labour Officer", role: "labour" },
    { email: "protec@ticket.com", name: "Protec Officer", role: "protec" },
    { email: "compliance@ticket.com", name: "Compliance Officer", role: "compliance" },
    { email: "analyst@ticket.com", name: "Analyst", role: "analyst" },
  ];

  const hash = bcrypt.hashSync("Password123", 10);
  const created = [];
  const stmt = getDb().prepare(
    "INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const u of defaults) {
    const exists = getDb().prepare("SELECT id FROM users WHERE email = ?").get(u.email);
    if (!exists) {
      stmt.run(newId(), u.email, hash, u.name, u.role, nowIso());
      created.push(u.email);
    }
  }
  res.json({ ok: true, created, message: `Created ${created.length} users (all Password123)` });
});

const API_ONLY = isApiOnlyMode;

if (!API_ONLY) {
  const PUBLIC_PATHS = new Set([
    "/login.html",
    "/api/auth/login",
    "/api/auth/me",
    "/api/health",
    "/api/setup",
    "/api/seed-users",
  ]);

  const PUBLIC_PREFIXES = [
    "/css/",
    "/js/auth.js",
    "/js/api.js",
    "/js/config.js",
    "/js/permissions.js",
    "/js/constants.js",
  ];

  function isPublicPath(reqPath) {
    if (PUBLIC_PATHS.has(reqPath)) return true;
    return PUBLIC_PREFIXES.some((p) => reqPath.startsWith(p));
  }

  app.get("/", (_req, res) => res.redirect("/login.html"));

  app.use((req, res, next) => {
    if (req.method === "GET" && !isPublicPath(req.path)) {
      const token = req.cookies[SESSION_COOKIE];
      const user = token ? dbAuth.getSessionUser(token) : null;
      if (!user) {
        if (req.path.startsWith("/api/")) {
          return res.status(401).json({ error: "Authentication required" });
        }
        return res.redirect("/login.html");
      }
    }
    next();
  });

  app.use(express.static(ROOT));
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: `Each image must be ${MAX_IMAGE_SIZE_MB}MB or smaller` });
    }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ error: "Too many images attached" });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

const server = app.listen(PORT, HOST, () => {
  if (API_ONLY) {
    console.log(`API server (backend) at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  } else {
    console.log(`API + local site at http://localhost:${PORT}`);
  }
  if (crossOrigin) {
    console.log(
      CORS_ALLOW_ALL
        ? "CORS: all origins allowed (CORS_ALLOW_ALL)"
        : `Frontend allowed (CORS): ${CORS_ORIGINS.join(", ")}`
    );
  } else if (API_ONLY) {
    console.log(`Set CORS_ORIGIN in .env.local to your Netlify frontend URL`);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. Another app may be serving the HTML files without API routes.\n` +
        `Stop that process, or set HTML_SITE_PORT in .env.local to use a different port.\n`
    );
    process.exit(1);
  }
  throw err;
});
