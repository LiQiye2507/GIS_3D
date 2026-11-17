"""Nhận request tòa nhà, trả GeoJSON."""
from services import building_service
from utils.geojson import to_fc


def get_buildings():
    return to_fc(building_service.list_buildings())
