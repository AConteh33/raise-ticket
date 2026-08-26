require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });

const bcrypt = require("bcryptjs");
const { getDb } = require("./index");

function env(name) {
  return process.env[name] || process.env[name.toLowerCase()] || process.env[name.toUpperCase()];
}

const email = env("ADMIN_EMAIL") || "admin@example.com";
const password = env("ADMIN_PASSWORD") || "admin123";

const user = getDb().prepare("SELECT id, email FROM users WHERE email = ?").get(email);
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);

console.log(`Password updated for ${email}`);
console.log(`New password: ${password}`);
