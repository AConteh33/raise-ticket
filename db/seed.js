require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });

const bcrypt = require("bcryptjs");
const { getDb, nowIso, newId } = require("./index");
const { userCount } = require("./auth");

const email = process.env.ADMIN_EMAIL || "admin@example.com";
const password = process.env.ADMIN_PASSWORD || "admin123";
const displayName = process.env.ADMIN_NAME || "Admin";

if (userCount() > 0) {
  console.log("Users already exist. Skipping seed.");
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);
getDb()
  .prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, created_at)
     VALUES (?, ?, ?, ?, 'admin', ?)`
  )
  .run(newId(), email, passwordHash, displayName, nowIso());

console.log("Admin user created:");
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(`  Database: ${require("./index").DB_FILE}`);
