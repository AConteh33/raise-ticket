#!/bin/sh
# setup.sh - Run after first deploy to initialize database

echo "Setting up database..."

# Seed admin user if no users exist
node -e "
const db = require('better-sqlite3')(process.env.DATABASE_PATH || 'data/app.db');
const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (count === 0) {
  console.log('No users found. Running seed...');
  process.exit(0);
} else {
  console.log('Users already exist. Skipping seed.');
  process.exit(1);
}
" && npm run db:seed

echo "Setup complete!"
