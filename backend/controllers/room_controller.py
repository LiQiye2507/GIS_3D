"""Nhận request phòng / tìm kiếm, kiểm tra tham số, trả response."""
from fastapi import HTTPException, Query

from services import building_service, room_service
from utils.geojson import to_fc


def get_rooms(
    building_code: str = "A",
    floor_number: int | None = Query(None, ge=1, le=20),
):
    if not building_service.building_exists(building_code):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tòa {building_code}")
    return to_fc(room_service.list_rooms(building_code, floor_number))


def search_rooms(q: str = Query(..., min_length=1, max_length=50)):
    return room_service.search_rooms(q)
