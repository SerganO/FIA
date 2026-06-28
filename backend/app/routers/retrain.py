import uuid
import threading
import logging
from fastapi import APIRouter, HTTPException
from app.schemas.retrain import RetrainRequest, RetrainResponse, ModelVersionsResponse, ModelVersion
from app.db.supabase_client import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)
_lock = threading.Lock()


@router.post("/retrain", response_model=RetrainResponse)
async def retrain_endpoint(request: RetrainRequest):
    if not _lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Retraining already in progress")

    job_id = str(uuid.uuid4())

    def _job():
        try:
            from app.ml.trainer import train_model
            from app.ml.model_store import upload_model, activate_model
            from app.ml.predictor import load_active_model

            supabase = get_supabase()
            logs = supabase.table("ml_model_logs").select("version").execute().data
            version_tag = f"model_v{len(logs) + 1}"

            result = train_model(supabase, version_tag)
            upload_model(result["model_path"], version_tag)
            activate_model(supabase, version_tag, result["metrics"], request.notes)
            load_active_model()
            logger.info(f"Retrain complete: {version_tag} {result['metrics']}")
        except Exception as e:
            logger.error(f"Retrain failed: {e}")
        finally:
            _lock.release()

    threading.Thread(target=_job, daemon=True).start()

    return RetrainResponse(
        job_id=job_id,
        status="started",
        message="Retraining initiated. Poll GET /api/model_versions to check completion.",
    )


@router.get("/model_versions", response_model=ModelVersionsResponse)
async def get_model_versions():
    supabase = get_supabase()
    data = (
        supabase.table("ml_model_logs")
        .select("version, is_active, accuracy, f1_score, train_samples, created_at")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return ModelVersionsResponse(versions=[ModelVersion(**v) for v in data])


@router.post("/activate_model/{version}")
async def activate_model_endpoint(version: str):
    supabase = get_supabase()
    existing = supabase.table("ml_model_logs").select("id").eq("version", version).execute().data
    if not existing:
        raise HTTPException(status_code=404, detail=f"Version '{version}' not found")

    from app.ml.model_store import activate_model, download_model
    from app.ml.predictor import load_active_model

    # Grab storage_path for this version
    row = supabase.table("ml_model_logs").select("storage_path").eq("version", version).execute().data[0]
    download_model(row["storage_path"], version)
    activate_model(supabase, version, {})
    load_active_model()
    return {"status": "ok", "activated": version}
