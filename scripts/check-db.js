const db = require('../db').getDb();

console.log('=== USERS ===');
const users = db.prepare('SELECT id, email, display_name, role FROM users').all();
users.forEach(u => console.log(`${u.email} | ${u.display_name} | ${u.role}`));

console.log('\n=== TICKETS ===');
console.log('Count:', db.prepare('SELECT COUNT(*) as c FROM tickets').get().c);

console.log('\n=== TABLES ===');
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name).join(', '));
