"""Nhận request tiện ích lân cận, kiểm tra tọa độ / bán kính, trả GeoJSON."""
from fastapi import Query

from models.enums import AmenityCategory
from services import amenity_service
from utils.geojson import to_fc


def amenities_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(..., ge=50, le=500),
    category: AmenityCategory | None = None,
):
    return to_fc(amenity_service.nearby(lng, lat, radius, category))
