"""Nhận request chỉ đường, kiểm tra điểm xuất phát / mã phòng, trả tuyến GeoJSON."""
from fastapi import HTTPException, Query

from services import room_service, route_service


def route_to_room(
    start_lng: float = Query(..., ge=-180, le=180),
    start_lat: float = Query(..., ge=-90, le=90),
    end_room_code: str = Query(..., min_length=1, max_length=30),
):
    room_code = room_service.find_room_code(end_room_code)
    if not room_code:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy phòng {end_room_code}")
    route = route_service.shortest_path(start_lng, start_lat, room_code)
    if route is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy đường đi")
    return route
