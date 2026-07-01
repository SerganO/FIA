import io
import csv
from typing import Annotated
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.db.supabase_client import get_supabase
from app.auth.deps import CurrentUser, require_permission

router = APIRouter()


@router.get("/export_dataset")
async def export_dataset(
    _user: Annotated[CurrentUser, Depends(require_permission("admin.ml"))],
):
    supabase = get_supabase()
    data = (
        supabase.table("accidents")
        .select("id, severity, accident_date, road_type, light_cond, weather, vehicles, source, created_at")
        .execute()
        .data
    )

    output = io.StringIO()
    if data:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=training_data_export.csv"},
    )
