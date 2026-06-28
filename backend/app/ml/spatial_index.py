import numpy as np
from scipy.spatial import KDTree
import logging

logger = logging.getLogger(__name__)

_accident_tree: KDTree | None = None
_accident_data: list = []


def load_accident_index() -> int:
    """
    Pulls all accidents from Supabase into a KDTree for O(log n) radius queries.
    Called once at startup so predictions don't hit the DB per-request.
    """
    global _accident_tree, _accident_data
    from app.db.supabase_client import get_supabase

    supabase = get_supabase()
    rows = supabase.rpc("get_accidents_latlon").execute().data
    if not rows:
        logger.warning("No accident rows returned — spatial index is empty")
        _accident_tree = None
        _accident_data = []
        return 0

    coords = np.array([[r["lng"], r["lat"]] for r in rows])
    _accident_tree = KDTree(coords)
    _accident_data = rows
    logger.info(f"Spatial index built with {len(rows)} accidents")
    return len(rows)


def get_accidents_within_buffer(coords: list, radius_m: float) -> list:
    """
    Returns accident records within radius_m of any point on the LineString.
    Uses approximate degree-to-metre conversion (111km per degree at equator).
    """
    if _accident_tree is None or not _accident_data:
        return []

    radius_deg = radius_m / 111_000
    seen: set[str] = set()
    results: list = []

    for lng, lat in coords:
        indices = _accident_tree.query_ball_point([lng, lat], radius_deg)
        for i in indices:
            acc = _accident_data[i]
            if acc["id"] not in seen:
                seen.add(acc["id"])
                results.append(acc)

    return results
