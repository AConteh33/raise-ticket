require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });

const { getDb } = require("../db/index");
const { saveFormConfig, DEFAULT_FORM_CONFIG } = require("../db/form-config");

const db = getDb();
const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!admin) {
  console.error("No admin user found. Run: npm run db:seed");
  process.exit(1);
}

saveFormConfig(DEFAULT_FORM_CONFIG, admin.id);
console.log("Form config synced to match Excel spreadsheet columns.");
