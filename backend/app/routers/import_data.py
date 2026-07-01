import csv
import io
import json
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.db.supabase_client import get_supabase
from app.auth.deps import CurrentUser, require_permission

router = APIRouter()

BATCH = 200


# ── Helpers ────────────────────────────────────────────────────────────────────

def _decode(content: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            return content.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    raise HTTPException(status_code=400, detail="Cannot decode file — try UTF-8 encoding")


def _severity(s1: str, s2: str) -> int:
    combined = f"{s1} {s2}".lower()
    if "загинув" in combined or "смерт" in combined:
        return 3
    if "тяжк" in combined:
        return 2
    return 1


def _rpc_insert(rpc_name: str, rows: list) -> tuple[int, int]:
    """Call a SECURITY DEFINER RPC function that bypasses RLS."""
    sb = get_supabase()
    total_inserted = 0
    total_skipped = 0
    for i in range(0, len(rows), BATCH):
        result = sb.rpc(rpc_name, {"rows": rows[i : i + BATCH]}).execute()
        data = result.data or {}
        total_inserted += data.get("inserted", 0)
        total_skipped  += data.get("skipped", 0)
    return total_inserted, total_skipped


# ── Accidents (CSV) ────────────────────────────────────────────────────────────

@router.post("/import/accidents")
async def import_accidents(
    _user: Annotated[CurrentUser, Depends(require_permission("admin.import"))],
    file: UploadFile = File(...),
):
    """
    Accept a semicolon-delimited CSV with columns:
      accidentDate, latitude, longitude,
      injuryStatusParticipant1, injuryStatusParticipant2,
      totalParticipantsAmount, streetType, streetName
    Returns { inserted, skipped }.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Expected a .csv file")

    text = _decode(await file.read())
    reader = csv.DictReader(io.StringIO(text), delimiter=";")

    rows: list[dict] = []
    skipped = 0

    for row in reader:
        try:
            lat = float(row["latitude"])
            lng = float(row["longitude"])
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                skipped += 1
                continue

            street = " ".join(
                filter(None, [row.get("streetType", ""), row.get("streetName", "")])
            ).strip() or None

            vehicles_raw = row.get("totalParticipantsAmount", "1")
            vehicles = int(vehicles_raw) if vehicles_raw and vehicles_raw.isdigit() else 1

            rows.append({
                "location":      f"SRID=4326;POINT({lng} {lat})",
                "severity":      _severity(
                                    row.get("injuryStatusParticipant1", ""),
                                    row.get("injuryStatusParticipant2", ""),
                                 ),
                "accident_date": row.get("accidentDate") or None,
                "road_type":     street,
                "vehicles":      vehicles,
                "source":        "import",
                "is_actual":     True,
            })
        except (ValueError, KeyError):
            skipped += 1

    if not rows:
        return {"inserted": 0, "skipped": skipped}

    inserted, rpc_skipped = _rpc_insert("import_accidents_batch", rows)
    return {"inserted": inserted, "skipped": skipped + rpc_skipped}


# ── GeoJSON helpers ────────────────────────────────────────────────────────────

def _parse_osm_id(raw: str) -> int | None:
    """Parse OSM id from '@id' value like 'way/12345' or 'node/12345'."""
    if "/" in raw:
        try:
            return int(raw.split("/")[-1])
        except ValueError:
            pass
    return None


def _parse_lane(feat: dict) -> dict | None:
    """Convert a LineString GeoJSON feature to a bike_lanes row dict, or None to skip."""
    geom = feat.get("geometry") or {}
    if geom.get("type") != "LineString":
        return None
    coords = geom.get("coordinates", [])
    if len(coords) < 2:
        return None
    coord_str = ", ".join(f"{c[0]} {c[1]}" for c in coords)
    p = feat.get("properties") or {}
    return {
        "geom":      f"SRID=4326;LINESTRING({coord_str})",
        "name":      p.get("name:en") or p.get("name") or None,
        "lane_type": p.get("cycleway") or p.get("highway") or None,
        "surface":   p.get("surface") or None,
        "osm_id":    _parse_osm_id(p.get("@id", "")),
        "is_actual": True,
    }


def _parse_parking(feat: dict) -> dict | None:
    """Convert a bicycle_parking Point feature to a bike_parking row dict, or None to skip."""
    p = feat.get("properties") or {}
    if p.get("amenity") != "bicycle_parking":
        return None
    geom = feat.get("geometry") or {}
    if geom.get("type") != "Point":
        return None
    coords = geom.get("coordinates", [])
    if len(coords) < 2:
        return None
    lng, lat = coords[0], coords[1]

    cap_raw = p.get("capacity", "")
    capacity = int(cap_raw) if cap_raw and cap_raw.isdigit() else None

    return {
        "location":     f"SRID=4326;POINT({lng} {lat})",
        "capacity":     capacity,
        "covered":      p.get("covered"),      # SQL function converts "yes"/"no" → boolean
        "access":       p.get("access") or None,
        "parking_type": p.get("bicycle_parking") or None,
        "name":         p.get("name:en") or p.get("name") or None,
        "osm_id":       _parse_osm_id(p.get("@id", "")),
        "is_actual":    True,
    }


def _parse_rental(feat: dict) -> dict | None:
    """Convert a bicycle_rental Point feature to a bike_rental row dict, or None to skip."""
    p = feat.get("properties") or {}
    if p.get("amenity") != "bicycle_rental":
        return None
    geom = feat.get("geometry") or {}
    if geom.get("type") != "Point":
        return None
    coords = geom.get("coordinates", [])
    if len(coords) < 2:
        return None
    lng, lat = coords[0], coords[1]

    cap_raw = p.get("capacity", "")
    capacity = int(cap_raw) if cap_raw and cap_raw.isdigit() else None

    return {
        "location":     f"SRID=4326;POINT({lng} {lat})",
        "capacity":     capacity,
        "name":         p.get("name:en") or p.get("name") or None,
        "network":      p.get("network") or None,
        "operator":     p.get("operator") or None,
        "opening_hours":p.get("opening_hours") or None,
        "website":      p.get("website") or None,
        "phone":        p.get("phone") or p.get("phone:UA") or None,
        "rental_type":  p.get("bicycle_rental") or None,
        "access":       p.get("access") or None,
        "osm_id":       _parse_osm_id(p.get("@id", "")),
        "is_actual":    True,
    }


def _parse_crossing(feat: dict) -> dict | None:
    """Convert a crossing/traffic_signals Point feature to a danger_crossings row, or None to skip."""
    p = feat.get("properties") or {}
    highway = p.get("highway", "")
    if highway not in ("crossing", "traffic_signals"):
        return None
    geom = feat.get("geometry") or {}
    if geom.get("type") != "Point":
        return None
    coords = geom.get("coordinates", [])
    if len(coords) < 2:
        return None
    lng, lat = coords[0], coords[1]

    crossing_val = p.get("crossing") or None
    has_signals = (
        highway == "traffic_signals"
        or p.get("crossing:signals") == "yes"
        or crossing_val == "signalised"
    )
    has_markings = p.get("crossing:markings") in ("zebra", "yes")

    return {
        "location":      f"SRID=4326;POINT({lng} {lat})",
        "osm_id":        _parse_osm_id(p.get("@id", "")),
        "highway":       highway,
        "crossing_type": crossing_val,
        "has_signals":   has_signals,
        "has_markings":  has_markings,
        "is_actual":     True,
    }


# ── Cycleway GeoJSON import (lanes + parking from one file) ───────────────────

@router.post("/import/bike_lanes")
async def import_bike_lanes(
    _user: Annotated[CurrentUser, Depends(require_permission("admin.import"))],
    file: UploadFile = File(...),
):
    """
    Accept a GeoJSON FeatureCollection (Overpass/OSM format).

    - LineString features → bike_lanes (deduplicated by osm_id)
    - Point features with amenity=bicycle_parking → bike_parking (deduplicated by osm_id)
    - All other features are silently skipped.

    Returns { inserted, skipped, bike_lanes: {...}, bike_parking: {...} }.
    """
    if not file.filename.lower().endswith((".geojson", ".json")):
        raise HTTPException(status_code=400, detail="Expected a .geojson or .json file")

    try:
        geojson = json.loads((await file.read()).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON / GeoJSON")

    lane_rows:    list[dict] = []
    parking_rows: list[dict] = []
    rental_rows:  list[dict] = []
    parse_errors = 0

    for feat in geojson.get("features", []):
        try:
            lane = _parse_lane(feat)
            if lane is not None:
                lane_rows.append(lane)
                continue
            parking = _parse_parking(feat)
            if parking is not None:
                parking_rows.append(parking)
                continue
            rental = _parse_rental(feat)
            if rental is not None:
                rental_rows.append(rental)
            # else: unknown Point type — silently skip
        except Exception:
            parse_errors += 1

    lanes_ins = lanes_skip = parking_ins = parking_skip = rental_ins = rental_skip = 0

    if lane_rows:
        lanes_ins, lanes_skip = _rpc_insert("import_bike_lanes_batch", lane_rows)
    if parking_rows:
        parking_ins, parking_skip = _rpc_insert("import_bike_parking_batch", parking_rows)
    if rental_rows:
        rental_ins, rental_skip = _rpc_insert("import_bike_rental_batch", rental_rows)

    return {
        "inserted":    lanes_ins + parking_ins + rental_ins,
        "skipped":     lanes_skip + parking_skip + rental_skip + parse_errors,
        "bike_lanes":  {"inserted": lanes_ins,    "skipped": lanes_skip},
        "bike_parking":{"inserted": parking_ins,  "skipped": parking_skip},
        "bike_rental": {"inserted": rental_ins,   "skipped": rental_skip},
    }


# ── Danger crossings GeoJSON import ───────────────────────────────────────────

@router.post("/import/crossings")
async def import_crossings(
    _user: Annotated[CurrentUser, Depends(require_permission("admin.import"))],
    file: UploadFile = File(...),
):
    """
    Accept a GeoJSON FeatureCollection (Overpass/OSM format).

    - Point features with highway=crossing or highway=traffic_signals → danger_crossings
    - All other features are silently skipped.

    Returns { inserted, skipped }.
    """
    if not file.filename.lower().endswith((".geojson", ".json")):
        raise HTTPException(status_code=400, detail="Expected a .geojson or .json file")

    try:
        geojson = json.loads((await file.read()).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON / GeoJSON")

    rows: list[dict] = []
    parse_errors = 0

    for feat in geojson.get("features", []):
        try:
            crossing = _parse_crossing(feat)
            if crossing is not None:
                rows.append(crossing)
        except Exception:
            parse_errors += 1

    if not rows:
        return {"inserted": 0, "skipped": parse_errors}

    inserted, rpc_skipped = _rpc_insert("import_danger_crossings_batch", rows)
    return {"inserted": inserted, "skipped": rpc_skipped + parse_errors}
