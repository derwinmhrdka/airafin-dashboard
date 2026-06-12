# Airafin Dashboard — Phase 1

Ultra-lightweight personal financial dashboard (SvelteKit + Fastify + Drizzle + PostgreSQL).

## Project structure

```
airafin-dashboard/
├── backend/          # Fastify API + Drizzle ORM
├── frontend/         # SvelteKit dashboard (mobile-first)
├── docker-compose.yml
└── tech-stack.md
```

## Auto deploy (GitHub Actions)

Pushes to `main` deploy to your VPS via SSH (same pattern as `bot-financial-tracker`).

### One-time VPS setup

```bash
sudo mkdir -p /apps
sudo git clone https://github.com/derwinmhrdka/airafin-dashboard.git /apps/airafin-dashboard
cd /apps/airafin-dashboard
cp .env.example .env
# Edit .env (POSTGRES_PASSWORD, API_SECRET_TOKEN, DASHBOARD_PASSWORD, ORIGIN, Google Sheets optional)
mkdir -p backend/secrets
# Copy service-account JSON into backend/secrets/ if using Sheets
docker compose up -d --build
```

Ensure the deploy user can run Docker without `sudo` (in the `docker` group).

### GitHub repository secrets

| Secret | Example | Required |
|--------|---------|----------|
| `VPS_HOST` | `43.134.92.145` | Yes |
| `VPS_USER` | `ubuntu` | Yes |
| `VPS_SSH_KEY` | Private key (PEM) | Yes |
| `VPS_PORT` | `22` | No |
| `VPS_APP_DIR` | `/apps/airafin-dashboard` | No (default shown) |

`.env` and `backend/secrets/` stay on the server only — they are not overwritten by deploy.

Manual deploy on the VPS:

```bash
cd /apps/airafin-dashboard
bash deploy/git-sync.sh
bash deploy/docker-deploy.sh
```

## Quick start (Docker)

```bash
cp .env.example .env
# Edit API_SECRET_TOKEN before production use

docker compose up --build
```

- Dashboard: http://localhost:3080
- API: http://localhost:3081
- PostgreSQL: internal only (not exposed on host in Docker)

## Local development without Docker (2 terminals)

### 1. Install PostgreSQL locally

Download and install from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/).  
During setup, note the **postgres user password** and keep the default port **5432**.

### 2. Create database and user

Open **SQL Shell (psql)** or pgAdmin and run:

```sql
CREATE USER airafin WITH PASSWORD 'airafin';
CREATE DATABASE airafin OWNER airafin;
GRANT ALL PRIVILEGES ON DATABASE airafin TO airafin;
```

Or use your existing `postgres` superuser — then set `DATABASE_URL` in `backend/.env` accordingly, e.g.:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/airafin
```

### 3. One-time app setup

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
```

Ensure `backend/.env` and `frontend/.env` exist (see `.env.example`).

### Terminal 1 — Backend

```bash
cd backend
npm run dev
```

API → http://localhost:3081

### Terminal 2 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard → http://localhost:5173

SvelteKit `hooks.server.ts` proxies `/api/*` to the backend and injects `X-API-Token` for `POST /api/transactions`.

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| GET | `/api/categories` | — | Master categories |
| GET | `/api/transactions?period=June+2026` | — | List transactions |
| POST | `/api/transactions` | `X-API-Token` | Create transaction |
| GET | `/api/dashboard/summary?period=June+2026` | — | Income, spent, SISA by category |
| GET | `/api/plan?period=June+2026` | — | Incomes + budgets for period |
| POST | `/api/budgets` | — | Upsert incomes and budget allocations |

### Telegram bot (`bot-financial-tracker`)

The Telegram bot in the sibling repo posts expenses here when configured:

```env
AIRAFIN_API_ENABLED=true
AIRAFIN_API_URL=http://localhost:3081
API_SECRET_TOKEN=<same as backend API_SECRET_TOKEN>
```

Disable `GOOGLE_SHEETS_ENABLED` on the bot when the backend mirrors to Sheets — otherwise rows are duplicated.

### POST /api/transactions (Phase 2 bot)

```bash
curl -X POST http://localhost:3081/api/transactions \
  -H "Content-Type: application/json" \
  -H "X-API-Token: $API_SECRET_TOKEN" \
  -d '{
    "date": "2026-06-11",
    "categoryId": 9,
    "detail": "Groceries",
    "cost": 150000,
    "period": "June 2026",
    "pic": "Derwin",
    "status": "Done"
  }'
```

## Import DETAIL tab (CSV → PostgreSQL)

One-time migration from your spreadsheet:

1. Export the **DETAIL** tab as CSV from Google Sheets.
2. Save it as **`backend/data/import/detail.csv`** (see `backend/data/import/README.md`).
3. Run (truncates existing transactions first):

```bash
cd backend
npm run db:import-detail -- --yes
```

On VPS after deploy:

```bash
# copy CSV to server, then:
docker compose exec backend node dist/db/import-detail.js --yes
```

## Google Sheets dual-write (optional)

While migrating from your spreadsheet, each `POST /api/transactions` also appends a row to Google Sheets when configured. PostgreSQL remains the source of truth; Sheets is a mirror.

1. Create a [Google Cloud service account](https://console.cloud.google.com/) with **Google Sheets API** enabled.
2. Download the JSON key file.
3. Share your spreadsheet with the service account email (Editor access).
4. Configure env vars:

**Local dev** (`backend/.env`):

```env
GOOGLE_SHEETS_SPREADSHEET_ID=your-id-from-sheet-url
GOOGLE_SERVICE_ACCOUNT_FILE=./secrets/service-account.json
```

**Docker / VPS** (root `.env` + copy JSON to `backend/secrets/` on the server):

```env
GOOGLE_SHEETS_SPREADSHEET_ID=your-id-from-sheet-url
GOOGLE_SERVICE_ACCOUNT_FILE=/app/secrets/service-account.json
```

Then `docker compose up -d backend`.

Rows append to the **DETAIL** tab: `A Date | B Category | C Detail | D Cost | E Month (e.g. June) | F (skipped) | G Initial (D/A)`.

If Sheets env vars are omitted, inserts go to PostgreSQL only.

## Phase 2 note

The Telegram bot lives in a **separate repository**. It will POST transactions to this backend using `X-API-Token` — no bot code in this repo.
