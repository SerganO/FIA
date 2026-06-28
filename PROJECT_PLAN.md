# Micromobility Analytics Platform — Hackathon MVP Plan

**Project:** UrbanFlow — Data-Driven Cycling Infrastructure & Safety Platform  
**Timeline:** ~48 hours (one weekend)  
**Goal:** Demo-stable MVP with core P1 features fully working, P2 partially working, P3 as a stretch goal.

---

## Table of Contents

1. [Architecture & Infrastructure](#1-architecture--infrastructure)
2. [Database Schema (Supabase)](#2-database-schema-supabase)
3. [API Documentation (FastAPI)](#3-api-documentation-fastapi)
4. [ML Module Architecture](#4-ml-module-architecture)
5. [Step-by-Step Roadmap](#5-step-by-step-roadmap)
6. [Demo Script & Stability Notes](#6-demo-script--stability-notes)

---

## 1. Architecture & Infrastructure

### 1.1 System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│                                                                 │
│   React App (Vercel)                                            │
│   ├── Leaflet.js Map                                            │
│   │   ├── CartoDB Basemap tiles (free, no key required)         │
│   │   ├── TomTom Traffic Flow tiles (free tier API key)         │
│   │   ├── Leaflet-Geoman (draw proposals)                       │
│   │   └── GeoJSON layers (bike lanes, accidents, proposals)     │
│   ├── Supabase JS Client (auth + realtime DB queries)           │
│   └── Axios / Fetch → FastAPI (ML predictions only)            │
└────────────────────┬──────────────────────────┬────────────────┘
                     │                          │
         Supabase JS SDK                  REST (HTTPS)
         (auth, CRUD, realtime)          (predict, retrain)
                     │                          │
┌────────────────────▼──────┐    ┌──────────────▼────────────────┐
│     SUPABASE              │    │     FASTAPI (Render.com)       │
│                           │    │                               │
│  PostgreSQL + PostGIS     │    │  /api/predict_safety          │
│  ├── auth.users           │◄───┤  /api/retrain                 │
│  ├── public.profiles      │    │  /api/model_versions          │
│  ├── public.accidents     │    │  /api/export_dataset          │
│  ├── public.bike_lanes    │    │                               │
│  ├── public.proposals     │    │  Scikit-Learn models          │
│  ├── public.votes         │    │  stored as .pkl files         │
│  ├── public.comments      │    │  on Render ephemeral disk     │
│  ├── public.hazard_reports│    │  (or fetched from Supabase    │
│  └── public.ml_model_logs │    │   Storage bucket)             │
│                           │    │                               │
│  Supabase Storage         │◄───┤  Reads geo-data from          │
│  └── ml-models/ bucket    │    │  Supabase for retraining      │
└───────────────────────────┘    └───────────────────────────────┘
```

**Key Data Flow:**
1. React fetches GeoJSON from Supabase (bike lanes, accidents) on page load via `supabase-js`.
2. User draws a proposed bike lane with Leaflet-Geoman → coordinates sent as GeoJSON LineString to FastAPI `/api/predict_safety`.
3. FastAPI computes features, runs the loaded `.pkl` model, returns a safety score (0–100) + breakdown.
4. React saves the proposal + score to Supabase `proposals` table via `supabase-js`.
5. All CRUD (votes, comments, reports) goes directly React → Supabase (no FastAPI needed for CRUD).
6. Admin "Retrain" button calls FastAPI `/api/retrain` → FastAPI queries Supabase for latest data → trains new model → uploads new `.pkl` to Supabase Storage → logs version in `ml_model_logs`.

### 1.2 Folder Structure (Monorepo)

```
cyclosafe/
├── frontend/                    # React app → deploy to Vercel
│   ├── public/
│   │   └── sample_data/         # Fallback GeoJSON files for demo
│   │       ├── bike_lanes.geojson
│   │       ├── accidents.geojson
│   │       └── parking.geojson
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   │   ├── MapView.jsx          # Main Leaflet map container
│   │   │   │   ├── TrafficLayer.jsx     # TomTom tile layer wrapper
│   │   │   │   ├── DrawToolbar.jsx      # Leaflet-Geoman controls
│   │   │   │   ├── AccidentLayer.jsx    # Heatmap / marker cluster
│   │   │   │   └── ProposalLayer.jsx    # Drawn + saved proposals
│   │   │   ├── Auth/
│   │   │   │   ├── LoginModal.jsx
│   │   │   │   └── RoleGuard.jsx        # Wrapper for role-based UI
│   │   │   ├── Proposals/
│   │   │   │   ├── ProposalCard.jsx
│   │   │   │   ├── VoteButtons.jsx
│   │   │   │   ├── CommentThread.jsx
│   │   │   │   └── SafetyScoreBadge.jsx
│   │   │   ├── Reports/
│   │   │   │   └── HazardReportForm.jsx
│   │   │   └── Admin/
│   │   │       ├── MLPanel.jsx          # Retrain + model versions
│   │   │       └── ExportButton.jsx
│   │   ├── hooks/
│   │   │   ├── useSupabase.js
│   │   │   ├── useMapData.js
│   │   │   └── useAuth.js
│   │   ├── lib/
│   │   │   ├── supabaseClient.js        # Supabase client init
│   │   │   └── apiClient.js             # Axios instance for FastAPI
│   │   ├── pages/
│   │   │   ├── Home.jsx                 # Map + sidebar
│   │   │   ├── Proposals.jsx            # List + vote view
│   │   │   └── Admin.jsx                # ML panel (role-gated)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.local                       # VITE_SUPABASE_URL, etc.
│   ├── package.json
│   └── vite.config.js
│
├── backend/                     # FastAPI → deploy to Render.com
│   ├── app/
│   │   ├── main.py              # FastAPI app init, CORS, router mount
│   │   ├── routers/
│   │   │   ├── predict.py       # /api/predict_safety
│   │   │   ├── retrain.py       # /api/retrain, /api/model_versions
│   │   │   └── export.py        # /api/export_dataset
│   │   ├── ml/
│   │   │   ├── feature_engineering.py
│   │   │   ├── trainer.py
│   │   │   ├── predictor.py     # Loads model, runs inference
│   │   │   └── model_store.py   # Load/save .pkl to Supabase Storage
│   │   ├── db/
│   │   │   └── supabase_client.py  # supabase-py client init
│   │   └── schemas/
│   │       ├── predict.py       # Pydantic models for request/response
│   │       └── retrain.py
│   ├── models/                  # Local model cache (ephemeral on Render)
│   │   └── .gitkeep
│   ├── scripts/
│   │   └── seed_model.py        # One-time: train initial model + upload
│   ├── requirements.txt
│   ├── render.yaml              # Render deployment config
│   └── .env                     # SUPABASE_URL, SUPABASE_SERVICE_KEY
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_init_extensions.sql
│   │   ├── 002_tables.sql
│   │   ├── 003_rls_policies.sql
│   │   └── 004_seed_data.sql    # Optional: small sample dataset
│   └── seed/
│       └── accidents_sample.csv
│
├── data/                        # Raw datasets (not committed if large)
│   ├── accidents_raw.csv
│   └── osm_bike_lanes.geojson
│
└── PROJECT_PLAN.md
```

**Deployment:**
- Frontend → Vercel (connect GitHub repo, auto-deploy `frontend/`)
- Backend → Render.com (free Web Service, `backend/` folder, Python runtime)
- DB → Supabase (free tier: 500MB storage, 2 projects)

**For Demo Stability:** Keep the backend also runnable locally (`uvicorn app.main:app --reload`) to avoid cold-start issues on Render's free tier.

---

## 2. Database Schema (Supabase)

### 2.1 Enable Extensions

```sql
-- migration: 001_init_extensions.sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()
```

### 2.2 Tables

```sql
-- migration: 002_tables.sql

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with role and display info.
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('guest', 'user', 'city_official', 'admin')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on new user signup (Supabase function trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─── ACCIDENTS ───────────────────────────────────────────────────────────────
-- Historical accident data imported from open datasets (CSV import or seed).
CREATE TABLE public.accidents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location      GEOMETRY(Point, 4326) NOT NULL,  -- WGS84 lat/lng
  severity      SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 3),
                -- 1=minor, 2=serious, 3=fatal
  accident_date DATE,
  road_type     TEXT,    -- 'residential', 'arterial', 'highway'
  light_cond    TEXT,    -- 'daylight', 'dark', 'dusk'
  weather       TEXT,    -- 'clear', 'rain', 'fog'
  vehicles      SMALLINT DEFAULT 1,
  source        TEXT DEFAULT 'historical',  -- 'historical' | 'crowdsourced'
  reported_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accidents_location ON public.accidents USING GIST (location);
CREATE INDEX idx_accidents_severity ON public.accidents (severity);
CREATE INDEX idx_accidents_date     ON public.accidents (accident_date);


-- ─── BIKE_LANES ──────────────────────────────────────────────────────────────
-- Existing cycling infrastructure (imported from OpenStreetMap or city data).
CREATE TABLE public.bike_lanes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geom          GEOMETRY(LineString, 4326) NOT NULL,
  lane_type     TEXT,    -- 'protected', 'painted', 'shared', 'path'
  surface       TEXT,    -- 'asphalt', 'concrete', 'gravel'
  width_m       NUMERIC(4,2),
  name          TEXT,
  osm_id        BIGINT,  -- OpenStreetMap reference
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bike_lanes_geom ON public.bike_lanes USING GIST (geom);


-- ─── PROPOSALS ───────────────────────────────────────────────────────────────
-- User or official proposed new bike lanes drawn on the map.
CREATE TABLE public.proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geom            GEOMETRY(LineString, 4326) NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  proposed_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'under_review', 'approved', 'rejected')),
  -- ML output
  safety_score    NUMERIC(5,2),  -- 0.00–100.00
  ml_version      TEXT,          -- e.g., 'model_v3'
  ml_features     JSONB,         -- raw feature vector for audit
  -- Engagement counters (denormalized for fast display)
  upvotes         INT NOT NULL DEFAULT 0,
  downvotes       INT NOT NULL DEFAULT 0,
  comment_count   INT NOT NULL DEFAULT 0,
  length_m        NUMERIC(10,2), -- computed from geom
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_geom       ON public.proposals USING GIST (geom);
CREATE INDEX idx_proposals_proposed_by ON public.proposals (proposed_by);
CREATE INDEX idx_proposals_status      ON public.proposals (status);

-- Auto-compute length and update updated_at on change
CREATE OR REPLACE FUNCTION proposals_set_length()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.length_m   := ST_Length(NEW.geom::GEOGRAPHY);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_proposals_length
  BEFORE INSERT OR UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION proposals_set_length();


-- ─── VOTES ───────────────────────────────────────────────────────────────────
CREATE TABLE public.votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_type    SMALLINT NOT NULL CHECK (vote_type IN (1, -1)),  -- 1=up, -1=down
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, user_id)  -- one vote per user per proposal
);

-- Keep denormalized counters in sync
CREATE OR REPLACE FUNCTION sync_vote_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.proposals SET
    upvotes   = (SELECT COUNT(*) FROM public.votes
                  WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id)
                    AND vote_type = 1),
    downvotes = (SELECT COUNT(*) FROM public.votes
                  WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id)
                    AND vote_type = -1)
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_vote_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE FUNCTION sync_vote_counts();


-- ─── COMMENTS ────────────────────────────────────────────────────────────────
CREATE TABLE public.comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (LENGTH(body) BETWEEN 1 AND 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_proposal ON public.comments (proposal_id, created_at);

-- Sync comment_count
CREATE OR REPLACE FUNCTION sync_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.proposals SET
    comment_count = (SELECT COUNT(*) FROM public.comments
                      WHERE proposal_id = COALESCE(NEW.proposal_id, OLD.proposal_id))
  WHERE id = COALESCE(NEW.proposal_id, OLD.proposal_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_comment_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION sync_comment_count();


-- ─── HAZARD_REPORTS ──────────────────────────────────────────────────────────
-- P2: Crowdsourced pin-drop reports.
CREATE TABLE public.hazard_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location     GEOMETRY(Point, 4326) NOT NULL,
  report_type  TEXT NOT NULL
                 CHECK (report_type IN (
                   'pothole', 'missing_signage', 'blocked_lane',
                   'near_miss', 'poor_lighting', 'other'
                 )),
  description  TEXT,
  reported_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'acknowledged', 'resolved')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hazard_reports_location ON public.hazard_reports USING GIST (location);


-- ─── ML_MODEL_LOGS ───────────────────────────────────────────────────────────
-- P3: Track trained model versions.
CREATE TABLE public.ml_model_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version         TEXT NOT NULL UNIQUE,  -- e.g., 'model_v1', 'model_v2'
  storage_path    TEXT NOT NULL,         -- Supabase Storage path
  accuracy        NUMERIC(5,4),          -- e.g., 0.8342
  f1_score        NUMERIC(5,4),
  train_samples   INT,
  feature_names   TEXT[],
  trained_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one active model at a time
CREATE UNIQUE INDEX idx_ml_model_logs_active
  ON public.ml_model_logs (is_active)
  WHERE is_active = TRUE;
```

### 2.3 Row Level Security (RLS) Policies

```sql
-- migration: 003_rls_policies.sql

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accidents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_lanes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_model_logs  ENABLE ROW LEVEL SECURITY;

-- ─── Helper: get current user's role ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;


-- ─── PROFILES ────────────────────────────────────────────────────────────────
CREATE POLICY "Profiles are publicly readable"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admin can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'admin');


-- ─── ACCIDENTS ───────────────────────────────────────────────────────────────
CREATE POLICY "Accidents are publicly readable"
  ON public.accidents FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert crowdsourced accidents"
  ON public.accidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND source = 'crowdsourced');

CREATE POLICY "Admins can insert historical accidents"
  ON public.accidents FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');


-- ─── BIKE_LANES ──────────────────────────────────────────────────────────────
CREATE POLICY "Bike lanes are publicly readable"
  ON public.bike_lanes FOR SELECT USING (true);

CREATE POLICY "Only admins can modify bike lanes"
  ON public.bike_lanes FOR ALL
  USING (public.get_my_role() = 'admin');


-- ─── PROPOSALS ───────────────────────────────────────────────────────────────
CREATE POLICY "Proposals are publicly readable"
  ON public.proposals FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create proposals"
  ON public.proposals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND proposed_by = auth.uid());

CREATE POLICY "Authors can update own draft proposals"
  ON public.proposals FOR UPDATE
  USING (
    proposed_by = auth.uid()
    AND status = 'draft'
  );

CREATE POLICY "City officials and admins can update any proposal status"
  ON public.proposals FOR UPDATE
  USING (public.get_my_role() IN ('city_official', 'admin'));


-- ─── VOTES ───────────────────────────────────────────────────────────────────
CREATE POLICY "Votes are publicly readable"
  ON public.votes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can vote"
  ON public.votes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can change their own vote"
  ON public.votes FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own vote"
  ON public.votes FOR DELETE
  USING (user_id = auth.uid());


-- ─── COMMENTS ────────────────────────────────────────────────────────────────
CREATE POLICY "Comments are publicly readable"
  ON public.comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

CREATE POLICY "Authors can delete own comments"
  ON public.comments FOR DELETE
  USING (author_id = auth.uid());

CREATE POLICY "Admins can delete any comment"
  ON public.comments FOR DELETE
  USING (public.get_my_role() = 'admin');


-- ─── HAZARD_REPORTS ──────────────────────────────────────────────────────────
CREATE POLICY "Hazard reports are publicly readable"
  ON public.hazard_reports FOR SELECT USING (true);

CREATE POLICY "Authenticated users can submit hazard reports"
  ON public.hazard_reports FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "City officials and admins can update report status"
  ON public.hazard_reports FOR UPDATE
  USING (public.get_my_role() IN ('city_official', 'admin'));


-- ─── ML_MODEL_LOGS ───────────────────────────────────────────────────────────
CREATE POLICY "Model logs are readable by officials and admins"
  ON public.ml_model_logs FOR SELECT
  USING (public.get_my_role() IN ('city_official', 'admin'));

CREATE POLICY "Only admins can insert/update model logs"
  ON public.ml_model_logs FOR ALL
  USING (public.get_my_role() = 'admin');
```

**Supabase Storage:** Create a bucket named `ml-models` with private access. Service role key (backend only) is used to upload/download `.pkl` files.

---

## 3. API Documentation (FastAPI)

### 3.1 Setup & Environment

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import predict, retrain, export

app = FastAPI(title="UrbanFlow ML API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-app.vercel.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router, prefix="/api")
app.include_router(retrain.router, prefix="/api")
app.include_router(export.router,  prefix="/api")

@app.get("/health")
def health(): return {"status": "ok"}
```

### 3.2 Endpoint: `POST /api/predict_safety`

**Purpose:** Given a proposed bike lane geometry, return an ML-computed safety score.

```
POST /api/predict_safety
Content-Type: application/json

Request Body:
{
  "geometry": {
    "type": "LineString",
    "coordinates": [[lng1, lat1], [lng2, lat2], ...]  // WGS84
  },
  "metadata": {
    "title": "New bike lane on Main St",   // optional
    "road_type": "arterial"                // optional hint
  }
}

Response 200:
{
  "safety_score": 72.4,           // 0–100, higher = safer
  "risk_level": "medium",         // "low" | "medium" | "high"
  "model_version": "model_v2",
  "features": {
    "accidents_within_100m":  3,
    "accidents_within_500m":  11,
    "weighted_severity_score": 4.2,
    "nearest_bike_lane_m":    120.5,
    "length_m":               850.0,
    "intersections_count":    2,
    "existing_lane_overlap_pct": 0.0
  },
  "recommendation": "Moderate risk. Consider adding physical barriers."
}

Response 422: Validation error (malformed geometry)
Response 503: Model not loaded yet
```

**Implementation notes:**
- Feature extraction is a spatial query against Supabase (PostGIS) at prediction time.
- If Supabase round-trip is too slow for demo, pre-cache accidents as a spatial index in memory on startup.

### 3.3 Endpoint: `POST /api/retrain`

**Purpose:** Trigger model retraining on latest data. Admin only (validated via Supabase JWT).

```
POST /api/retrain
Authorization: Bearer <supabase_jwt>
Content-Type: application/json

Request Body:
{
  "notes": "Added 200 new crowdsourced accidents"   // optional
}

Response 200 (async, returns immediately with job ID):
{
  "job_id": "uuid",
  "status": "started",
  "message": "Retraining initiated. Check /api/model_versions for completion."
}

Response 401: Unauthorized (not admin)
Response 409: Another retraining job is already running
```

**Implementation note:** For hackathon simplicity, run training synchronously but in a background thread. Training on ~5k samples takes <10 seconds. Return 200 immediately and update `ml_model_logs` when done.

### 3.4 Endpoint: `GET /api/model_versions`

```
GET /api/model_versions

Response 200:
{
  "versions": [
    {
      "version": "model_v2",
      "is_active": true,
      "accuracy": 0.834,
      "f1_score": 0.821,
      "train_samples": 4823,
      "created_at": "2024-10-12T14:33:00Z"
    },
    {
      "version": "model_v1",
      "is_active": false,
      "accuracy": 0.791,
      "f1_score": 0.778,
      "train_samples": 3100,
      "created_at": "2024-10-12T09:00:00Z"
    }
  ]
}
```

### 3.5 Endpoint: `GET /api/export_dataset`

```
GET /api/export_dataset
Authorization: Bearer <supabase_jwt>   // admin only

Response 200:
Content-Type: text/csv
Content-Disposition: attachment; filename="training_data_export.csv"

[CSV stream of accidents + engineered features]
```

### 3.6 Pydantic Schemas

```python
# backend/app/schemas/predict.py
from pydantic import BaseModel, validator
from typing import List, Tuple, Optional

class GeoJSONLineString(BaseModel):
    type: str
    coordinates: List[Tuple[float, float]]

    @validator('type')
    def must_be_linestring(cls, v):
        if v != 'LineString':
            raise ValueError('Only LineString geometry is supported')
        return v

    @validator('coordinates')
    def min_two_points(cls, v):
        if len(v) < 2:
            raise ValueError('LineString requires at least 2 coordinates')
        return v

class PredictRequest(BaseModel):
    geometry: GeoJSONLineString
    metadata: Optional[dict] = {}

class FeatureVector(BaseModel):
    accidents_within_100m: int
    accidents_within_500m: int
    weighted_severity_score: float
    nearest_bike_lane_m: float
    length_m: float
    intersections_count: int
    existing_lane_overlap_pct: float

class PredictResponse(BaseModel):
    safety_score: float
    risk_level: str
    model_version: str
    features: FeatureVector
    recommendation: str
```

---

## 4. ML Module Architecture

### 4.1 Problem Framing

**Task:** Given a proposed bike lane segment (LineString), predict a **Safety Score (0–100)**.

Since ground truth "safe/unsafe" labels are hard to obtain directly, we use a **proxy label** approach:
- Label = `1` (safe): existing bike lane segments that had **0 accidents within 100m** over the last 3 years.
- Label = `0` (risky): road segments that had **≥2 accidents within 100m** over the last 3 years.
- Discard ambiguous segments (1 accident) during initial training.

**Model type:** `GradientBoostingClassifier` (sklearn) — robust on tabular data, handles class imbalance well with `class_weight`, no GPU needed, fast inference (<1ms).

**Output:** Convert classifier probability `P(safe)` → safety score `score = P(safe) * 100`.

### 4.2 Feature Engineering

```python
# backend/app/ml/feature_engineering.py
"""
Features extracted per proposed LineString segment via PostGIS queries.
All spatial queries use ST_DWithin on GEOGRAPHY type for meter-accurate distances.
"""

FEATURES = [
    # ── Accident proximity features ──────────────────────────────────────────
    "accidents_within_50m",      # INT   count of accidents in 50m buffer
    "accidents_within_100m",     # INT   count of accidents in 100m buffer
    "accidents_within_500m",     # INT   count in 500m (broader context)
    "fatal_accidents_100m",      # INT   count where severity=3 within 100m
    "serious_accidents_100m",    # INT   count where severity=2 within 100m
    "weighted_severity_score",   # FLOAT sum(severity^2) / max(1, count) — penalizes fatals
    "accident_density_per_km",   # FLOAT accidents_100m / (length_m / 1000)

    # ── Existing infrastructure proximity ─────────────────────────────────────
    "nearest_bike_lane_m",       # FLOAT ST_Distance to nearest existing bike_lane
    "existing_lane_overlap_pct", # FLOAT % of proposed geom within 20m of existing lane
    "bike_lane_density_500m",    # FLOAT total length of bike lanes within 500m buffer

    # ── Segment geometry features ─────────────────────────────────────────────
    "length_m",                  # FLOAT ST_Length(geom::GEOGRAPHY)
    "num_vertices",              # INT   number of coordinate pairs (proxy for curves)
    "bearing_variance",          # FLOAT variance of bearing between consecutive segments
                                 #       (high = winding road = potentially more dangerous)

    # ── Contextual / heuristic features ──────────────────────────────────────
    # These are approximated or hardcoded for hackathon if data unavailable
    "intersections_count",       # INT   count of existing lane endpoints within 30m of proposed
    "near_school_or_hospital",   # BOOL  (0/1) proximity to known POIs (can be hardcoded to 0)
]
```

**SQL query template for accident features:**
```sql
-- Count accidents within buffer of proposed LineString
SELECT
  COUNT(*) FILTER (WHERE ST_DWithin(location::GEOGRAPHY,
    ST_GeomFromGeoJSON($1)::GEOGRAPHY, 100)) AS accidents_within_100m,
  COUNT(*) FILTER (WHERE ST_DWithin(location::GEOGRAPHY,
    ST_GeomFromGeoJSON($1)::GEOGRAPHY, 500)) AS accidents_within_500m,
  COALESCE(SUM(POWER(severity, 2))
    FILTER (WHERE ST_DWithin(location::GEOGRAPHY,
      ST_GeomFromGeoJSON($1)::GEOGRAPHY, 100)), 0)
    AS weighted_severity_score
FROM public.accidents;
```

### 4.3 Training Pipeline

```python
# backend/app/ml/trainer.py
import pickle, os
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, f1_score
from app.db.supabase_client import get_supabase
from app.ml.feature_engineering import extract_features_for_segment

FEATURE_NAMES = [
    "accidents_within_50m", "accidents_within_100m", "accidents_within_500m",
    "fatal_accidents_100m", "serious_accidents_100m", "weighted_severity_score",
    "accident_density_per_km", "nearest_bike_lane_m", "existing_lane_overlap_pct",
    "bike_lane_density_500m", "length_m", "num_vertices", "bearing_variance",
    "intersections_count",
]

def build_training_dataset(supabase):
    """
    Build labeled training set from existing bike lanes + accident data.
    Returns X (feature matrix), y (labels).
    """
    bike_lanes = supabase.table("bike_lanes").select("id, geom").execute().data
    rows, labels = [], []

    for lane in bike_lanes:
        features = extract_features_for_segment(supabase, lane["geom"])
        rows.append([features[f] for f in FEATURE_NAMES])
        # Proxy label: 0 accidents within 100m = safe (1), else risky (0)
        label = 1 if features["accidents_within_100m"] == 0 else 0
        labels.append(label)

    return rows, labels

def train_model(supabase, version_tag: str) -> dict:
    X, y = build_training_dataset(supabase)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(
            n_estimators=100, max_depth=4,
            learning_rate=0.1, random_state=42
        ))
    ])
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    metrics = {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "f1_score": round(f1_score(y_test, y_pred, average="weighted"), 4),
        "train_samples": len(X_train),
    }

    model_path = f"models/{version_tag}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({"pipeline": pipeline, "feature_names": FEATURE_NAMES}, f)

    return {"model_path": model_path, "metrics": metrics}
```

### 4.4 Model Storage Strategy

```
Startup sequence on Render (or locally):
1. FastAPI starts → app/ml/predictor.py calls load_active_model()
2. load_active_model() queries ml_model_logs WHERE is_active=TRUE
3. Downloads the .pkl from Supabase Storage to ./models/ (local cache)
4. Loads into memory as a module-level singleton

On Retrain:
1. Train new model → save as model_vN.pkl locally
2. Upload to Supabase Storage bucket "ml-models" at path "model_vN.pkl"
3. INSERT into ml_model_logs (is_active=FALSE initially)
4. UPDATE ml_model_logs SET is_active=FALSE WHERE is_active=TRUE (deactivate old)
5. UPDATE ml_model_logs SET is_active=TRUE WHERE version='model_vN'
6. Call load_active_model() to hot-swap the in-memory model

Fallback for demo: If Supabase Storage fails, serve model from Git LFS
or ship a seed model_v0.pkl directly in the repository (if <50MB).
```

**Initial seed model:** Run `backend/scripts/seed_model.py` once before the demo. This script uses synthetic data or a provided CSV to train `model_v0` and uploads it so the service has a model on first startup.

```python
# backend/scripts/seed_model.py
"""Run once: python -m scripts.seed_model"""
import sys, os
sys.path.insert(0, os.path.abspath("."))

from app.ml.trainer import train_model
from app.ml.model_store import upload_model, activate_model
from app.db.supabase_client import get_supabase

supabase = get_supabase()
result = train_model(supabase, "model_v0")
upload_model(result["model_path"], "model_v0")
activate_model(supabase, "model_v0", result["metrics"])
print("Seed model trained and activated:", result["metrics"])
```

### 4.5 Safety Score → Human-readable Output

```python
def score_to_risk_level(score: float) -> tuple[str, str]:
    if score >= 70:
        return "low", "Good candidate for a standard painted lane."
    elif score >= 45:
        return "medium", "Moderate risk. Consider physical barriers or calming measures."
    else:
        return "high", "High risk segment. Significant infrastructure investment needed."
```

---

## 5. Step-by-Step Roadmap

### ⏱ Phase 1 — Environment Setup (Hours 0–3)

**Goal:** Every service is live, connected, and "Hello World" is running end-to-end.

| # | Task | Owner hint | Time |
|---|------|-----------|------|
| 1.1 | Create GitHub repo; set up monorepo structure per Section 1.2 | All | 15 min |
| 1.2 | Create Supabase project; run `001_init_extensions.sql` and `002_tables.sql` | Backend | 30 min |
| 1.3 | Run `003_rls_policies.sql`; verify policies in Supabase dashboard | Backend | 20 min |
| 1.4 | Create Supabase Storage bucket `ml-models` (private) | Backend | 5 min |
| 1.5 | Scaffold FastAPI app; add `requirements.txt`; test `GET /health` locally | Backend | 30 min |
| 1.6 | Deploy backend to Render.com (free Web Service, Python, `backend/` root) | Backend | 20 min |
| 1.7 | `npm create vite@latest frontend -- --template react`; install deps: `leaflet`, `react-leaflet`, `@supabase/supabase-js`, `axios` | Frontend | 20 min |
| 1.8 | Wire up Supabase client in `src/lib/supabaseClient.js`; test auth sign-up | Frontend | 20 min |
| 1.9 | Deploy frontend to Vercel (connect GitHub, set env vars) | Frontend | 15 min |
| 1.10 | Sign up for TomTom API (free, no CC); get API key; verify traffic tile URL in browser | Frontend | 15 min |
| 1.11 | Import sample GeoJSON data into Supabase (bike lanes + accidents CSV); verify PostGIS queries work | Backend | 40 min |
| 1.12 | Run `seed_model.py` to train and upload `model_v0` | Backend | 20 min |

**Checkpoint:** Vercel URL loads a React app; FastAPI `/health` returns 200; Supabase has data; `model_v0.pkl` is in Storage.

---

### ⚡ Phase 2 — Core Features (Hours 3–20)

**Goal:** P1 features fully functional. Build in this exact order to maximize demo impact.

#### 2A — Authentication & Roles (2 hrs)

| # | Task |
|---|------|
| 2A.1 | Build `LoginModal.jsx` — email/password + magic link; use `supabase.auth.signInWithPassword` |
| 2A.2 | Build `useAuth.js` hook — `session`, `user`, `profile` (including `role`) from Supabase |
| 2A.3 | Build `RoleGuard.jsx` — wraps components; hides UI based on `profile.role` |
| 2A.4 | Pre-create test accounts in Supabase dashboard: `guest@test.com`, `user@test.com`, `official@test.com`, `admin@test.com`; manually set roles in `profiles` table |
| 2A.5 | Add role display in nav bar (shows current user role badge) |

#### 2B — Interactive Map (3 hrs)

| # | Task |
|---|------|
| 2B.1 | Build `MapView.jsx` — Leaflet map with CartoDB Voyager basemap; center on your city of choice |
| 2B.2 | Build `AccidentLayer.jsx` — fetch accidents from Supabase; render as colored markers (red=fatal, orange=serious, yellow=minor); add `react-leaflet-cluster` for marker clustering |
| 2B.3 | Add bike lanes GeoJSON layer — fetch from Supabase, render as green polylines |
| 2B.4 | Build `TrafficLayer.jsx` — add TomTom Flow tile layer with toggle button |
| 2B.5 | Add layer visibility toggles in a legend/control panel |
| 2B.6 | Add popups on accident markers showing: date, severity, weather |

**DEMO TIP:** If Supabase is slow, load bike lanes and accidents from the `/public/sample_data/` GeoJSON files as fallback.

#### 2C — ML Proposal Tool (5 hrs — highest value, demo centerpiece)

| # | Task |
|---|------|
| 2C.1 | Install `@geoman-io/leaflet-geoman-free`; build `DrawToolbar.jsx` — enable only polyline drawing mode, visible only to `user`/`city_official`/`admin` roles |
| 2C.2 | On polyline draw complete: show modal asking for `title` + `description` |
| 2C.3 | Send GeoJSON to FastAPI `POST /api/predict_safety`; show loading spinner |
| 2C.4 | Display `SafetyScoreBadge.jsx` — animated score gauge (0–100), color-coded (green/yellow/red), risk level text, recommendation text |
| 2C.5 | On user confirmation, `INSERT` into `proposals` table via Supabase; include `safety_score` + `ml_version` |
| 2C.6 | Build `ProposalLayer.jsx` — render all saved proposals on map as colored lines (green=low risk, orange=medium, red=high); clicking opens `ProposalCard.jsx` |
| 2C.7 | Implement the FastAPI `/api/predict_safety` endpoint fully — feature extraction via Supabase, model inference, response |

**Feature extraction performance tip:** Pre-load all accidents into memory at FastAPI startup as a scipy spatial KDTree for O(log n) nearest-neighbor queries instead of per-request DB round-trips.

```python
# backend/app/ml/spatial_index.py
from scipy.spatial import KDTree
import numpy as np
from app.db.supabase_client import get_supabase

_accident_tree = None
_accident_data = None

def load_accident_index():
    global _accident_tree, _accident_data
    supabase = get_supabase()
    rows = supabase.rpc("get_accidents_with_coords").execute().data
    coords = np.array([[r["lng"], r["lat"]] for r in rows])
    _accident_tree = KDTree(coords)
    _accident_data = rows
    return len(rows)
```

---

### 🗳 Phase 3 — Engagement + ML Admin (Hours 20–36)

**Goal:** P2 civic engagement features + P3 ML admin panel.

#### 3A — Civic Engagement (P2, 4 hrs)

| # | Task |
|---|------|
| 3A.1 | Build `VoteButtons.jsx` — upvote/downvote using Supabase `votes` table; show live counts; disable if already voted |
| 3A.2 | Build `CommentThread.jsx` — paginated comments list + comment input form |
| 3A.3 | Build `Proposals.jsx` page — list view with sorting (by score, votes, date); links to map view |
| 3A.4 | Build `HazardReportForm.jsx` — appears on map click for logged-in users; dropdown for report type; POST to `hazard_reports` |
| 3A.5 | Add hazard reports as map layer (orange pin markers with exclamation icon) |
| 3A.6 | A/B Voting: filter proposals by `status='under_review'`; show them side-by-side in a dedicated comparison modal (city_official role only) |

#### 3B — ML Admin Panel (P3, 3 hrs)

| # | Task |
|---|------|
| 3B.1 | Build `Admin.jsx` page — protected by `RoleGuard` (admin only); visible in nav for admin role |
| 3B.2 | Build `MLPanel.jsx` — calls `GET /api/model_versions`; renders table of versions with accuracy, F1, date, sample count; highlights active version |
| 3B.3 | Add "Retrain Model" button — calls `POST /api/retrain`; show toast notification "Retraining started..."; poll `model_versions` every 5s until new version appears |
| 3B.4 | Build `ExportButton.jsx` — calls `GET /api/export_dataset`; triggers CSV download |
| 3B.5 | Add "Activate Version" button per row in model log table — calls `POST /api/activate_model/{version}` |
| 3B.6 | Implement FastAPI retrain endpoint with background thread + Supabase Storage upload |

---

### ✨ Phase 4 — Polish & Demo Prep (Hours 36–48)

**Goal:** Eliminate all demo-breaking bugs, add visual polish, prepare the 5-minute pitch.

| # | Task | Time |
|---|------|------|
| 4.1 | **Demo data seeding:** ensure Supabase has ≥500 accidents, ≥50 bike lanes, and ≥5 pre-created proposals (2 official, 3 user) | 1 hr |
| 4.2 | **Loading states:** add skeletons/spinners on every async operation (map load, score fetch, vote) | 45 min |
| 4.3 | **Error handling:** catch Supabase/FastAPI failures; show user-friendly toasts instead of console errors | 30 min |
| 4.4 | **Offline fallback:** if FastAPI on Render is cold (takes ~30s to spin up), pre-warm it on page load with `GET /health` in the background | 15 min |
| 4.5 | **Mobile responsive:** ensure map takes full viewport on mobile; sidebar collapses | 30 min |
| 4.6 | **Visual polish:** consistent color scheme, role badges, safety score gradient, clean typography | 45 min |
| 4.7 | **Retrain demo prep:** run one retrain locally before demo so `model_v1` exists; have 2 versions in the log table | 20 min |
| 4.8 | **Demo script rehearsal:** walk through the 5 key demo flows (see Section 6) twice; time each flow | 30 min |
| 4.9 | **Backup plan:** run backend locally and set `VITE_API_URL=http://localhost:8000` as a fallback env var if Render cold-starts during demo | 15 min |
| 4.10 | **Final deployment:** push all env vars to Vercel + Render; test production URLs | 20 min |

---

## 6. Demo Script & Stability Notes

### 6.1 Five Key Demo Flows (5 minutes total)

```
Flow 1 — MAP OVERVIEW (45 sec)
  → Open app → show CartoDB basemap
  → Toggle Accident Heatmap layer (red = danger zones)
  → Toggle TomTom Traffic layer (real-time congestion)
  → Toggle Existing Bike Lanes layer
  "Here's the city's current cycling infrastructure and accident history."

Flow 2 — PROPOSAL + ML SCORE (90 sec)  ← DEMO CENTERPIECE
  → Log in as city_official@test.com
  → Click Draw Bike Lane tool
  → Draw a line through a known accident cluster
  → "Watch what happens..."
  → Score appears: 23/100 — HIGH RISK
  → Draw another line on a safer street
  → Score: 81/100 — LOW RISK, "Good candidate for a painted lane."
  "Our ML model instantly evaluates any proposed route using historical accident data."

Flow 3 — CIVIC ENGAGEMENT (60 sec)
  → Switch to user@test.com
  → Open existing proposal → upvote it → add comment
  → Switch to official@test.com → show A/B comparison view
  "Citizens and officials collaborate directly on the platform."

Flow 4 — CROWDSOURCED REPORT (30 sec)
  → As user@test.com → click on map → Report Hazard
  → Select "pothole" → submit
  → Show it appear as orange pin on map
  "Crowdsourced reporting keeps the data fresh."

Flow 5 — ML ADMIN PANEL (45 sec)
  → Log in as admin@test.com → navigate to Admin
  → Show model_v0 and model_v1 in version table (accuracy: 0.791 → 0.834)
  → Click "Retrain" → show progress toast → new version appears
  → Click Export Dataset → CSV downloads
  "Officials can continuously improve the model as new data arrives."
```

### 6.2 Stability Safeguards

| Risk | Mitigation |
|------|-----------|
| Render cold start (30–60 sec delay) | Pre-warm with `/health` call on page load; run backend locally as backup |
| Supabase free tier rate limits | Batch GeoJSON fetches on startup; cache in React state; avoid polling |
| TomTom API key exposed in client | Expected for demo (it's a client-side map tile API); rotate after demo |
| ML model not loaded on startup | `seed_model.py` must be run before demo; add `/health` response that includes `model_loaded: true` |
| No real accident data | Use UK STATS19 (public), Chicago Traffic Crashes (data.cityofchicago.org), or Paris ONISR datasets — all free CSV downloads |
| Leaflet-Geoman draw tool confusing for judges | Pre-draw one proposal and save it before demo; only draw one new one live |

### 6.3 Environment Variables Checklist

**Frontend (Vercel):**
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_FASTAPI_URL=https://cyclosafe-backend.onrender.com
VITE_TOMTOM_API_KEY=your_tomtom_key
```

**Backend (Render):**
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # service_role key, never expose to frontend
PORT=8000
```

### 6.4 Key Dependencies

```
# backend/requirements.txt
fastapi==0.115.0
uvicorn[standard]==0.30.0
supabase==2.7.4
scikit-learn==1.5.2
scipy==1.14.0
numpy==1.26.4
shapely==2.0.6
pyproj==3.6.1
python-multipart==0.0.9
python-jose[cryptography]==3.3.0
```

```json
// frontend package.json (key deps)
{
  "leaflet": "^1.9.4",
  "react-leaflet": "^4.2.1",
  "@geoman-io/leaflet-geoman-free": "^2.16.0",
  "react-leaflet-cluster": "^2.1.0",
  "@supabase/supabase-js": "^2.45.0",
  "axios": "^1.7.7",
  "react-hot-toast": "^2.4.1"
}
```

---

## Appendix: Free Dataset Sources

| Dataset | URL | Use |
|---------|-----|-----|
| UK STATS19 Road Accidents | data.gov.uk/dataset/cb7ae6f0-4be6-4935-9277-47e5ce24a11f | Accidents CSV with lat/lng, severity, weather |
| Chicago Traffic Crashes | data.cityofchicago.org/Transportation/Traffic-Crashes | US accidents GeoJSON |
| OpenStreetMap Bike Lanes | overpass-turbo.eu (query `highway=cycleway`) | Existing bike lane geometries |
| Paris ONISR | data.gouv.fr/fr/datasets/bases-de-donnees-annuelles-des-accidents-corporels | French accident data |
| NYC Open Data Bike Crashes | data.cityofnewyork.us | Motor vehicle collisions |
