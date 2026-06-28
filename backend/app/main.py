import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import predict, retrain, export

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

_status = {"model_loaded": False, "spatial_index_loaded": False, "accident_count": 0}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    try:
        from app.ml.spatial_index import load_accident_index
        count = load_accident_index()
        _status["spatial_index_loaded"] = True
        _status["accident_count"] = count
        logger.info(f"Spatial index ready ({count} accidents)")
    except Exception as e:
        logger.warning(f"Spatial index skipped: {e}")

    try:
        from app.ml.predictor import load_active_model
        load_active_model()
        _status["model_loaded"] = True
        logger.info("ML model ready")
    except Exception as e:
        logger.warning(f"ML model skipped (run seed_model.py): {e}")

    yield
    # ── Shutdown (nothing to clean up) ───────────────────────────────────────


app = FastAPI(title="UrbanFlow ML API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Vercel URL after demo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router, prefix="/api")
app.include_router(retrain.router, prefix="/api")
app.include_router(export.router,  prefix="/api")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded":          _status["model_loaded"],
        "spatial_index_loaded":  _status["spatial_index_loaded"],
        "accident_count":        _status["accident_count"],
    }
