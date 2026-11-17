-- Xây dựng đồ thị dẫn đường 3D (campus_paths) cho pgRouting:
-- 1) Noding lối đi ngoài trời (Walkway, z = 0)
-- 2) Hành lang vòng khép kín Tòa A tầng 1-3 (Corridor) + lối vào từ Cổng A
-- 3) Cầu thang thẳng đứng tầng 1->2 và 2->3 (Stairs) + gán topology source_node/target_node

-- 1. Noding lại toàn bộ Walkway hiện có (từ 02_seed_uit_data.sql)
CREATE TEMP TABLE tmp_noded_walkways AS
WITH noded AS (
    SELECT (ST_Dump(ST_Node(ST_Collect(ST_Force2D(ST_Transform(geom, 32648)))))).geom AS geom_m
    FROM campus_paths
    WHERE path_type = 'Walkway'
)
SELECT
    ST_Force3D(ST_Transform(geom_m, 4326)) AS geom
FROM noded
WHERE ST_GeometryType(geom_m) = 'ST_LineString'
  AND ST_Length(geom_m) >= 0.01;

DELETE FROM campus_paths WHERE path_type IN ('Walkway', 'Corridor', 'Stairs');

INSERT INTO campus_paths (path_type, floor_from, floor_to, length_m, geom)
SELECT
    'Walkway',
    1,
    1,
    ST_Length(geom::geography),
    geom
FROM tmp_noded_walkways;

-- 2. Hành lang tầng 1-3 và cầu thang Tòa A
-- Vòng hành lang lấy theo sàn hành lang tầng 1 (A.HL1) của khối chính, không theo footprint OSM
WITH bld AS (
    SELECT b.id AS building_id, ST_Transform(ST_MakePolygon(ST_ExteriorRing(r.geom)), 32648) AS fp
    FROM buildings b
    JOIN rooms r ON r.building_id = b.id AND r.room_code = 'A.HL1'
    WHERE b.building_code = 'A'
),
core_ring AS (
    SELECT
        b.building_id,
        b.fp,
        ST_ExteriorRing(c.geom) AS ring
    FROM bld b
    CROSS JOIN LATERAL (
        SELECT d.geom
        FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(ST_Buffer(b.fp, -9.25)), 3)) AS d
        ORDER BY ST_Area(d.geom) DESC
        LIMIT 1
    ) c
),
gate AS (
    SELECT
        ST_SetSRID(ST_MakePoint(106.8020546, 10.8704376), 4326) AS g_4326,
        ST_Transform(ST_SetSRID(ST_MakePoint(106.8020546, 10.8704376), 4326), 32648) AS g_m
),
room_breaks AS (
    -- Điểm ngắt từ mọi phòng không phải Corridor (gồm Stairs) trên từng tầng
    SELECT
        r.floor_number AS f,
        r.room_code,
        r.room_type,
        CASE
            WHEN f_raw < 0.001 OR f_raw > 0.999 THEN 0.0
            ELSE ROUND(f_raw::numeric, 3)::double precision
        END AS frac
    FROM rooms r
    CROSS JOIN core_ring cr
    CROSS JOIN LATERAL (
        SELECT ST_LineLocatePoint(cr.ring, ST_ClosestPoint(cr.ring, ST_Centroid(ST_Transform(r.geom, 32648)))) AS f_raw
    ) loc
    WHERE r.building_id = cr.building_id
      AND r.room_type <> 'Corridor'
),
gate_break AS (
    -- Điểm ngắt E trên hành lang tầng 1 gần Cổng A nhất
    SELECT
        1 AS f,
        CASE
            WHEN f_raw < 0.001 OR f_raw > 0.999 THEN 0.0
            ELSE ROUND(f_raw::numeric, 3)::double precision
        END AS frac
    FROM core_ring cr
    CROSS JOIN gate g
    CROSS JOIN LATERAL (
        SELECT ST_LineLocatePoint(cr.ring, ST_ClosestPoint(cr.ring, g.g_m)) AS f_raw
    ) loc
),
all_breaks AS (
    SELECT f, frac FROM room_breaks
    UNION
    SELECT f, frac FROM gate_break
    UNION
    -- đầu trên của mỗi vế thang phải là một nút trên hành lang tầng trên
    SELECT f + 1, frac FROM room_breaks WHERE room_type = 'Stairs' AND f IN (1, 2)
    UNION
    SELECT f, v AS frac FROM generate_series(1, 3) AS f CROSS JOIN (VALUES (0.0), (1.0)) AS b(v)
),
ordered_breaks AS (
    SELECT
        f,
        frac,
        LEAD(frac) OVER (PARTITION BY f ORDER BY frac) AS next_frac
    FROM all_breaks
),
corridor_segs AS (
    SELECT
        'Corridor' AS path_type,
        ob.f AS floor_from,
        ob.f AS floor_to,
        ST_Translate(ST_Force3D(ST_Transform(ST_LineSubstring(cr.ring, ob.frac, ob.next_frac), 4326)), 0, 0, (ob.f - 1) * 3.8) AS geom
    FROM ordered_breaks ob
    CROSS JOIN core_ring cr
    WHERE ob.next_frac IS NOT NULL
      AND ob.next_frac > ob.frac
      AND ST_Length(ST_LineSubstring(cr.ring, ob.frac, ob.next_frac)) >= 0.01
),
stair_edges AS (
    -- Ước lượng chiều dài vế thang 7.6 m cho mỗi tầng (TODO: kiểm chứng thực địa)
    -- Dùng 3 điểm qua chiếu nghỉ trong phòng cầu thang để ST_IsValid (2D) không coi là đoạn suy biến
    SELECT
        'Stairs' AS path_type,
        rb.f AS floor_from,
        rb.f + 1 AS floor_to,
        7.6::double precision AS length_m,
        ST_MakeLine(ARRAY[
            ST_Translate(ST_Force3D(ST_Transform(ST_LineInterpolatePoint(cr.ring, rb.frac), 4326)), 0, 0, (rb.f - 1) * 3.8),
            ST_Translate(ST_Force3D(ST_PointOnSurface(r.geom)), 0, 0, (rb.f - 1) * 3.8 + 1.9),
            ST_Translate(ST_Force3D(ST_Transform(ST_LineInterpolatePoint(cr.ring, rb.frac), 4326)), 0, 0, rb.f * 3.8)
        ]) AS geom
    FROM room_breaks rb
    CROSS JOIN core_ring cr
    JOIN rooms r
      ON r.building_id = cr.building_id
     AND r.room_code = rb.room_code
     AND r.floor_number = rb.f
    WHERE rb.room_type = 'Stairs'
      AND rb.f IN (1, 2)
),
walkway_vertices AS (
    SELECT ST_StartPoint(geom) AS pt FROM campus_paths WHERE path_type = 'Walkway'
    UNION
    SELECT ST_EndPoint(geom) AS pt FROM campus_paths WHERE path_type = 'Walkway'
),
entrance_points AS (
    SELECT
        ST_Force3D(g.g_4326) AS g_pt,
        ST_Force3D(ST_Transform(ST_ClosestPoint(ST_ExteriorRing(cr.fp), g.g_m), 4326)) AS d_pt,
        ST_Force3D(ST_Transform(ST_LineInterpolatePoint(cr.ring, gb.frac), 4326)) AS e_pt
    FROM core_ring cr
    CROSS JOIN gate g
    CROSS JOIN gate_break gb
),
nearest_walkway_pts AS (
    SELECT
        ep.g_pt,
        ep.d_pt,
        ep.e_pt,
        (SELECT wv.pt FROM walkway_vertices wv ORDER BY ST_Distance(wv.pt::geography, ep.d_pt::geography) LIMIT 1) AS v_pt,
        (SELECT wv.pt FROM walkway_vertices wv ORDER BY ST_Distance(wv.pt::geography, ep.g_pt::geography) LIMIT 1) AS v2_pt
    FROM entrance_points ep
),
connector_edges AS (
    SELECT 'Corridor' AS path_type, 1 AS floor_from, 1 AS floor_to, ST_MakeLine(e_pt, d_pt) AS geom FROM nearest_walkway_pts
    UNION ALL
    SELECT 'Walkway' AS path_type, 1 AS floor_from, 1 AS floor_to, ST_MakeLine(d_pt, v_pt) AS geom FROM nearest_walkway_pts
    UNION ALL
    SELECT 'Walkway' AS path_type, 1 AS floor_from, 1 AS floor_to, ST_MakeLine(g_pt, v2_pt) AS geom FROM nearest_walkway_pts
)
INSERT INTO campus_paths (path_type, floor_from, floor_to, length_m, geom)
SELECT path_type, floor_from, floor_to, ST_Length(geom::geography), geom FROM corridor_segs
UNION ALL
SELECT path_type, floor_from, floor_to, length_m, geom FROM stair_edges
UNION ALL
SELECT path_type, floor_from, floor_to, ST_Length(geom::geography), geom FROM connector_edges;

-- 3. Gán topology source_node/target_node
-- Không dùng pgr_createTopology vì đã bị bỏ ở pgRouting 4
WITH snapped AS (
    SELECT id, ST_SnapToGrid(geom, 1e-7) AS g
    FROM campus_paths
),
endpoints AS (
    SELECT
        id,
        'start' AS role,
        ROUND(ST_X(ST_StartPoint(g))::numeric, 7) AS kx,
        ROUND(ST_Y(ST_StartPoint(g))::numeric, 7) AS ky,
        ROUND(ST_Z(ST_StartPoint(g))::numeric, 1) AS kz
    FROM snapped
    UNION ALL
    SELECT
        id,
        'end' AS role,
        ROUND(ST_X(ST_EndPoint(g))::numeric, 7) AS kx,
        ROUND(ST_Y(ST_EndPoint(g))::numeric, 7) AS ky,
        ROUND(ST_Z(ST_EndPoint(g))::numeric, 1) AS kz
    FROM snapped
),
ranked AS (
    SELECT
        id,
        role,
        dense_rank() OVER (ORDER BY kx, ky, kz)::int AS node_id
    FROM endpoints
),
edge_nodes AS (
    SELECT
        id,
        MAX(CASE WHEN role = 'start' THEN node_id END) AS source_node,
        MAX(CASE WHEN role = 'end' THEN node_id END) AS target_node
    FROM ranked
    GROUP BY id
)
UPDATE campus_paths cp
SET source_node = en.source_node,
    target_node = en.target_node
FROM edge_nodes en
WHERE cp.id = en.id;
