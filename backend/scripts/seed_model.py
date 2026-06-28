"""
Seed the database and train/upload the initial ML model.
Run ONCE before demo, from the backend/ directory:

  cd backend
  python -m scripts.seed_model

Steps:
  1. Seed accidents from ../CYCLE.csv (if present, idempotent via date+location dedup)
  2. Seed bike infrastructure from ../cycleway.geojson — lanes, parking, and rental
     (idempotent via osm_id dedup)
  3. Train GradientBoostingClassifier on real or synthetic data
  4. Upload model_v0 to Supabase Storage and activate it

Requirements: .env must exist with SUPABASE_URL and SUPABASE_SERVICE_KEY.
Falls back to synthetic training data if the DB has no bike lane rows after seeding.
"""
import csv
import io
import json
import logging
import os
import pickle
import sys

import numpy as np

sys.path.insert(0, os.path.abspath("."))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from app.ml.feature_engineering import FEATURE_NAMES


# ── Shared RPC batch helper ────────────────────────────────────────────────────

def _rpc_batch(sb, rpc_name: str, rows: list, batch: int = 200) -> tuple[int, int]:
    """Call a SECURITY DEFINER RPC in batches. Returns (inserted, skipped)."""
    ins = skip = 0
    for i in range(0, len(rows), batch):
        result = sb.rpc(rpc_name, {"rows": rows[i : i + batch]}).execute()
        data = result.data or {}
        ins  += data.get("inserted", 0)
        skip += data.get("skipped", 0)
    return ins, skip


# ── Data seeders ───────────────────────────────────────────────────────────────

def seed_accidents(sb, csv_path: str = "../CYCLE.csv") -> None:
    """
    Seed accidents table from semicolon-delimited CSV.
    Idempotent — the import_accidents_batch RPC deduplicates on (date, location).
    """
    if not os.path.exists(csv_path):
        logger.info(f"Accidents CSV not found at {csv_path} — skipping")
        return

    from app.routers.import_data import _severity

    with open(csv_path, "rb") as fh:
        raw = fh.read()

    text = None
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            text = raw.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if text is None:
        logger.warning("Cannot decode CYCLE.csv — skipping accidents seed")
        return

    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    rows: list[dict] = []
    skipped = 0

    for row in reader:
        try:
            lat = float(row["latitude"])
            lng = float(row["longitude"])
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                skipped += 1
                continue
            street = " ".join(
                filter(None, [row.get("streetType", ""), row.get("streetName", "")])
            ).strip() or None
            vehicles_raw = row.get("totalParticipantsAmount", "1")
            vehicles = int(vehicles_raw) if vehicles_raw and vehicles_raw.isdigit() else 1
            rows.append({
                "location":      f"SRID=4326;POINT({lng} {lat})",
                "severity":      _severity(
                                     row.get("injuryStatusParticipant1", ""),
                                     row.get("injuryStatusParticipant2", ""),
                                 ),
                "accident_date": row.get("accidentDate") or None,
                "road_type":     street,
                "vehicles":      vehicles,
                "source":        "seed",
                "is_actual":     True,
            })
        except (ValueError, KeyError):
            skipped += 1

    if not rows:
        logger.warning(f"No valid accident rows parsed from {csv_path}")
        return

    ins, rpc_skip = _rpc_batch(sb, "import_accidents_batch", rows)
    logger.info(
        f"Accidents:    {ins} inserted, {rpc_skip + skipped} skipped "
        f"({len(rows)} parsed from CSV)"
    )


def seed_crossings(sb, geojson_path: str = "../cross.geojson") -> None:
    """
    Seed danger_crossings table from a GeoJSON FeatureCollection.
    Only imports Points with highway=crossing or highway=traffic_signals.
    Idempotent — import_danger_crossings_batch deduplicates on osm_id.
    """
    if not os.path.exists(geojson_path):
        logger.info(f"Crossings GeoJSON not found at {geojson_path} — skipping")
        return

    from app.routers.import_data import _parse_crossing

    with open(geojson_path, encoding="utf-8") as fh:
        geojson = json.load(fh)

    rows: list[dict] = []
    parse_errors = 0

    for feat in geojson.get("features", []):
        try:
            crossing = _parse_crossing(feat)
            if crossing is not None:
                rows.append(crossing)
        except Exception:
            parse_errors += 1

    if not rows:
        logger.warning(f"No valid crossing features parsed from {geojson_path}")
        return

    ins, skip = _rpc_batch(sb, "import_danger_crossings_batch", rows)
    logger.info(
        f"Crossings:    {ins} inserted, {skip} skipped  "
        f"({len(rows)} parsed, {parse_errors} parse errors)"
    )


def seed_infrastructure(sb, geojson_path: str = "../cycleway.geojson") -> None:
    """
    Seed bike_lanes, bike_parking, and bike_rental from a GeoJSON FeatureCollection.
    Idempotent — each RPC deduplicates on osm_id.
    """
    if not os.path.exists(geojson_path):
        logger.info(f"GeoJSON not found at {geojson_path} — skipping infrastructure seed")
        return

    from app.routers.import_data import _parse_lane, _parse_parking, _parse_rental

    with open(geojson_path, encoding="utf-8") as fh:
        geojson = json.load(fh)

    lane_rows:    list[dict] = []
    parking_rows: list[dict] = []
    rental_rows:  list[dict] = []
    parse_errors = 0

    for feat in geojson.get("features", []):
        try:
            lane = _parse_lane(feat)
            if lane is not None:
                lane_rows.append(lane)
                continue
            parking = _parse_parking(feat)
            if parking is not None:
                parking_rows.append(parking)
                continue
            rental = _parse_rental(feat)
            if rental is not None:
                rental_rows.append(rental)
        except Exception:
            parse_errors += 1

    if lane_rows:
        ins, skip = _rpc_batch(sb, "import_bike_lanes_batch", lane_rows)
        logger.info(f"Bike lanes:   {ins} inserted, {skip} skipped  ({len(lane_rows)} parsed)")
    else:
        logger.info("Bike lanes:   0 features found in GeoJSON")

    if parking_rows:
        ins, skip = _rpc_batch(sb, "import_bike_parking_batch", parking_rows)
        logger.info(f"Bike parking: {ins} inserted, {skip} skipped  ({len(parking_rows)} parsed)")
    else:
        logger.info("Bike parking: 0 features found in GeoJSON")

    if rental_rows:
        ins, skip = _rpc_batch(sb, "import_bike_rental_batch", rental_rows)
        logger.info(f"Bike rental:  {ins} inserted, {skip} skipped  ({len(rental_rows)} parsed)")
    else:
        logger.info("Bike rental:  0 features found in GeoJSON")

    if parse_errors:
        logger.warning(f"Infrastructure parse errors: {parse_errors}")


# ── Synthetic fallback dataset ─────────────────────────────────────────────────

def _synthetic_dataset(n: int = 600) -> tuple[list, list]:
    """
    Generate synthetic labelled rows when real bike-lane data is unavailable.
    Feature distributions are calibrated to resemble realistic urban scenarios.
    """
    rng = np.random.RandomState(42)
    X, y = [], []
    for _ in range(n):
        safe = rng.random() > 0.45
        if safe:
            row = {
                "accidents_within_50m":               rng.poisson(0.2),
                "accidents_within_100m":              rng.poisson(0.5),
                "accidents_within_500m":              rng.poisson(2),
                "fatal_accidents_100m":               0,
                "serious_accidents_100m":             rng.binomial(1, 0.05),
                "weighted_severity_score":            float(rng.exponential(0.5)),
                "accident_density_per_km":            float(rng.exponential(0.3)),
                "nearest_bike_lane_m":                float(rng.uniform(0, 200)),
                "existing_lane_overlap_pct":          float(rng.uniform(0.3, 1.0)),
                "bike_lane_density_500m":             float(rng.uniform(200, 2000)),
                "length_m":                           float(rng.uniform(200, 1500)),
                "num_vertices":                       int(rng.randint(2, 15)),
                "bearing_variance":                   float(rng.uniform(0, 50)),
                "intersections_count":                int(rng.randint(0, 3)),
                "crossings_within_100m":              int(rng.poisson(1)),
                "uncontrolled_crossings_within_100m": int(rng.binomial(1, 0.1)),
                "nearest_crossing_m":                 float(rng.uniform(30, 200)),
            }
        else:
            row = {
                "accidents_within_50m":               rng.poisson(2),
                "accidents_within_100m":              rng.poisson(5),
                "accidents_within_500m":              rng.poisson(15),
                "fatal_accidents_100m":               int(rng.binomial(2, 0.2)),
                "serious_accidents_100m":             int(rng.poisson(1.5)),
                "weighted_severity_score":            float(rng.exponential(8)),
                "accident_density_per_km":            float(rng.exponential(3)),
                "nearest_bike_lane_m":                float(rng.uniform(300, 2000)),
                "existing_lane_overlap_pct":          float(rng.uniform(0, 0.2)),
                "bike_lane_density_500m":             float(rng.uniform(0, 300)),
                "length_m":                           float(rng.uniform(100, 2000)),
                "num_vertices":                       int(rng.randint(2, 20)),
                "bearing_variance":                   float(rng.uniform(20, 200)),
                "intersections_count":                int(rng.randint(2, 8)),
                "crossings_within_100m":              int(rng.poisson(5)),
                "uncontrolled_crossings_within_100m": int(rng.poisson(3)),
                "nearest_crossing_m":                 float(rng.uniform(5, 60)),
            }
        X.append([row[f] for f in FEATURE_NAMES])
        y.append(1 if safe else 0)
    return X, y


# ── Main entry point ───────────────────────────────────────────────────────────

def seed():
    from app.db.supabase_client import get_supabase
    from app.ml.model_store import upload_model, activate_model

    supabase = get_supabase()

    # ── Step 1: Seed source data ───────────────────────────────────────────────
    logger.info("── Seeding accidents ─────────────────────────────────────────")
    seed_accidents(supabase)

    logger.info("── Seeding bike infrastructure ───────────────────────────────")
    seed_infrastructure(supabase)

    logger.info("── Seeding danger crossings ──────────────────────────────────")
    seed_crossings(supabase)

    # ── Step 2: Build training dataset ────────────────────────────────────────
    logger.info("── Building training dataset ─────────────────────────────────")
    X, y = None, None
    try:
        from app.ml.spatial_index import load_accident_index
        n = load_accident_index()
        logger.info(f"Spatial index loaded: {n} accidents")
        from app.ml.trainer import build_training_dataset
        X, y = build_training_dataset(supabase)
        logger.info(f"Real dataset: {len(X)} samples")
    except Exception as e:
        logger.warning(f"Real data unavailable ({e}) — using synthetic dataset")
        X, y = _synthetic_dataset(600)
        logger.info(f"Synthetic dataset: {len(X)} samples")

    # ── Step 3: Train model ────────────────────────────────────────────────────
    logger.info("── Training model ────────────────────────────────────────────")
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(
            n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42,
        )),
    ])
    pipeline.fit(X, y)

    cv = min(5, len(X) // 20)
    if cv >= 2:
        from sklearn.model_selection import cross_val_score
        scores = cross_val_score(pipeline, X, y, cv=cv, scoring="f1_weighted")
        acc = round(float(scores.mean()), 4)
    else:
        from sklearn.metrics import f1_score
        acc = round(float(f1_score(y, pipeline.predict(X), average="weighted", zero_division=0)), 4)

    metrics = {"accuracy": acc, "f1_score": acc, "train_samples": len(X)}

    os.makedirs("models", exist_ok=True)
    local_path = "models/model_v0.pkl"
    with open(local_path, "wb") as fh:
        pickle.dump({"pipeline": pipeline, "feature_names": FEATURE_NAMES}, fh)
    logger.info(f"Saved {local_path}")

    # ── Step 4: Upload and activate ────────────────────────────────────────────
    logger.info("── Uploading model ───────────────────────────────────────────")
    try:
        upload_model(local_path, "model_v0")
        logger.info("Uploaded model_v0 to Supabase Storage")
    except Exception as e:
        logger.warning(f"Storage upload failed ({e}) — activating from local path only")
        import app.ml.model_store as ms
        ms.BUCKET = "__local__"

    activate_model(supabase, "model_v0", metrics, notes="Initial seed model")
    logger.info(f"model_v0 activated. Metrics: {metrics}")


if __name__ == "__main__":
    seed()
