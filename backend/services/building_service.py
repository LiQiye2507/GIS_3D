"""Nghiệp vụ tòa nhà."""
from utils.db import fetch_all


def list_buildings() -> list[dict]:
    return fetch_all(
        """
        SELECT building_code, name, total_floors, base_elevation, height_m,
               glb_model_url, anchor_lng, anchor_lat, model_rotation, description,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM buildings
        ORDER BY building_code
        """
    )


def building_exists(building_code: str) -> bool:
    return bool(fetch_all("SELECT 1 FROM buildings WHERE building_code = %s", (building_code,)))
