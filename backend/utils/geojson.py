"""Chuyển các dòng có cột `geometry` (GeoJSON) thành FeatureCollection."""


def to_fc(rows: list[dict]) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": r["geometry"],
                "properties": {k: v for k, v in r.items() if k != "geometry"},
            }
            for r in rows
        ],
    }
