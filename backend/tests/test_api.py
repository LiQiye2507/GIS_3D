import math
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils.db import fetch_all  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


def _distance_m(a, b):
    """Small haversine helper for checking GeoJSON route joins."""
    lon1, lat1 = map(math.radians, a[:2])
    lon2, lat2 = map(math.radians, b[:2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    hav = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(hav))


def test_buildings_collection():
    res = client.get("/api/buildings")
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 7  # A, B, C, D, E, NHA_PVSV, CAFE_VOI
    toa_a = next(
        (f for f in body["features"] if f["properties"]["building_code"] == "A"),
        None,
    )
    assert toa_a is not None
    assert toa_a["properties"]["total_floors"] == 3


def test_sports_fields_collection():
    res = client.get("/api/sports-fields")
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 9
    for f in body["features"]:
        assert f["geometry"]["type"] == "Polygon"
        assert f["properties"]["field_code"].startswith("SF")
        assert f["properties"]["area_m2"] > 0


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


def test_rooms_toa_e_top_floor_heights():
    # LOD 3 Tòa E (13 tầng, database/06_toa_b_e_indoor.sql): tầng 13 cao (13 - 1) * 3.8 = 45.6 m
    res = client.get("/api/rooms", params={"building_code": "E", "floor_number": 13})
    assert res.status_code == 200
    feats = res.json()["features"]
    assert len(feats) >= 1
    for feat in feats:
        props = feat["properties"]
        assert props["base_height"] == 45.6
        if props["room_type"] != "Corridor":
            assert props["extrude_height"] == 49.1


def test_rooms_unknown_building_returns_404():
    res = client.get("/api/rooms", params={"building_code": "ZZZ"})
    assert res.status_code == 404
    assert "detail" in res.json()


def test_search_room_a305_within_building_a():
    res = client.get("/api/search", params={"q": "A305"})
    assert res.status_code == 200
    items = res.json()
    match = next((r for r in items if r["room_code"] == "A305"), None)
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
        params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "A305"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["type"] == "FeatureCollection"
    assert body["room_code"] == "A305"
    assert body["floors"] == [1, 2, 3]
    assert body["total_length_m"] > 0
    features = body["features"]
    assert len(features) >= 3
    assert features[0]["properties"]["path_type"] == "Connector"
    assert features[-1]["properties"]["path_type"] == "Connector"
    assert any(f["properties"]["path_type"] == "Stairs" for f in features)


def test_route_is_continuous():
    body = client.get(
        "/api/route",
        params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "A305"},
    ).json()
    features = body["features"]
    for previous, current in zip(features, features[1:]):
        previous_end = previous["geometry"]["coordinates"][-1]
        current_start = current["geometry"]["coordinates"][0]
        assert _distance_m(previous_end, current_start) < 0.5
        # cầu thang thẳng đứng: lng/lat trùng nhau nên phải so cả cao độ
        assert abs((previous_end[2] if len(previous_end) > 2 else 0)
                   - (current_start[2] if len(current_start) > 2 else 0)) < 0.5
    assert sum(f["properties"]["path_type"] == "Stairs" for f in features) == 2


def test_route_starts_at_user():
    start = [106.8020546, 10.8704376]
    body = client.get(
        "/api/route",
        params={"start_lng": start[0], "start_lat": start[1], "end_room_code": "A305"},
    ).json()
    assert _distance_m(body["features"][0]["geometry"]["coordinates"][0], start) < 0.01


def test_route_not_longer_than_needed():
    start = [106.8020546, 10.8704376]
    body = client.get(
        "/api/route",
        params={"start_lng": start[0], "start_lat": start[1], "end_room_code": "A305"},
    ).json()
    room = fetch_all(
        "SELECT ST_X(ST_PointOnSurface(geom)) AS lng, ST_Y(ST_PointOnSurface(geom)) AS lat "
        "FROM rooms WHERE room_code = 'A305'"
    )[0]
    straight = _distance_m(start, [room["lng"], room["lat"]])
    assert body["total_length_m"] >= straight
    assert body["total_length_m"] <= straight * 2.5


def test_route_mid_walkway_starts_from_cut_edge():
    midpoint = fetch_all(
        "SELECT ST_X(pt) AS lng, ST_Y(pt) AS lat FROM ("
        "SELECT ST_LineInterpolatePoint(geom, 0.5) AS pt FROM campus_paths "
        "WHERE path_type = 'Walkway' ORDER BY length_m DESC LIMIT 1) AS longest"
    )[0]
    body = client.get(
        "/api/route",
        params={"start_lng": midpoint["lng"], "start_lat": midpoint["lat"], "end_room_code": "A305"},
    ).json()
    assert body["features"][0]["properties"]["path_type"] == "Connector"
    first_path = next(
        feature for feature in body["features"]
        if feature["properties"]["path_type"] != "Connector"
    )
    assert first_path["properties"]["path_type"] == "Walkway"
    assert _distance_m(
        body["features"][0]["geometry"]["coordinates"][-1],
        first_path["geometry"]["coordinates"][0],
    ) < 0.5
    assert _distance_m(
        first_path["geometry"]["coordinates"][0],
        [midpoint["lng"], midpoint["lat"]],
    ) < 0.5


def test_route_unknown_room_and_missing_param():
    res_404 = client.get(
        "/api/route",
        params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "ZZZ999"},
    )
    assert res_404.status_code == 404
    assert "detail" in res_404.json()

    res_422 = client.get(
        "/api/route",
        params={"start_lng": 106.8020546, "end_room_code": "A305"},
    )
    assert res_422.status_code == 422


def test_nearby_includes_wc_rooms():
    res = client.get("/api/amenities/nearby", params={"lat": 10.8701, "lng": 106.8030, "radius": 300, "category": "WC"})
    assert res.status_code == 200
    feats = res.json()["features"]
    assert len(feats) >= 1
    assert all(f["properties"]["category"] == "WC" and f["properties"]["room_code"] for f in feats)
    keys = [(f["properties"]["distance_m"], f["properties"]["floor_number"]) for f in feats]
    assert keys == sorted(keys)


def test_nearby_halls_are_rooms():
    res = client.get("/api/amenities/nearby", params={"lat": 10.8700, "lng": 106.8030, "radius": 500, "category": "Hall"})
    assert res.status_code == 200
    codes = sorted(f["properties"]["room_code"] for f in res.json()["features"])
    assert codes == ["A.HT", "HTE"]


def test_nearby_medical_is_room_a103():
    res = client.get("/api/amenities/nearby", params={"lat": 10.8701, "lng": 106.8030, "radius": 300, "category": "Medical"})
    assert res.status_code == 200
    feats = res.json()["features"]
    assert [f["properties"]["room_code"] for f in feats] == ["A103"]
    assert feats[0]["properties"]["floor_number"] == 1


def test_route_reaches_room_flag():
    a = client.get("/api/route", params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "A305"}).json()
    assert a["reaches_room"] is True
    # Tòa C chưa có đồ thị trong nhà: tuyến dừng ở lối vào, không được lên tầng của Tòa A
    c = client.get("/api/route", params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "C312"}).json()
    assert c["reaches_room"] is False
    assert c["floors"] == [1]
    end = c["features"][-1]["geometry"]["coordinates"][-1]
    distance = fetch_all(
        "SELECT ST_Distance(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, "
        "ST_ExteriorRing(geom)::geography) AS distance_m "
        "FROM buildings WHERE building_code = 'C'",
        (end[0], end[1]),
    )[0]["distance_m"]
    assert distance < 10


def test_route_enters_building_from_the_near_side():
    # Từ Cổng B tới Tòa B (chưa có đồ thị trong nhà): phải vào tòa ở phía gần người đi,
    # không vòng ra lối đi gần mép tòa nhất ở phía bên kia (trước đây ~1,8 lần đường chim bay)
    start = [106.8038375, 10.8689147]
    body = client.get(
        "/api/route",
        params={"start_lng": start[0], "start_lat": start[1], "end_room_code": "B1.02"},
    ).json()
    end = body["features"][-1]["geometry"]["coordinates"][-1]
    assert body["total_length_m"] <= 1.4 * _distance_m(start, end)


def test_route_when_start_snaps_onto_the_entrance_node():
    # Điểm bám đầu trùng nút lối vào Tòa C (0 cạnh đi bộ): vẫn phải có tuyến gồm hai đoạn nối, không báo 404
    response = client.get(
        "/api/route",
        params={"start_lng": 106.8035813, "start_lat": 10.8695097, "end_room_code": "C312"},
    )
    assert response.status_code == 200
    body = response.json()
    assert [f["properties"]["path_type"] for f in body["features"]] == ["Connector", "Connector"]
    assert body["reaches_room"] is False


def test_route_to_building_without_indoor_graph_stays_out_of_a_corridors():
    body = client.get(
        "/api/route",
        params={"start_lng": 106.8020546, "start_lat": 10.8704376, "end_room_code": "B1.02"},
    ).json()
    assert body["reaches_room"] is False
    assert body["floors"] == [1]
    assert all(
        feature["properties"]["path_type"] == "Walkway"
        for feature in body["features"]
        if feature["properties"]["path_type"] != "Connector"
    )


def test_db_unavailable_returns_503(monkeypatch):
    import config.settings
    import utils.db

    monkeypatch.setattr(config.settings, "DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none?connect_timeout=1")
    monkeypatch.setattr(utils.db, "_pool", None)
    res = client.get("/api/buildings")
    assert res.status_code == 503
    assert res.json()["detail"] == "Không kết nối được cơ sở dữ liệu"


def test_pool_recovers_after_db_restart():
    import psycopg2
    import utils.db
    from config.settings import DATABASE_URL

    fetch_all("SELECT 1")
    idle = list(utils.db._pool._pool)
    pids = [conn.get_backend_pid() for conn in idle]
    # CSDL khởi động lại = mọi kết nối rảnh trong pool bị ngắt
    killer = psycopg2.connect(DATABASE_URL)
    try:
        with killer, killer.cursor() as cur:
            cur.execute("SELECT pg_terminate_backend(pid) FROM unnest(%s) AS pid", (pids,))
    finally:
        killer.close()
    assert len(pids) == 4
    assert client.get("/api/buildings").status_code == 200


def test_large_response_is_gzipped():
    res = client.get("/api/rooms", params={"building_code": "E"}, headers={"Accept-Encoding": "gzip"})
    assert res.status_code == 200
    assert res.headers["content-encoding"] == "gzip"
    assert res.json()["type"] == "FeatureCollection"
