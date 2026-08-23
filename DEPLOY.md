# Fly.io Deployment Guide

## Prerequisites

1. Install Fly.io CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Sign up for Fly.io:
   ```bash
   fly auth signup
   ```

## Deploy

1. From the project root, launch your app:
   ```bash
   fly launch
   ```
   - Choose a unique app name (e.g., `yourname-raise-ticket`)
   - Select a region close to you
   - Answer "No" to PostgreSQL (we use SQLite)
   - Answer "No" to Redis

2. Create a persistent volume for the database:
   ```bash
   fly volumes create data --region iad --size 1
   ```

3. Set environment variables:
   ```bash
   fly secrets set ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="your-secure-password" ADMIN_NAME="Admin"
   ```

4. Deploy:
   ```bash
   fly deploy
   ```

5. Initialize the database:
   ```bash
   fly ssh console -C "node db/seed.js"
   ```

6. Open your app:
   ```bash
   fly open
   ```

## Post-Deployment

1. Log in with your admin credentials
2. Go to the dashboard → "Excel data" section
3. Upload your Excel file to import tickets
4. Create additional users via "Manage Users"

## Useful Commands

- Check status: `fly status`
- View logs: `fly logs`
- SSH into console: `fly ssh console`
- Restart: `fly restart`

## Updating

After making changes:
```bash
fly deploy
```

Your database persists across deployments thanks to the volume.
