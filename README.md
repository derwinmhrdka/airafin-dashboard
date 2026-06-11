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

## Quick start (Docker)

```bash
cp .env.example .env
# Edit API_SECRET_TOKEN before production use

docker compose up --build
```

- Dashboard: http://localhost:3000
- API: http://localhost:3001
- PostgreSQL: localhost:5432

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

API → http://localhost:3001

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

### POST /api/transactions (Phase 2 bot)

```bash
curl -X POST http://localhost:3001/api/transactions \
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

## Google Sheets dual-write (optional)

While migrating from your spreadsheet, each `POST /api/transactions` also appends a row to Google Sheets when configured. PostgreSQL remains the source of truth; Sheets is a mirror.

1. Create a [Google Cloud service account](https://console.cloud.google.com/) with **Google Sheets API** enabled.
2. Download the JSON key file.
3. Share your spreadsheet with the service account email (Editor access).
4. Add to `backend/.env`:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=your-id-from-sheet-url
GOOGLE_SERVICE_ACCOUNT_FILE=C:/path/to/service-account.json
```

Rows append to the **DETAIL** tab: `A Date | B Category | C Detail | D Cost | E Month (e.g. June) | F (skipped) | G Initial (D/A)`.

If Sheets env vars are omitted, inserts go to PostgreSQL only.

## Phase 2 note

The Telegram bot lives in a **separate repository**. It will POST transactions to this backend using `X-API-Token` — no bot code in this repo.
