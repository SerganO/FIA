from pydantic import BaseModel
from typing import Optional


class RetrainRequest(BaseModel):
    notes: Optional[str] = None


class RetrainResponse(BaseModel):
    job_id: str
    status: str
    message: str


class ModelVersion(BaseModel):
    version: str
    is_active: bool
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    train_samples: Optional[int] = None
    created_at: str


class ModelVersionsResponse(BaseModel):
    versions: list[ModelVersion]
