import os
import logging

logger = logging.getLogger(__name__)
BUCKET = "ml-models"


def upload_model(local_path: str, version_tag: str) -> str:
    """Upload .pkl to Supabase Storage bucket. Returns storage path."""
    from app.db.supabase_client import get_supabase
    storage_path = f"{version_tag}.pkl"
    with open(local_path, "rb") as f:
        data = f.read()
    get_supabase().storage.from_(BUCKET).upload(
        path=storage_path,
        file=data,
        file_options={"content-type": "application/octet-stream", "upsert": "true"},
    )
    logger.info(f"Uploaded {storage_path} to bucket '{BUCKET}'")
    return storage_path


def download_model(storage_path: str, version_tag: str) -> str:
    """Download .pkl from Supabase Storage. Caches locally. Returns local path."""
    local_path = f"models/{version_tag}.pkl"
    if os.path.exists(local_path):
        logger.info(f"Cached model found: {local_path}")
        return local_path

    os.makedirs("models", exist_ok=True)
    from app.db.supabase_client import get_supabase
    data = get_supabase().storage.from_(BUCKET).download(storage_path)
    with open(local_path, "wb") as f:
        f.write(data)
    logger.info(f"Downloaded model to {local_path}")
    return local_path


def activate_model(supabase, version_tag: str, metrics: dict, notes: str | None = None) -> None:
    """Deactivate old active model, upsert new version as active in ml_model_logs."""
    from app.ml.feature_engineering import FEATURE_NAMES

    supabase.table("ml_model_logs").update({"is_active": False}).eq("is_active", True).execute()

    row = {
        "version":       version_tag,
        "storage_path":  f"{version_tag}.pkl",
        "accuracy":      metrics.get("accuracy"),
        "f1_score":      metrics.get("f1_score"),
        "train_samples": metrics.get("train_samples"),
        "feature_names": FEATURE_NAMES,
        "is_active":     True,
        "notes":         notes,
    }
    existing = supabase.table("ml_model_logs").select("id").eq("version", version_tag).execute().data
    if existing:
        supabase.table("ml_model_logs").update(row).eq("version", version_tag).execute()
    else:
        supabase.table("ml_model_logs").insert(row).execute()

    logger.info(f"Activated model: {version_tag}")
