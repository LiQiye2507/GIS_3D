from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from db import fetch_all

app = FastAPI(title="UIT 3D Smart Campus API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "http://127.0.0.1:5500"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


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


@app.get("/api/buildings")
def get_buildings():
    rows = fetch_all(
        """
        SELECT building_code, name, total_floors, base_elevation, height_m,
               glb_model_url, anchor_lng, anchor_lat, model_rotation, description,
               ST_AsGeoJSON(geom)::json AS geometry
        FROM buildings
        ORDER BY building_code
        """
    )
    return to_fc(rows)


@app.get("/api/rooms")
def get_rooms(
    building_code: str = "A",
    floor_number: int | None = Query(None, ge=1, le=20),
):
    exists = fetch_all(
        "SELECT 1 FROM buildings WHERE building_code = %s",
        (building_code,),
    )
    if not exists:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tòa {building_code}")

    sql = """
        SELECT r.room_code, r.room_name, r.room_type, b.building_code,
               r.floor_number, r.capacity, r.base_height, r.extrude_height,
               r.equipment_info, ST_AsGeoJSON(r.geom)::json AS geometry
        FROM rooms r
        JOIN buildings b ON b.id = r.building_id
        WHERE b.building_code = %s
    """
    params: list = [building_code]
    if floor_number is not None:
        sql += " AND r.floor_number = %s"
        params.append(floor_number)
    sql += " ORDER BY r.floor_number, r.room_code"

    return to_fc(fetch_all(sql, tuple(params)))


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.get("/api/search")
def search_rooms(q: str = Query(..., min_length=1, max_length=50)):
    code_pat = f"%{_escape_like(q.replace('.', ''))}%"
    name_pat = f"%{_escape_like(q)}%"
    return fetch_all(
        r"""
        SELECT r.room_code, r.room_name, b.building_code, r.floor_number, r.base_height,
               ST_X(ST_Centroid(r.geom)) AS lng,
               ST_Y(ST_Centroid(r.geom)) AS lat
        FROM rooms r
        JOIN buildings b ON b.id = r.building_id
        WHERE r.room_type <> 'Corridor'
          AND (replace(r.room_code, '.', '') ILIKE %s ESCAPE '\' OR r.room_name ILIKE %s ESCAPE '\')
        ORDER BY r.room_code
        LIMIT 20
        """,
        (code_pat, name_pat),
    )


@app.get("/api/amenities/nearby")
def amenities_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(..., ge=50, le=500),
    category: Literal["Canteen", "ATM", "Water", "Parking", "Medical", "FireSafety"] | None = None,
):
    sql = """
        SELECT a.name, a.category, a.building_id, a.floor_number, a.elevation_z,
               a.open_hours, a.status,
               round(ST_Distance(a.geom::geography, p.pt::geography)::numeric, 1)::double precision AS distance_m,
               ST_AsGeoJSON(a.geom)::json AS geometry
        FROM amenities a
        CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint(%s, %s), 4326) AS pt) p
        WHERE ST_DWithin(a.geom::geography, p.pt::geography, %s)
    """
    params: list = [lng, lat, radius]
    if category is not None:
        sql += " AND a.category = %s"
        params.append(category)
    sql += " ORDER BY distance_m"
    return to_fc(fetch_all(sql, tuple(params)))


@app.get("/api/route")
def route_to_room(
    start_lng: float = Query(..., ge=-180, le=180),
    start_lat: float = Query(..., ge=-90, le=90),
    end_room_code: str = Query(..., min_length=1, max_length=30),
):
    room = fetch_all(
        # Chấp nhận cả "A305" lẫn "A.305" (giống /api/search)
        "SELECT room_code FROM rooms WHERE upper(replace(room_code, '.', '')) = upper(replace(%s, '.', '')) LIMIT 1",
        (end_room_code,),
    )
    if not room:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy phòng {end_room_code}")

    rows = fetch_all(
        """
        WITH nodes AS (
            SELECT source_node AS node_id, floor_from AS floor_num, ST_StartPoint(geom) AS pt
            FROM campus_paths
            UNION
            SELECT target_node AS node_id, floor_to AS floor_num, ST_EndPoint(geom) AS pt
            FROM campus_paths
        ),
        start_v AS (
            SELECT node_id
            FROM nodes
            WHERE floor_num = 1
            ORDER BY ST_Distance(pt::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)
            LIMIT 1
        ),
        end_v AS (
            SELECT n.node_id
            FROM nodes n
            JOIN rooms r ON r.room_code = %s
            WHERE n.floor_num = r.floor_number
            ORDER BY ST_Distance(n.pt::geography, ST_Centroid(r.geom)::geography)
            LIMIT 1
        )
        SELECT d.seq, cp.path_type, cp.floor_from, cp.floor_to, cp.length_m,
               ST_AsGeoJSON(cp.geom)::json AS geometry
        FROM start_v sv, end_v ev,
             pgr_dijkstra(
                 'SELECT id, source_node AS source, target_node AS target, cost, reverse_cost FROM campus_paths',
                 sv.node_id,
                 ev.node_id,
                 directed := false
             ) d
        JOIN campus_paths cp ON cp.id = d.edge
        WHERE d.edge <> -1
        ORDER BY d.seq
        """,
        (start_lng, start_lat, room[0]["room_code"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy đường đi")

    fc = to_fc(rows)
    fc["total_length_m"] = round(sum(r["length_m"] for r in rows), 1)
    fc["floors"] = sorted({fl for r in rows for fl in (r["floor_from"], r["floor_to"])})
    fc["room_code"] = room[0]["room_code"]
    return fc
