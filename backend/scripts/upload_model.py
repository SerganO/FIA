"""
Upload an already-trained model to Supabase Storage without reseeding or retraining.

Usage (from the backend/ directory):

    python -m scripts.upload_model             # auto-discovers latest models/model_vN.pkl
    python -m scripts.upload_model model_v0    # upload a specific version

The model must already exist in models/<version>.pkl (produced by seed_model.py
or a retrain run).  The script uploads the file to Supabase Storage and
re-activates the version in ml_model_logs.
"""
import glob
import logging
import os
import pickle
import sys

sys.path.insert(0, os.path.abspath("."))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def upload(version_tag: str | None = None) -> None:
    from app.db.supabase_client import get_supabase
    from app.ml.model_store import upload_model, activate_model

    # ── Resolve model file ────────────────────────────────────────────────────
    if version_tag is None:
        files = sorted(glob.glob("models/model_v*.pkl"))
        if not files:
            logger.error("No model files found in models/. Run seed_model.py first.")
            sys.exit(1)
        local_path  = files[-1]
        version_tag = os.path.splitext(os.path.basename(local_path))[0]
        logger.info(f"Auto-discovered: {local_path} → version '{version_tag}'")
    else:
        local_path = f"models/{version_tag}.pkl"
        if not os.path.exists(local_path):
            logger.error(f"File not found: {local_path}")
            sys.exit(1)

    # ── Read metrics from the pkl so the DB record stays accurate ─────────────
    with open(local_path, "rb") as fh:
        artefact = pickle.load(fh)
    # The pkl produced by seed_model / trainer stores {"pipeline": ..., "feature_names": ...}.
    # Metrics are not embedded — they live in ml_model_logs.  We pass empty metrics
    # here so existing DB values are preserved via the ON CONFLICT DO UPDATE path.
    metrics: dict = {}

    # ── Upload ────────────────────────────────────────────────────────────────
    logger.info(f"Uploading {local_path} to Supabase Storage…")
    try:
        upload_model(local_path, version_tag)
    except Exception as exc:
        logger.error(f"Storage upload failed: {exc}")
        sys.exit(1)

    # ── Activate in DB ────────────────────────────────────────────────────────
    logger.info(f"Activating '{version_tag}' in ml_model_logs…")
    supabase = get_supabase()
    activate_model(supabase, version_tag, metrics, notes="Re-uploaded via upload_model.py")
    logger.info("Done.")


if __name__ == "__main__":
    version = sys.argv[1] if len(sys.argv) > 1 else None
    upload(version)
