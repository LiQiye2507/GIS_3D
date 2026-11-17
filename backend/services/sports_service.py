"""Nghiệp vụ sân thể thao."""
from utils.db import fetch_all


def list_sports_fields() -> list[dict]:
    return fetch_all(
        """
        SELECT field_code, name, sport_type, area_m2, open_hours, verified,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM sports_fields
        ORDER BY field_code
        """
    )
