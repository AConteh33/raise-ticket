# Issue Tracker

A ticketing system for raising new issues and tracking their status. Plain HTML/CSS/JavaScript frontend with a SQLite database backend.

## Features

- **Structured intake form** — issue type, explanation, leaving-soon urgency, and 2 image uploads
- **Status workflow** — Open → In Progress → Resolved → Closed
- **Filter by status** — quick counts per status
- **Role-based access** — Immigration, Labour, Protec, Analysts, and Admin roles
- **Activity log** — ticket creation, status changes, and deletions
- **Delete tickets** — admins only

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.local.example` to `.env.local` and adjust if needed:

```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=Admin
```

### 3. Create the database and first admin

```bash
npm run db:seed
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

Default admin: `admin@example.com` / `admin123`

## Roles

| Role        | Permissions |
|-------------|-------------|
| Immigration | Create tickets, view & update only their own |
| Labour      | Create tickets, view & update only their own |
| Protec      | Create tickets, view & update only their own |
| Compliance  | Create tickets, view & update only their own |
| Analysts    | View all tickets and activity history (read-only) |
| Admin       | Full access — all tickets, create, update, delete, manage users |

## Database

SQLite file: `data/app.db` (override with `DATABASE_PATH` in `.env.local`).

Images are stored in the database and served at `/api/images/[id]` (session cookie required).

## Project Structure

```
db/               # SQLite schema, auth, tickets, seed
html-site/
  server.js       # Express API + static file server
  index.html      # Dashboard
  login.html      # Sign in
  admin-users.html
  css/ js/        # Frontend assets
```

## Port

Set `HTML_SITE_PORT` in `.env.local` to change the default port (8080).

## Deploy (Firebase or Netlify + ngrok)

Host the **frontend** on **Firebase Hosting** or **Netlify** (free). Keep the **database + API** on your PC via **ngrok**.

- **Firebase:** see **[DEPLOY.md](./DEPLOY.md#firebase-hosting-frontend)**
- **Netlify:** see **[DEPLOY.md](./DEPLOY.md)**
