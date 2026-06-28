from fastapi import APIRouter, HTTPException
from app.schemas.predict import PredictRequest, PredictResponse
from app.ml.predictor import predict_safety
from app.ml.feature_engineering import extract_features

router = APIRouter()


@router.post("/predict_safety", response_model=PredictResponse)
async def predict_safety_endpoint(request: PredictRequest):
    try:
        features = extract_features(request.geometry.model_dump())
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Feature extraction failed: {e}")
    try:
        return predict_safety(features)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
