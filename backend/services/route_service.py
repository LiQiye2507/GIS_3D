"""Route people between the nearest walkable edge and a room/building entrance."""
from utils.db import fetch_all
from utils.geojson import to_fc


ROUTE_SQL = """
    WITH request AS (
        SELECT
            ST_SetSRID(ST_MakePoint(%s, %s, 0), 4326) AS start_pt,
            r.room_code,
            r.floor_number AS room_floor,
            r.base_height AS room_z,
            r.geom AS room_geom,
            b.geom AS building_geom,
            b.building_code
        FROM rooms r
        JOIN buildings b ON b.id = r.building_id
        WHERE r.room_code = %s
    ),
    indoor_target AS (
        SELECT
            cp.id AS edge_id,
            ST_LineLocatePoint(
                ST_Force2D(cp.geom),
                ST_ClosestPoint(ST_Force2D(cp.geom), ST_Centroid(i.room_geom))
            ) AS fraction,
            ST_LineInterpolatePoint(
                cp.geom,
                ST_LineLocatePoint(
                    ST_Force2D(cp.geom),
                    ST_ClosestPoint(ST_Force2D(cp.geom), ST_Centroid(i.room_geom))
                )
            ) AS snap_pt,
            NULL::geometry AS boundary_pt,
            0::float AS room_cost,
            cp.floor_from AS target_floor,
            TRUE AS reaches_room
        FROM campus_paths cp
        CROSS JOIN request i
        WHERE cp.path_type = 'Corridor'
          AND cp.floor_from = i.room_floor
          AND cp.floor_to = i.room_floor
          AND ST_Within(ST_LineInterpolatePoint(ST_Force2D(cp.geom), 0.5), i.building_geom)
          AND ST_DWithin(cp.geom::geography, i.building_geom::geography, 5)
        ORDER BY ST_Distance(cp.geom::geography, ST_Centroid(i.room_geom)::geography)
        LIMIT 1
    ),
    outdoor_target AS (
        SELECT
            cp.id AS edge_id,
            ST_LineLocatePoint(
                ST_Force2D(cp.geom),
                ST_ClosestPoint(ST_Force2D(cp.geom), ST_ExteriorRing(i.building_geom))
            ) AS fraction,
            ST_Force3D(ST_ClosestPoint(
                ST_ExteriorRing(ST_Force2D(i.building_geom)),
                ST_Force2D(cp.geom)
            )) AS boundary_pt,
            -- Tòa chưa có đồ thị trong nhà: cộng quãng (đường thẳng) từ lối vào tới phòng, để chọn lối vào gần PHÒNG
            -- chứ không phải lối vào gần người đi nhất (Tòa C dài ~118 m, vào nhầm đầu thì phải tự đi bộ trong nhà rất xa)
            ST_Distance(
                ST_ClosestPoint(ST_ExteriorRing(ST_Force2D(i.building_geom)), ST_Force2D(cp.geom))::geography,
                ST_Centroid(i.room_geom)::geography
            ) AS room_cost,
            ST_LineInterpolatePoint(
                cp.geom,
                ST_LineLocatePoint(
                    ST_Force2D(cp.geom),
                    ST_ClosestPoint(ST_Force2D(cp.geom), ST_ExteriorRing(i.building_geom))
                )
            ) AS snap_pt,
            cp.floor_from AS target_floor,
            FALSE AS reaches_room
        FROM (
            -- Mọi lối đi sát tòa (<= 8 m, tối đa 30 lối) đều là ứng viên; chọn lối cho tổng quãng đường ngắn nhất
            -- ở bước path_candidates, để người tới từ phía nào cũng vào tòa ở phía đó (không vòng ra lối gần mép nhất)
            SELECT c.*, row_number() OVER (ORDER BY c.d) AS rn
            FROM (
                SELECT cp.*, ST_Distance(cp.geom::geography, ST_ExteriorRing(i.building_geom)::geography) AS d
                FROM campus_paths cp
                CROSS JOIN request i
                WHERE cp.path_type = 'Walkway'
                  AND cp.floor_from = 1 AND cp.floor_to = 1
            ) c
        ) cp
        CROSS JOIN request i
        WHERE cp.rn = 1 OR (cp.d <= 8 AND cp.rn <= 30)
    ),
    entrance_target AS (
        -- Lối vào tòa người dùng vẽ ở ?edit=paths (đầu lối cụt chạm tòa, xem path_entrances): tuyến kết thúc đúng ở đó,
        -- không bám đại một điểm trên lối đi gần tòa rồi kẻ thẳng vào tường.
        SELECT
            w.id AS edge_id,
            ST_LineLocatePoint(ST_Force2D(w.geom), pe.geom) AS fraction,
            ST_Force3D(pe.geom) AS boundary_pt,
            ST_Distance(pe.geom::geography, ST_Centroid(i.room_geom)::geography) AS room_cost,
            ST_LineInterpolatePoint(w.geom, ST_LineLocatePoint(ST_Force2D(w.geom), pe.geom)) AS snap_pt,
            w.floor_from AS target_floor,
            FALSE AS reaches_room
        FROM request i
        JOIN path_entrances pe ON pe.building_code = i.building_code
        CROSS JOIN LATERAL (
            SELECT cp.* FROM campus_paths cp
            WHERE cp.path_type = 'Walkway' AND cp.floor_from = 1 AND cp.floor_to = 1
            ORDER BY cp.geom <-> pe.geom
            LIMIT 1
        ) w
    ),
    target_snap AS (
        SELECT row_number() OVER () AS t_id, u.*,
               COALESCE(ST_Distance(u.snap_pt::geography, u.boundary_pt::geography), 0) + u.room_cost AS conn_cost
        FROM (
            SELECT edge_id, fraction, snap_pt, boundary_pt, room_cost, target_floor, reaches_room
            FROM indoor_target
            UNION ALL
            SELECT edge_id, fraction, snap_pt, boundary_pt, room_cost, target_floor, reaches_room
            FROM entrance_target
            WHERE NOT EXISTS (SELECT 1 FROM indoor_target)
            UNION ALL
            -- Tòa chưa có lối vào nào được vẽ: bám lối đi gần tòa rồi nối thẳng vào tường
            SELECT edge_id, fraction, snap_pt, boundary_pt, room_cost, target_floor, reaches_room
            FROM outdoor_target
            WHERE NOT EXISTS (SELECT 1 FROM indoor_target) AND NOT EXISTS (SELECT 1 FROM entrance_target)
        ) u
    ),
    target_flag AS (
        SELECT bool_or(reaches_room) AS reaches_room FROM target_snap
    ),
    start_snap AS (
        SELECT
            cp.id AS edge_id,
            ST_LineLocatePoint(ST_Force2D(cp.geom), ST_Force2D(i.start_pt)) AS fraction,
            ST_LineInterpolatePoint(
                cp.geom,
                ST_LineLocatePoint(ST_Force2D(cp.geom), ST_Force2D(i.start_pt))
            ) AS snap_pt
        FROM campus_paths cp
        CROSS JOIN request i
        CROSS JOIN target_flag t
        WHERE cp.floor_from = 1 AND cp.floor_to = 1
          AND (cp.path_type = 'Walkway' OR (t.reaches_room AND cp.path_type = 'Corridor'))
        ORDER BY ST_Distance(cp.geom::geography, i.start_pt::geography)
        LIMIT 1
    ),
    route_graph AS (
        SELECT format(
            'SELECT id, source_node AS source, target_node AS target, cost, reverse_cost FROM campus_paths WHERE path_type = %%L OR (%%L::boolean AND path_type IN (%%L, %%L))',
            'Walkway', t.reaches_room, 'Corridor', 'Stairs'
        ) AS sql
        FROM target_flag t
    ),
    start_options AS (
        SELECT 1 AS option_id, cp.source_node AS node, cp.id AS edge_id,
               s.fraction, cp.cost * s.fraction AS access_cost
        FROM start_snap s JOIN campus_paths cp ON cp.id = s.edge_id
        UNION ALL
        SELECT 2, cp.target_node, cp.id, s.fraction,
               cp.cost * (1 - s.fraction)
        FROM start_snap s JOIN campus_paths cp ON cp.id = s.edge_id
    ),
    target_options AS (
        -- access_cost gồm cả đoạn nối cuối (điểm bám -> mép tòa). Nếu bỏ qua, có thể chọn điểm bám đi tới nhanh hơn
        -- nhưng nằm lệch khỏi tòa, rồi đoạn nối cuối phải quay ngược lại (nếp gấp cạnh Cafe Voi khi vào Tòa C).
        SELECT t.t_id * 2 - 1 AS option_id, t.t_id, cp.source_node AS node, cp.id AS edge_id,
               t.fraction, cp.cost * t.fraction + t.conn_cost AS access_cost
        FROM target_snap t JOIN campus_paths cp ON cp.id = t.edge_id
        UNION ALL
        SELECT t.t_id * 2, t.t_id, cp.target_node, cp.id, t.fraction,
               cp.cost * (1 - t.fraction) + t.conn_cost
        FROM target_snap t JOIN campus_paths cp ON cp.id = t.edge_id
    ),
    path_candidates AS (
        SELECT FALSE AS direct, s.option_id AS start_option, t.option_id AS target_option,
               NULL::bigint AS direct_edge_id, t.t_id,
               s.access_cost + t.access_cost + max(d.agg_cost) AS total_cost
        FROM start_options s
        CROSS JOIN target_options t
        CROSS JOIN route_graph g
        CROSS JOIN LATERAL pgr_dijkstra(g.sql, s.node, t.node, directed := false) d
        GROUP BY s.option_id, t.option_id, t.t_id, s.access_cost, t.access_cost
        UNION ALL
        -- pgr_dijkstra không trả dòng nào khi đỉnh đầu = đỉnh đích (hai cạnh bám kề nhau)
        SELECT FALSE, s.option_id, t.option_id, NULL::bigint, t.t_id,
               s.access_cost + t.access_cost
        FROM start_options s
        JOIN target_options t ON t.node = s.node
        UNION ALL
        SELECT TRUE, NULL::integer, NULL::bigint, s.edge_id, t.t_id,
               cp.cost * abs(s.fraction - t.fraction) + t.conn_cost
        FROM start_snap s
        JOIN target_snap t ON t.edge_id = s.edge_id
        JOIN campus_paths cp ON cp.id = s.edge_id
    ),
    best_path AS (
        SELECT * FROM path_candidates ORDER BY total_cost LIMIT 1
    ),
    chosen_target AS (
        SELECT t.* FROM target_snap t JOIN best_path b ON b.t_id = t.t_id
    ),
    path_steps AS (
        SELECT 0 AS seq, 0 AS path_seq, -1::bigint AS node,
               b.direct_edge_id AS edge, -2::bigint AS next_node
        FROM best_path b WHERE b.direct
        UNION ALL
        SELECT 0, 0, -1::bigint, s.edge_id, s.node
        FROM best_path b
        JOIN start_options s ON s.option_id = b.start_option
        WHERE NOT b.direct
        UNION ALL
        -- next_node lấy từ LEAD bên trong (trước khi lọc edge = -1),
        -- nếu tính lại ở đây thì cạnh cuối cùng bị NULL và rơi mất.
        SELECT d.seq, d.path_seq + 1, d.node, d.edge, d.next_node
        FROM best_path b
        JOIN start_options s ON s.option_id = b.start_option
        JOIN target_options t ON t.option_id = b.target_option
        CROSS JOIN route_graph g
        CROSS JOIN LATERAL (
            SELECT p.seq, p.path_seq, p.node, p.edge,
                   LEAD(p.node) OVER (ORDER BY p.path_seq) AS next_node
            FROM pgr_dijkstra(g.sql, s.node, t.node, directed := false) p
        ) d
        WHERE NOT b.direct AND d.edge <> -1
        UNION ALL
        SELECT 1000000, 1000000, t.node, t.edge_id, -2::bigint
        FROM best_path b
        JOIN target_options t ON t.option_id = b.target_option
        WHERE NOT b.direct
    ),
    path_parts AS (
        SELECT
            d.seq,
            cp.id,
            cp.path_type,
            cp.floor_from,
            cp.floor_to,
            CASE
                WHEN d.node = -1 THEN s.fraction
                WHEN d.node = cp.source_node THEN 0.0
                WHEN d.node = cp.target_node THEN 1.0
                WHEN d.node = -2 THEN t.fraction
            END AS fraction_from,
            CASE
                WHEN d.next_node = -2 THEN t.fraction
                WHEN d.next_node = cp.source_node THEN 0.0
                WHEN d.next_node = cp.target_node THEN 1.0
                WHEN d.next_node = -1 THEN s.fraction
            END AS fraction_to,
            cp.geom
        FROM path_steps d
        JOIN campus_paths cp ON cp.id = d.edge
        CROSS JOIN start_snap s
        CROSS JOIN chosen_target t
        WHERE d.edge <> -1
          AND d.next_node IS NOT NULL
    ),
    route_edges AS (
        SELECT
            seq,
            path_type,
            CASE WHEN fraction_from <= fraction_to THEN floor_from ELSE floor_to END AS floor_from,
            CASE WHEN fraction_from <= fraction_to THEN floor_to ELSE floor_from END AS floor_to,
            CASE WHEN fraction_from <= fraction_to
                 THEN ST_LineSubstring(geom, fraction_from, fraction_to)
                 ELSE ST_Reverse(ST_LineSubstring(geom, fraction_to, fraction_from))
            END AS geom
        FROM path_parts
        WHERE fraction_from IS NOT NULL
          AND fraction_to IS NOT NULL
          AND abs(fraction_from - fraction_to) > 1e-12
    ),
    route_exists AS (
        -- Có đường khi tìm được phương án, kể cả khi điểm bám đầu trùng điểm bám cuối (0 cạnh, vd. đứng ngay
        -- trước lối vào tòa): khi đó tuyến chỉ gồm hai đoạn nối. Đếm route_edges sẽ báo nhầm "không tìm thấy".
        SELECT EXISTS (SELECT 1 FROM best_path) AS has_path
    ),
    feature_rows AS (
        SELECT
            0 AS seq,
            'Connector'::text AS path_type,
            1 AS floor_from,
            1 AS floor_to,
            ST_MakeLine(i.start_pt, s.snap_pt) AS geom,
            t.reaches_room
        FROM request i
        CROSS JOIN start_snap s
        CROSS JOIN chosen_target t
        CROSS JOIN route_exists r
        WHERE r.has_path
        UNION ALL
        SELECT e.seq + 1, e.path_type, e.floor_from, e.floor_to, e.geom, t.reaches_room
        FROM route_edges e CROSS JOIN chosen_target t
        UNION ALL
        SELECT
            (SELECT COALESCE(max(seq), 0) + 2 FROM route_edges),
            'Connector'::text,
            t.target_floor,
            CASE WHEN t.reaches_room THEN i.room_floor ELSE t.target_floor END,
            CASE WHEN t.reaches_room
                 THEN ST_MakeLine(
                     t.snap_pt,
                     ST_Translate(ST_Force3D(ST_PointOnSurface(i.room_geom)), 0, 0, i.room_z)
                 )
                 ELSE ST_MakeLine(t.snap_pt, t.boundary_pt)
            END,
            t.reaches_room
        FROM request i
        CROSS JOIN chosen_target t
        CROSS JOIN route_exists r
        WHERE r.has_path
    )
    SELECT
        seq,
        path_type,
        floor_from,
        floor_to,
        ST_Length(geom::geography) AS length_m,
        reaches_room AS exact,
        ST_AsGeoJSON(geom)::json AS geometry
    FROM feature_rows
    WHERE geom IS NOT NULL
    ORDER BY seq
"""


def shortest_path(start_lng: float, start_lat: float, room_code: str) -> dict | None:
    """Return an ordered route with snapped connectors and a realistic walk time."""
    rows = fetch_all(ROUTE_SQL, (start_lng, start_lat, room_code))
    if not rows:
        return None

    reaches_room = bool(rows[0]["exact"])
    total_length = sum(float(row["length_m"] or 0) for row in rows)
    stair_length = sum(
        float(row["length_m"] or 0)
        for row in rows
        if row["path_type"] == "Stairs"
    )
    floors = sorted(
        {
            floor
            for row in rows
            for floor in (row["floor_from"], row["floor_to"])
        }
    )
    for row in rows:
        del row["exact"]

    fc = to_fc(rows)
    fc["reaches_room"] = reaches_room
    fc["total_length_m"] = round(total_length, 1)
    fc["walk_seconds"] = round(total_length / 1.2 + stair_length * 1.5)
    fc["floors"] = floors
    fc["room_code"] = room_code
    return fc
