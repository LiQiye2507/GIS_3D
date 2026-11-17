"""Nghiệp vụ chỉ đường: pgRouting (pgr_dijkstra) trên đồ thị campus_paths, nhiều tầng qua cầu thang."""
from utils.db import fetch_all
from utils.geojson import to_fc

ROUTE_SQL = """
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
        -- Ưu tiên đỉnh cùng tầng trong bán kính 40 m quanh phòng; tòa chưa có đồ thị trong nhà
        -- (vd. Tòa C) thì dừng ở đỉnh tầng 1 gần nhất (lối vào)
        SELECT n.node_id,
               (n.floor_num = r.floor_number
                AND ST_DWithin(n.pt::geography, ST_Centroid(r.geom)::geography, 40)) AS exact
        FROM nodes n
        JOIN rooms r ON r.room_code = %s
        WHERE n.floor_num = r.floor_number OR n.floor_num = 1
        ORDER BY exact DESC, n.floor_num = 1 DESC,
                 ST_Distance(n.pt::geography, ST_Centroid(r.geom)::geography)
        LIMIT 1
    )
    SELECT d.seq, cp.path_type, cp.floor_from, cp.floor_to, cp.length_m, ev.exact,
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
"""


def shortest_path(start_lng: float, start_lat: float, room_code: str) -> dict | None:
    """FeatureCollection các đoạn đường + tổng quãng đường, các tầng đi qua; None nếu không có đường."""
    rows = fetch_all(ROUTE_SQL, (start_lng, start_lat, room_code))
    if not rows:
        return None
    reaches_room = bool(rows[0]["exact"])
    for r in rows:
        del r["exact"]
    fc = to_fc(rows)
    fc["reaches_room"] = reaches_room
    fc["total_length_m"] = round(sum(r["length_m"] for r in rows), 1)
    fc["floors"] = sorted({fl for r in rows for fl in (r["floor_from"], r["floor_to"])})
    fc["room_code"] = room_code
    return fc
