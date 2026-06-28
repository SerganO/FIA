# UrbanFlow

Data-driven micromobility analytics platform for Lviv. Helps urban planners and citizens propose, score, and discuss bicycle infrastructure improvements using real accident data and machine learning.

---

## What is UrbanFlow?

UrbanFlow is a full-stack web application that puts cycling safety data on an interactive map. Users can:

- Explore where accidents, bike lanes, parking, and rentals are located in Lviv
- Draw a proposed bike lane and instantly receive an AI-generated safety score
- Report road hazards like potholes or missing signs
- Vote on and comment on community proposals
- Admins can import new data, retrain the ML model, and manage model versions

---

## Feature Overview

### Interactive Map

The main view is a Leaflet map centred on Lviv (CartoDB Voyager basemap, default zoom 13, max zoom 22). The map auto-locates the user via GPS on first load if permission is granted.

**Layer controls** (left sidebar, each layer independently toggleable):

| Layer | Appearance | Data source |
|---|---|---|
| Accidents | Red circles, sized by severity (1–3) | `accidents` table (historical + crowdsourced) |
| Bike Lanes | Green linestrings | `bike_lanes` table (OSM import) |
| Bike Parking | Blue **P** markers | `bike_parking` table (OSM import) |
| Bike Rental | Purple **R** markers | `bike_rental` table (OSM import) |
| Proposals | Dashed lines, colour-coded by score | `proposals` table |
| Hazard Reports | Orange **!** markers | `hazard_reports` table |
| Live Traffic | TomTom flow overlay | TomTom API (optional) |

Clicking any feature opens a popup with its full details (severity, date, road conditions, safety score, vote counts, etc.).

---

### Accident Filter

The Accidents layer has an inline filter panel:

- **Date range** — from/to date pickers to narrow which accidents are shown
- **Fade rate** — slider (0.2–4.0) that controls how fast older accidents fade in opacity; recent accidents stay vivid, old ones become translucent

---

### Bicycle Infrastructure Group

The Bike Infrastructure entry in the sidebar is a collapsible group with individual on/off toggles for:

- **Bike Lanes** — existing OSM cycle paths drawn as green linestrings with type/surface/name popups
- **Bike Parking** — OSM bicycle parking nodes with capacity, covered status, and access type
- **Bike Rental** — OSM bike rental stations with network, operator, opening hours, website, and phone

All three layers update immediately after an admin import — no page reload required.

---

### Proposal Workflow

Authenticated users (role `user` and above) can propose new bike lanes:

1. **Draw** — click the draw button on the map to enter LineString drawing mode (powered by Geoman). Draw the desired route, then confirm.
2. **ML Score** — a modal opens showing the real-time safety score calculation. The model analyses 17 spatial features and returns a score from 0–100.
3. **Score display** — the modal shows:
   - Safety score badge (green ≥ 70, orange 45–69, red < 45)
   - Risk level label (Low / Medium / High)
   - Accidents within 100 m
   - Proposed length in metres
   - Distance to nearest existing bike lane
4. **Save** — provide a title and optional description, then save. The proposal is stored with its geometry, score, ML version, and full feature vector.
5. **Map display** — approved proposals appear on the map as dashed colour-coded lines.

**Proposal statuses:** `draft` → `under_review` → `approved` / `rejected`

---

### Proposals List Page

A dedicated page listing all proposals as cards, sortable by:

- **Date** — newest first
- **Safety Score** — highest first
- **Votes** — most supported first

Each card shows:
- Title, status badge, safety score badge
- Length in metres, creation date
- Description (if provided)
- Upvote / Downvote buttons with live counts
- Comment count and expandable comment thread
- **View on Map** button — flies the main map to the proposal's geometry

---

### Voting

Authenticated users can upvote or downvote any proposal:

- First click sets the vote; clicking the same button again removes it (toggle)
- Clicking the opposite button switches the vote
- Vote counts are stored in a dedicated `votes` table and synced back to the proposal in real time via database trigger

---

### Comments

Each proposal has a threaded comment section accessible from the proposal card:

- Comment body (1–2 000 characters)
- Author username and timestamp
- Comments are chronological
- Submitting a new comment updates the `comment_count` on the proposal automatically via trigger

---

### Hazard Reporting

Any authenticated user can report a road hazard:

1. Click anywhere on the map background → a form modal opens with the clicked coordinates
2. Select the **hazard type**:
   - Pothole
   - Missing signage
   - Blocked lane
   - Near miss
   - Poor lighting
   - Other
3. Add an optional description and submit
4. The report appears as an orange `!` marker on the map immediately

Hazard reports have a lifecycle: `open` → `acknowledged` → `resolved` (managed by admins or city officials).

---

### Authentication

| Action | Who |
|---|---|
| Browse the map | Anyone (guest) |
| Draw proposals, vote, comment, report hazards | Signed-in users |
| Admin panel | Admin role only |

**Sign up** — email + password + username. A confirmation email is sent by Supabase Auth before the account is active.

**Sign in** — email + password. Session persists via Supabase Auth (JWT + refresh tokens).

**Roles** (hierarchy: guest < user < city_official < admin):

| Role | Description |
|---|---|
| `guest` | Read-only; can view map, proposals, and comments |
| `user` | Can draw proposals, vote, comment, report hazards |
| `city_official` | Same as user; reserved for future official review workflow |
| `admin` | Full access including admin panel |

---

### Admin Panel

Accessible only to users with the `admin` role.

#### Model Version Management

A table listing every trained ML model with:
- Version tag (e.g. `model_v0`, `model_v1`)
- Active status (`✅` = currently scoring new proposals)
- Accuracy %
- F1 score
- Number of training samples
- Training date
- **Activate** button for any inactive version (instantly switches scoring to that version)

#### Retrain Model

Clicking **Retrain** triggers an asynchronous background job that:
1. Rebuilds the training dataset from the current `accidents`, `bike_lanes`, and `danger_crossings` tables
2. Trains a new `GradientBoostingClassifier` pipeline (with `StandardScaler`)
3. Uploads the model `.pkl` to the `ml-models` Supabase Storage bucket
4. Registers the new version in `ml_model_logs` and activates it

The admin panel polls for completion every 5 seconds (up to 120 seconds) and shows a success toast with the new version tag when done.

#### Export Training CSV

Downloads all accident records as a CSV file for external analysis or audit.

#### Data Import

Three idempotent import rows — re-uploading the same file is safe; existing records are skipped:

| Import | File format | What is imported |
|---|---|---|
| Accidents | CSV (semicolon-delimited) | Accident coordinates, date, road type, lighting, weather, severity (auto-derived from injury status) |
| Bike Infrastructure | GeoJSON / Overpass export | Bike lanes (`cycleway`), parking (`bicycle_parking`), and rental (`bicycle_rental`) nodes — all three extracted from a single file |
| Danger Crossings | GeoJSON / Overpass export | Road crossings (`highway=crossing`) and traffic signals (`highway=traffic_signals`) — used by the ML model as crossing-risk features |

Each import row shows **inserted** and **skipped** counts after upload. Bike infrastructure shows separate counts per category (lanes / parking / rental).

**Deduplication strategy:** accidents deduplicate on `(accident_date, ST_DWithin 10 m)`; all OSM-sourced records (lanes, parking, rental, crossings) deduplicate on `osm_id`.

---

### ML Safety Model

The safety scorer uses a `GradientBoostingClassifier` wrapped in a `StandardScaler` pipeline, trained on labelled bike lane segments.

#### 17 Input Features

| Group | Feature | Description |
|---|---|---|
| **Accident proximity** | `accidents_within_50m` | Count of historical accidents within 50 m of the route |
| | `accidents_within_100m` | Count within 100 m |
| | `accidents_within_500m` | Count within 500 m |
| | `fatal_accidents_100m` | Fatal accidents (severity 3) within 100 m |
| | `serious_accidents_100m` | Serious accidents (severity 2) within 100 m |
| | `weighted_severity_score` | Sum of severity² for all accidents within 100 m |
| | `accident_density_per_km` | Accidents per km of proposed lane length |
| **Bike lane proximity** | `nearest_bike_lane_m` | Distance to the closest existing bike lane |
| | `existing_lane_overlap_pct` | Overlap percentage with existing lanes |
| | `bike_lane_density_500m` | Total length of lanes within 500 m |
| | `intersections_count` | Existing lanes within 30 m (connectivity indicator) |
| **Route geometry** | `length_m` | Proposed route length in metres |
| | `num_vertices` | Number of coordinate points |
| | `bearing_variance` | Variance in heading angles (curvature measure) |
| **Danger crossings** | `crossings_within_100m` | Road crossings within 100 m |
| | `uncontrolled_crossings_within_100m` | Crossings without signals within 100 m (strongest risk signal) |
| | `nearest_crossing_m` | Distance to the nearest crossing |

#### Output

| Field | Type | Meaning |
|---|---|---|
| `safety_score` | 0–100 float | Higher = safer |
| `risk_level` | string | `low` (≥ 70), `medium` (45–69), `high` (< 45) |
| `recommendation` | string | Human-readable assessment |
| `features` | object | Full feature vector (shown in proposal card) |
| `model_version` | string | Which model version scored this proposal |

Accident proximity features use an **in-memory KD-Tree** (scipy) built from all `is_actual = TRUE` accidents. Lane and crossing features use **PostGIS RPCs** with `ST_DWithin` and `<->` KNN for metre-accurate spatial queries via GIST indexes.

---

### Internationalisation

The UI is fully localised in **English** and **Ukrainian** (Ukrainian is the default). A single click on the language button in the header switches all labels, form placeholders, error messages, map popups, and admin text simultaneously.

---

## API Endpoints

All endpoints served by FastAPI at `http://localhost:8000`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe; also used to pre-warm Render free tier |
| `POST` | `/api/predict_safety` | Score a GeoJSON LineString; returns score, risk level, features |
| `GET` | `/api/model_versions` | List all ML model versions with metrics |
| `POST` | `/api/retrain` | Trigger async model retraining |
| `POST` | `/api/activate_model/{version}` | Activate a specific model version |
| `GET` | `/api/export_dataset` | Download accident training data as CSV |
| `POST` | `/api/import/accidents` | Import accidents from CSV |
| `POST` | `/api/import/bike_lanes` | Import bike infrastructure from GeoJSON |
| `POST` | `/api/import/crossings` | Import danger crossings from GeoJSON |

Interactive API docs: `http://localhost:8000/docs`

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, React Leaflet, Geoman (drawing), react-i18next |
| Backend | FastAPI, scikit-learn, scipy (KDTree), Supabase Python client |
| Database | Supabase (PostgreSQL 15 + PostGIS) |
| Auth | Supabase Auth (email/password, JWT) |
| Maps | CartoDB Voyager basemap, TomTom Traffic API (optional) |
| Storage | Supabase Storage (`ml-models` bucket for model `.pkl` files) |

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- A [Supabase](https://supabase.com) project with PostGIS enabled
- `ml-models` Storage bucket created in the Supabase dashboard (Storage → New bucket, set to **private**)
- (Optional) [TomTom API key](https://developer.tomtom.com) for live traffic overlay

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
supabase/migrations/008_service_role_import.sql
supabase/migrations/009_import_rpc.sql
supabase/migrations/010_bike_parking.sql
supabase/migrations/011_bike_rental.sql
supabase/migrations/012_accidents_dedup.sql
supabase/migrations/013_bike_infra_geojson.sql
supabase/migrations/014_danger_crossings.sql
supabase/migrations/015_ml_logs_service_role.sql
supabase/migrations/016_ml_models_bucket_rls.sql
supabase/migrations/017_activate_model_rpc.sql
supabase/migrations/018_fix_storage_policy.sql
supabase/migrations/019_service_role_bypassrls.sql
supabase/migrations/020_storage_open_policy.sql
```

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

> Use the **service_role** key (not the anon key) — the backend needs unrestricted DB access for ML training and bulk imports.

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### Seed and train (run once before demo)

Place the source data files in the project root:

| File | Content |
|---|---|
| `CYCLE.csv` | Semicolon-delimited accident records from Lviv |
| `cycleway.geojson` | OSM export of bike lanes, parking, and rental |
| `cross.geojson` | OSM export of road crossings and traffic signals |

```bash
# From the backend/ directory
python -m scripts.seed_model
```

This performs four steps in sequence:
1. Seed **accidents** from `../CYCLE.csv` — deduplicates on `(date, location)`
2. Seed **bike lanes, parking, and rental** from `../cycleway.geojson` — deduplicates on `osm_id`
3. Seed **danger crossings** from `../cross.geojson` — deduplicates on `osm_id`
4. Train `model_v0` on real data (or synthetic fallback if DB is empty), upload to Storage, and activate

If the seed run completed but the storage upload failed (RLS or network issue), upload the already-trained model without reseeding:

```bash
python -m scripts.upload_model           # auto-picks latest models/model_vN.pkl
python -m scripts.upload_model model_v0  # or name a specific version
```

### Start the API server

```bash
uvicorn app.main:app --reload
```

API available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

---

## Project structure

```
Project/
├── CYCLE.csv              # accident source data (not committed)
├── cycleway.geojson       # bike infrastructure source data (not committed)
├── cross.geojson          # crossings source data (not committed)
├── frontend/
│   ├── src/
│   │   ├── components/    # Map, Auth, Proposal, Hazard, Vote, Comment UI
│   │   ├── hooks/         # useAuth, useMapData
│   │   ├── i18n/          # uk.json / en.json translations
│   │   ├── lib/           # apiClient.js (FastAPI calls)
│   │   └── pages/         # AdminPage, ProposalsPage
│   └── .env.local         # gitignored — copy from .env.local.example
├── backend/
│   ├── app/
│   │   ├── db/            # supabase_client.py
│   │   ├── ml/            # feature_engineering (17 features), trainer, predictor, model_store
│   │   └── routers/       # predict, retrain, import_data, export endpoints
│   ├── scripts/
│   │   └── seed_model.py  # seeds all tables + trains initial model
│   └── .env               # gitignored — copy from .env.example
└── supabase/
    └── migrations/        # run in Supabase SQL Editor in order (001–020)
```

---

## Deploy

**Backend** — ships a `render.yaml`. Push the repo and connect to [Render](https://render.com). Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in the Render environment variables dashboard.

**Frontend** — deploy to Vercel or Netlify. Set the four `VITE_*` environment variables in the hosting dashboard.
