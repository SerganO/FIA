"""
Train and upload model_v0 to Supabase Storage.
Run ONCE before demo, from the backend/ directory:

  cd backend
  python -m scripts.seed_model

Requirements: .env must exist with SUPABASE_URL and SUPABASE_SERVICE_KEY.
Falls back to synthetic training data if the DB has no bike lane rows yet.
"""
import os
import sys
import pickle
import logging
import numpy as np

sys.path.insert(0, os.path.abspath("."))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

from app.ml.feature_engineering import FEATURE_NAMES


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
                "accidents_within_50m":      rng.poisson(0.2),
                "accidents_within_100m":     rng.poisson(0.5),
                "accidents_within_500m":     rng.poisson(2),
                "fatal_accidents_100m":      0,
                "serious_accidents_100m":    rng.binomial(1, 0.05),
                "weighted_severity_score":   float(rng.exponential(0.5)),
                "accident_density_per_km":   float(rng.exponential(0.3)),
                "nearest_bike_lane_m":       float(rng.uniform(0, 200)),
                "existing_lane_overlap_pct": float(rng.uniform(0.3, 1.0)),
                "bike_lane_density_500m":    float(rng.uniform(200, 2000)),
                "length_m":                  float(rng.uniform(200, 1500)),
                "num_vertices":              int(rng.randint(2, 15)),
                "bearing_variance":          float(rng.uniform(0, 50)),
                "intersections_count":       int(rng.randint(0, 3)),
            }
        else:
            row = {
                "accidents_within_50m":      rng.poisson(2),
                "accidents_within_100m":     rng.poisson(5),
                "accidents_within_500m":     rng.poisson(15),
                "fatal_accidents_100m":      int(rng.binomial(2, 0.2)),
                "serious_accidents_100m":    int(rng.poisson(1.5)),
                "weighted_severity_score":   float(rng.exponential(8)),
                "accident_density_per_km":   float(rng.exponential(3)),
                "nearest_bike_lane_m":       float(rng.uniform(300, 2000)),
                "existing_lane_overlap_pct": float(rng.uniform(0, 0.2)),
                "bike_lane_density_500m":    float(rng.uniform(0, 300)),
                "length_m":                  float(rng.uniform(100, 2000)),
                "num_vertices":              int(rng.randint(2, 20)),
                "bearing_variance":          float(rng.uniform(20, 200)),
                "intersections_count":       int(rng.randint(2, 8)),
            }
        X.append([row[f] for f in FEATURE_NAMES])
        y.append(1 if safe else 0)
    return X, y


def seed():
    from app.db.supabase_client import get_supabase
    from app.ml.model_store import upload_model, activate_model

    supabase = get_supabase()

    # Try real data first
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

    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import cross_val_score

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(
            n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42,
        )),
    ])
    pipeline.fit(X, y)

    cv = min(5, len(X) // 20)
    if cv >= 2:
        scores = cross_val_score(pipeline, X, y, cv=cv, scoring="f1_weighted")
        acc = round(float(scores.mean()), 4)
    else:
        from sklearn.metrics import f1_score
        acc = round(float(f1_score(y, pipeline.predict(X), average="weighted", zero_division=0)), 4)

    metrics = {"accuracy": acc, "f1_score": acc, "train_samples": len(X)}

    os.makedirs("models", exist_ok=True)
    local_path = "models/model_v0.pkl"
    with open(local_path, "wb") as f:
        pickle.dump({"pipeline": pipeline, "feature_names": FEATURE_NAMES}, f)
    logger.info(f"Saved {local_path}")

    try:
        upload_model(local_path, "model_v0")
        logger.info("Uploaded model_v0 to Supabase Storage")
    except Exception as e:
        logger.warning(f"Storage upload failed ({e}) — activating from local path only")
        # Patch storage_path so the DB row still points somewhere valid
        import app.ml.model_store as ms
        ms.BUCKET = "__local__"

    activate_model(supabase, "model_v0", metrics, notes="Initial seed model")
    logger.info(f"model_v0 activated. Metrics: {metrics}")


if __name__ == "__main__":
    seed()
