"""Nhận request sân thể thao, trả GeoJSON."""
from services import sports_service
from utils.geojson import to_fc


def get_sports_fields():
    return to_fc(sports_service.list_sports_fields())
