# Import DETAIL tab (CSV → PostgreSQL)

## Where to put your file

Save the Google Sheets export as:

```
backend/data/import/detail.csv
```

Export from Sheets: **File → Download → Comma-separated values (.csv)** on the **DETAIL** tab.

Expected columns (same as spreadsheet):

| Column | Field   | Example        |
|--------|---------|----------------|
| A      | Date    | `2026-06-12`   |
| B      | Category| `Daily`        |
| C      | Detail  | `Makan siang`  |
| D      | Cost    | `35000`        |
| E      | Periode | `June`         |
| F      | #id     | optional       |
| G      | PIC     | `D` / `A` / `Derwin` / `Anggita` |

Column **F** is ignored during import (PostgreSQL assigns new ids).

## Run import

**Local** (with `backend/.env` or `DATABASE_URL` set):

```bash
cd backend
npm run db:import-detail -- --yes
```

**Docker on VPS** (after placing `detail.csv` on the server):

```bash
cd /apps/airafin-dashboard
docker compose exec backend node dist/db/import-detail.js --yes
```

`--yes` truncates all rows in `transactions` first, then imports the CSV.

Optional env:

- `IMPORT_DETAIL_CSV` — custom file path
- `IMPORT_DEFAULT_STATUS` — `Done` (default) or `Not Yet`
