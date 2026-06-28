import os
import logging

logger = logging.getLogger(__name__)
BUCKET = "ml-models"


def upload_model(local_path: str, version_tag: str) -> str:
    """Upload .pkl to Supabase Storage and keep a local copy.

    Uses a direct httpx request instead of the supabase-py storage client.
    supabase-py v2 does not always forward the service_role JWT in the
    Authorization header for storage operations, causing RLS failures.
    A raw POST with explicit 'Authorization: Bearer <service_key>' and
    'apikey: <service_key>' headers is recognized correctly by the
    Supabase Storage API.
    """
    import shutil
    import httpx

    # Always keep a local copy under models/<version>.pkl.
    os.makedirs("models", exist_ok=True)
    local_dest = f"models/{version_tag}.pkl"
    if os.path.abspath(local_path) != os.path.abspath(local_dest):
        shutil.copy2(local_path, local_dest)
    logger.info(f"Local copy: {local_dest}")

    supabase_url = os.environ["SUPABASE_URL"]
    service_key  = os.environ["SUPABASE_SERVICE_KEY"]
    storage_url  = f"{supabase_url}/storage/v1/object/{BUCKET}/{version_tag}.pkl"

    with open(local_dest, "rb") as f:
        data = f.read()

    resp = httpx.post(
        storage_url,
        content=data,
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey":         service_key,
            "Content-Type":   "application/octet-stream",
            "x-upsert":       "true",
        },
    )
    if resp.status_code not in (200, 201):
        raise Exception(resp.json())

    logger.info(f"Uploaded {version_tag}.pkl to Supabase Storage bucket '{BUCKET}'")
    return f"{version_tag}.pkl"


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
    """Deactivate old active model, upsert new version as active in ml_model_logs.

    Uses a SECURITY DEFINER RPC to bypass RLS — direct table INSERT fails when
    supabase-py v2 doesn't forward the service_role JWT claim correctly.
    """
    from app.ml.feature_engineering import FEATURE_NAMES

    supabase.rpc("upsert_ml_model_log", {
        "p_version":       version_tag,
        "p_storage_path":  f"{version_tag}.pkl",
        "p_accuracy":      metrics.get("accuracy"),
        "p_f1_score":      metrics.get("f1_score"),
        "p_train_samples": metrics.get("train_samples"),
        "p_feature_names": FEATURE_NAMES,
        "p_notes":         notes,
    }).execute()

    logger.info(f"Activated model: {version_tag}")
