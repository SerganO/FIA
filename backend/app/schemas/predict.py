from pydantic import BaseModel, field_validator
from typing import List, Tuple, Optional


class GeoJSONLineString(BaseModel):
    type: str
    coordinates: List[Tuple[float, float]]

    @field_validator("type")
    @classmethod
    def must_be_linestring(cls, v: str) -> str:
        if v != "LineString":
            raise ValueError("Only LineString geometry is supported")
        return v

    @field_validator("coordinates")
    @classmethod
    def min_two_points(cls, v: list) -> list:
        if len(v) < 2:
            raise ValueError("LineString requires at least 2 coordinates")
        return v


class PredictRequest(BaseModel):
    geometry: GeoJSONLineString
    metadata: Optional[dict] = {}


class FeatureVector(BaseModel):
    accidents_within_50m: int
    accidents_within_100m: int
    accidents_within_500m: int
    fatal_accidents_100m: int
    serious_accidents_100m: int
    weighted_severity_score: float
    accident_density_per_km: float
    nearest_bike_lane_m: float
    existing_lane_overlap_pct: float
    bike_lane_density_500m: float
    length_m: float
    num_vertices: int
    bearing_variance: float
    intersections_count: int


class PredictResponse(BaseModel):
    safety_score: float
    risk_level: str
    model_version: str
    features: FeatureVector
    recommendation: str
