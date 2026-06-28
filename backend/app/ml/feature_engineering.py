import math
import json
import logging
import numpy as np
from app.ml.spatial_index import get_accidents_within_buffer

logger = logging.getLogger(__name__)

FEATURE_NAMES = [
    "accidents_within_50m",
    "accidents_within_100m",
    "accidents_within_500m",
    "fatal_accidents_100m",
    "serious_accidents_100m",
    "weighted_severity_score",
    "accident_density_per_km",
    "nearest_bike_lane_m",
    "existing_lane_overlap_pct",
    "bike_lane_density_500m",
    "length_m",
    "num_vertices",
    "bearing_variance",
    "intersections_count",
    # Danger crossings (from danger_crossings table via get_danger_crossing_features RPC)
    "crossings_within_100m",
    "uncontrolled_crossings_within_100m",
    "nearest_crossing_m",
]


def _haversine_m(p1: tuple, p2: tuple) -> float:
    """Metres between two (lng, lat) points."""
    R = 6_371_000
    lat1, lon1 = math.radians(p1[1]), math.radians(p1[0])
    lat2, lon2 = math.radians(p2[1]), math.radians(p2[0])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(max(0.0, a)))


def _segment_length_m(coords: list) -> float:
    return sum(_haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def _bearing(p1: tuple, p2: tuple) -> float:
    lat1, lat2 = math.radians(p1[1]), math.radians(p2[1])
    dlng = math.radians(p2[0] - p1[0])
    x = math.sin(dlng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return math.degrees(math.atan2(x, y))


def _bike_lane_features(geom_dict: dict) -> dict:
    """Query Supabase PostGIS for bike-lane proximity metrics. Falls back to defaults."""
    defaults = {
        "nearest_bike_lane_m": 9999.0,
        "existing_lane_overlap_pct": 0.0,
        "bike_lane_density_500m": 0.0,
        "intersections_count": 0,
    }
    try:
        from app.db.supabase_client import get_supabase
        supabase = get_supabase()
        rows = supabase.rpc("get_bike_lane_features", {"p_geom": geom_dict}).execute().data
        if rows and rows[0]:
            r = rows[0]
            return {
                "nearest_bike_lane_m":      float(r.get("nearest_m", 9999) or 9999),
                "existing_lane_overlap_pct": float(r.get("overlap_pct", 0) or 0),
                "bike_lane_density_500m":   float(r.get("density_500m", 0) or 0),
                "intersections_count":      int(r.get("intersections_count", 0) or 0),
            }
    except Exception as e:
        logger.warning(f"Bike-lane RPC failed, using defaults: {e}")
    return defaults


def _crossing_features(geom_dict: dict) -> dict:
    """Query PostGIS for danger-crossing proximity metrics. Falls back to defaults."""
    defaults = {
        "crossings_within_100m":              0,
        "uncontrolled_crossings_within_100m": 0,
        "nearest_crossing_m":                 9999.0,
    }
    try:
        from app.db.supabase_client import get_supabase
        supabase = get_supabase()
        rows = supabase.rpc("get_danger_crossing_features", {"p_geom": geom_dict}).execute().data
        if rows and rows[0]:
            r = rows[0]
            return {
                "crossings_within_100m":              int(r.get("crossings_within_100m", 0) or 0),
                "uncontrolled_crossings_within_100m": int(r.get("uncontrolled_crossings_within_100m", 0) or 0),
                "nearest_crossing_m":                 float(r.get("nearest_crossing_m", 9999) or 9999),
            }
    except Exception as e:
        logger.warning(f"Crossing features RPC failed, using defaults: {e}")
    return defaults


def extract_features(geometry: dict) -> dict:
    """
    Extract the full ML feature vector for a GeoJSON LineString.
    geometry: dict with keys 'type' and 'coordinates'.
    """
    coords = geometry["coordinates"]

    # ── Geometry ──────────────────────────────────────────────────────────────
    length_m = _segment_length_m(coords)
    num_vertices = len(coords)
    bearings = [_bearing(coords[i], coords[i + 1]) for i in range(len(coords) - 1)]
    bearing_variance = float(np.var(bearings)) if len(bearings) > 1 else 0.0

    # ── Accident proximity (from in-memory KDTree) ────────────────────────────
    acc_50m  = get_accidents_within_buffer(coords, 50)
    acc_100m = get_accidents_within_buffer(coords, 100)
    acc_500m = get_accidents_within_buffer(coords, 500)

    fatal_100m   = sum(1 for a in acc_100m if a.get("severity") == 3)
    serious_100m = sum(1 for a in acc_100m if a.get("severity") == 2)
    w_sev        = float(sum(a.get("severity", 1) ** 2 for a in acc_100m))
    density      = len(acc_100m) / max(0.001, length_m / 1000.0)

    # ── Bike lane proximity (PostGIS RPC) ─────────────────────────────────────
    bl = _bike_lane_features(geometry)

    # ── Danger crossing proximity (PostGIS RPC) ───────────────────────────────
    cr = _crossing_features(geometry)

    return {
        "accidents_within_50m":               len(acc_50m),
        "accidents_within_100m":              len(acc_100m),
        "accidents_within_500m":              len(acc_500m),
        "fatal_accidents_100m":               fatal_100m,
        "serious_accidents_100m":             serious_100m,
        "weighted_severity_score":            w_sev,
        "accident_density_per_km":            density,
        "nearest_bike_lane_m":                bl["nearest_bike_lane_m"],
        "existing_lane_overlap_pct":          bl["existing_lane_overlap_pct"],
        "bike_lane_density_500m":             bl["bike_lane_density_500m"],
        "length_m":                           length_m,
        "num_vertices":                       num_vertices,
        "bearing_variance":                   bearing_variance,
        "intersections_count":                bl["intersections_count"],
        "crossings_within_100m":              cr["crossings_within_100m"],
        "uncontrolled_crossings_within_100m": cr["uncontrolled_crossings_within_100m"],
        "nearest_crossing_m":                 cr["nearest_crossing_m"],
    }
