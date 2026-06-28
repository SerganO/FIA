import os
import json
import pickle
import logging
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, f1_score
from app.ml.feature_engineering import FEATURE_NAMES, extract_features

logger = logging.getLogger(__name__)


def _parse_geom(raw) -> dict | None:
    """Normalise a geometry value from Supabase into a GeoJSON dict."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
        # WKB hex — use shapely to convert
        try:
            from shapely import wkb
            from shapely.geometry import mapping
            geom = wkb.loads(bytes.fromhex(raw))
            return mapping(geom)
        except Exception:
            pass
    return None


def build_training_dataset(supabase) -> tuple[list, list]:
    """
    Build a labelled feature matrix from existing bike lanes + the accident index.
    Label: 1 (safe)  = 0 accidents within 100 m
    Label: 0 (risky) = ≥2 accidents within 100 m
    Rows with exactly 1 accident are discarded (ambiguous).
    """
    from app.ml.spatial_index import load_accident_index
    load_accident_index()

    lanes = supabase.table("bike_lanes").select("id, geom").execute().data
    if not lanes:
        raise ValueError("bike_lanes table is empty — import data or run seed_sample_data()")

    X, y = [], []
    for lane in lanes:
        geom = _parse_geom(lane.get("geom"))
        if geom is None:
            logger.warning(f"Skipping lane {lane.get('id')} — unparseable geometry")
            continue
        try:
            feats = extract_features(geom)
        except Exception as e:
            logger.warning(f"Skipping lane {lane.get('id')}: {e}")
            continue

        n = feats["accidents_within_100m"]
        if n == 1:
            continue
        X.append([feats[f] for f in FEATURE_NAMES])
        y.append(1 if n == 0 else 0)

    if len(X) < 10:
        raise ValueError(f"Only {len(X)} usable training samples — need at least 10")
    return X, y


def train_model(supabase, version_tag: str) -> dict:
    logger.info(f"Training {version_tag}…")
    X, y = build_training_dataset(supabase)
    logger.info(f"Dataset: {len(X)} samples ({sum(y)} safe / {len(y) - sum(y)} risky)")

    stratify = y if min(sum(y), len(y) - sum(y)) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", GradientBoostingClassifier(
            n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42,
        )),
    ])
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    metrics = {
        "accuracy":      round(float(accuracy_score(y_test, y_pred)), 4),
        "f1_score":      round(float(f1_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
        "train_samples": len(X_train),
    }
    logger.info(f"Metrics: {metrics}")

    os.makedirs("models", exist_ok=True)
    model_path = f"models/{version_tag}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({"pipeline": pipeline, "feature_names": FEATURE_NAMES}, f)

    return {"model_path": model_path, "metrics": metrics}
