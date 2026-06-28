import pickle
import logging
from app.schemas.predict import PredictResponse, FeatureVector
from app.ml.feature_engineering import FEATURE_NAMES

logger = logging.getLogger(__name__)

_model = None
_model_version = "none"


def load_active_model() -> None:
    """Downloads and hot-swaps the currently active model from Supabase Storage."""
    global _model, _model_version
    from app.db.supabase_client import get_supabase
    from app.ml.model_store import download_model

    supabase = get_supabase()
    all_versions = supabase.rpc("get_ml_model_versions", {}).execute().data or []
    active = next((r for r in all_versions if r.get("is_active")), None)
    if not active:
        raise RuntimeError("No active model in ml_model_logs — run scripts/seed_model.py first")

    version = active["version"]
    local_path = download_model(active["storage_path"], version)

    with open(local_path, "rb") as f:
        payload = pickle.load(f)

    _model = payload["pipeline"]
    _model_version = version
    logger.info(f"Model loaded: {version}")


def predict_safety(features: dict) -> PredictResponse:
    if _model is None:
        raise RuntimeError("Model not loaded")

    X = [[features[f] for f in FEATURE_NAMES]]
    prob_safe = float(_model.predict_proba(X)[0][1])
    score = round(prob_safe * 100, 2)

    if score >= 70:
        risk_level = "high"
        rec = "ml.recommendation.high"
    elif score >= 45:
        risk_level = "medium"
        rec = "ml.recommendation.medium"
    else:
        risk_level = "low"
        rec = "ml.recommendation.low"

    return PredictResponse(
        safety_score=score,
        risk_level=risk_level,
        model_version=_model_version,
        features=FeatureVector(**features),
        recommendation=rec,
    )
