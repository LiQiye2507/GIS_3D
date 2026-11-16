import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import fetch_all  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


def test_buildings_collection():
    res = client.get("/api/buildings")
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 6
    toa_a = next(
        (f for f in body["features"] if f["properties"]["building_code"] == "A"),
        None,
    )
    assert toa_a is not None
    assert toa_a["properties"]["anchor_lng"] is not None


def test_rooms_floor_3_heights():
    res = client.get("/api/rooms", params={"building_code": "A", "floor_number": 3})
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) >= 1
    for feat in body["features"]:
        props = feat["properties"]
        if props["room_type"] != "Corridor":
            assert props["base_height"] == 7.6
            assert props["extrude_height"] == 11.1


def test_rooms_unknown_building_returns_404():
    res = client.get("/api/rooms", params={"building_code": "ZZZ"})
    assert res.status_code == 404
    assert "detail" in res.json()


def test_search_room_a305_within_building_a():
    res = client.get("/api/search", params={"q": "A305"})
    assert res.status_code == 200
    items = res.json()
    match = next((r for r in items if r["room_code"] == "A.305"), None)
    assert match is not None
    assert match["floor_number"] == 3
    check = fetch_all(
        "SELECT ST_Within(ST_SetSRID(ST_MakePoint(%s, %s), 4326), geom) AS ok FROM buildings WHERE building_code = 'A'",
        (match["lng"], match["lat"]),
    )
    assert check and check[0]["ok"] is True


def test_amenities_nearby_within_radius_and_sorted():
    res = client.get("/api/amenities/nearby", params={"lat": 10.8701, "lng": 106.8030, "radius": 150})
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    distances = [f["properties"]["distance_m"] for f in body["features"]]
    assert all(d <= 150 for d in distances)
    assert distances == sorted(distances)


def test_amenities_nearby_invalid_radius_returns_422():
    assert client.get("/api/amenities/nearby", params={"lat": 10.8701, "lng": 106.8030, "radius": -10}).status_code == 422
    assert client.get("/api/amenities/nearby", params={"lat": 10.8701, "lng": 106.8030, "radius": 1000}).status_code == 422


def test_search_empty_query_returns_422():
    res = client.get("/api/search", params={"q": ""})
    assert res.status_code == 422


def test_search_sql_injection_safe():
    res = client.get("/api/search", params={"q": "%'; DROP TABLE rooms;--"})
    assert res.status_code == 200
    assert res.json() == []
    assert client.get("/api/rooms", params={"building_code": "A"}).status_code == 200


def test_route_gate_a_to_a305():
    res = client.get(
        "/api/route",
        params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "A.305"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    assert body["room_code"] == "A.305"
    assert body["floors"] == [1, 2, 3]
    assert body["total_length_m"] > 0
    features = body["features"]
    assert len(features) >= 1
    assert features[0]["properties"]["path_type"] == "Walkway"
    assert any(f["properties"]["path_type"] == "Stairs" for f in features)


def test_route_unknown_room_and_missing_param():
    res_404 = client.get(
        "/api/route",
        params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "ZZZ999"},
    )
    assert res_404.status_code == 404
    assert "detail" in res_404.json()

    res_422 = client.get(
        "/api/route",
        params={"start_lng": 106.8020546, "end_room_code": "A.305"},
    )
    assert res_422.status_code == 422
