# UrbanFlow

Data-driven micromobility analytics platform for Lviv. Built for a hackathon.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite, React Leaflet, react-i18next |
| Backend | FastAPI, scikit-learn, Supabase Python client |
| Database | Supabase (PostgreSQL + PostGIS) |
| Auth | Supabase Auth |
| Maps | CartoDB basemap, TomTom Traffic API |

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- A [Supabase](https://supabase.com) project with PostGIS enabled
- (Optional) [TomTom API key](https://developer.tomtom.com) for live traffic

---

## 1 — Supabase setup

Open the **SQL Editor** in your Supabase dashboard and run the migrations **in order**:

```
supabase/migrations/001_init_extensions.sql
supabase/migrations/002_tables.sql
supabase/migrations/003_rls_policies.sql
supabase/migrations/004_rpc_functions.sql
supabase/migrations/005_add_is_actual.sql
supabase/migrations/006_seed_lviv_data.sql
supabase/migrations/007_hazard_reports_geojson.sql
```

After running `006`, seed the accident data:

```sql
SELECT seed_csv_data();
```

In the Supabase dashboard go to **Storage → New bucket** and create a private bucket named `ml-models`.

---

## 2 — Frontend

```bash
cd frontend
cp .env.local.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from Supabase → Settings → API>
VITE_FASTAPI_URL=http://localhost:8000
VITE_TOMTOM_API_KEY=<your TomTom key, or leave blank to disable live traffic>
```

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

---

## 3 — Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key from Supabase → Settings → API>
```

> Use the **service_role** key (not the anon key) — the backend needs full DB access for ML operations.

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

# Seed the initial ML model (run once)
python -m scripts.seed_model

# Start the API server
uvicorn app.main:app --reload
```

API available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

---

## Features

- **Accident heatmap** — 256 real Lviv cycling accidents with time-based opacity decay and date-range filter
- **Bike lane layer** — existing infrastructure from OpenStreetMap
- **Proposals** — draw new bike lane routes; ML model scores safety (0–100)
- **Hazard reports** — click the map to report potholes, blocked lanes, near-misses, etc.
- **Voting & comments** — community engagement on proposals
- **Admin panel** — retrain ML model, activate versions, export training CSV
- **i18n** — Ukrainian (default) / English toggle

---

## Project structure

```
Project/
├── frontend/          # React app
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── i18n/      # uk.json / en.json translations
│   │   └── pages/
│   └── .env.local     # gitignored — copy from .env.local.example
├── backend/           # FastAPI + ML
│   ├── app/
│   │   ├── ml/        # feature engineering, training, predictor
│   │   └── routers/   # predict, retrain, export endpoints
│   ├── scripts/       # seed_model.py
│   └── .env           # gitignored — copy from .env.example
└── supabase/
    └── migrations/    # run in Supabase SQL Editor in order
```

---

## Deploy

Backend ships a `render.yaml` — push the repo and connect to [Render](https://render.com). Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in the Render environment variables dashboard.

Frontend can be deployed to Vercel or Netlify — set the same four `VITE_*` environment variables in the hosting dashboard.
