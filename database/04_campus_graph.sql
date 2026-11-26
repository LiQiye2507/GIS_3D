-- Xây dựng đồ thị dẫn đường 3D (campus_paths) cho pgRouting:
-- 1) Noding lối đi ngoài trời (Walkway, z = 0)
-- 2) Hành lang vòng khép kín Tòa A tầng 1-3 (Corridor) + các cửa vào: phía Cổng A và mọi chỗ lối đi chạm tới Tòa A
-- 3) Cầu thang thẳng đứng tầng 1->2 và 2->3 (Stairs) + gán topology source_node/target_node

-- 1. Nối các đỉnh/vết đường hở dưới 0,3 m (sai số làm tròn) rồi noding lối đi ngoài trời.
-- Không dùng dung sai lớn: lối đi được vẽ trên sơ đồ model, CSDL lưu vị trí thật; sát các tòa lệch nhiều, phép dời
-- làm hai lối tách nhau 39° trên sa bàn chỉ còn 15° ở CSDL, ST_Snap 1,5 m sẽ dán chúng vào nhau thành nếp gấp chữ V.
-- Chỗ hở thật được nối trước bằng database/paths_tool.py fix (đo trên sa bàn).
CREATE TEMP TABLE tmp_noded_walkways AS
WITH walkway_m AS (
    SELECT ST_Force2D(ST_Transform(geom, 32648)) AS geom_m
    FROM campus_paths
    WHERE path_type = 'Walkway'
),
all_walkways AS (
    SELECT ST_Collect(geom_m) AS geom_m FROM walkway_m
),
snapped AS (
    SELECT ST_Snap(w.geom_m, a.geom_m, 0.3) AS geom_m
    FROM walkway_m w
    CROSS JOIN all_walkways a
),
noded AS (
    SELECT (ST_Dump(ST_Node(ST_Collect(geom_m)))).geom AS geom_m
    FROM snapped
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
        ST_SetSRID(ST_MakePoint(106.8020969, 10.8704188), 4326) AS g_4326,
        ST_Transform(ST_SetSRID(ST_MakePoint(106.8020969, 10.8704188), 4326), 32648) AS g_m
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
walkway_ends AS (
    SELECT ST_Transform(ST_Force2D(ST_StartPoint(geom)), 32648) AS pt FROM campus_paths WHERE path_type = 'Walkway'
    UNION
    SELECT ST_Transform(ST_Force2D(ST_EndPoint(geom)), 32648) FROM campus_paths WHERE path_type = 'Walkway'
),
doors AS (
    -- Cửa vào hành lang tầng 1. k = 0: cửa phía Cổng A (như cũ).
    -- k > 0: mỗi chỗ lối đi chạm tới Tòa A (đầu mút lối đi cách sàn hành lang <= 10 m), gộp các điểm cách nhau < 15 m.
    -- Để người từ Cổng B / Tòa B không phải vòng ra Cổng A mới vào được. TODO: kiểm chứng vị trí cửa thực địa.
    -- Đã có lối vào Tòa A do người dùng vẽ (path_entrances) thì chỉ dùng các lối đó: cửa k = 0 đặt cứng phía Cổng A
    -- sinh thêm đoạn nối (dài tới ~18 m, dọc tường tòa) mà người dùng không vẽ, và che mất lối vào vẽ gần nó.
    SELECT 0::bigint AS k, g.g_m AS a_m FROM gate g
    WHERE NOT EXISTS (SELECT 1 FROM path_entrances WHERE building_code = 'A')
    UNION ALL
    SELECT row_number() OVER (ORDER BY ST_X(u.a_m), ST_Y(u.a_m)), u.a_m
    FROM (
        SELECT DISTINCT ON (cid) a_m
        FROM (
            SELECT we.pt AS a_m, ST_Distance(we.pt, cr.fp) AS d,
                   ST_ClusterDBSCAN(we.pt, 15, 1) OVER () AS cid
            FROM walkway_ends we CROSS JOIN core_ring cr
            WHERE ST_DWithin(we.pt, cr.fp, 10)
        ) c
        ORDER BY cid, d
    ) u
    CROSS JOIN core_ring cr
    CROSS JOIN gate g
    WHERE EXISTS (SELECT 1 FROM path_entrances WHERE building_code = 'A')
       OR NOT ST_DWithin(u.a_m, ST_ClosestPoint(ST_ExteriorRing(cr.fp), g.g_m), 15)
),
door_breaks AS (
    -- Điểm ngắt E trên hành lang tầng 1 gần mỗi cửa nhất
    SELECT
        d.k,
        1 AS f,
        CASE
            WHEN f_raw < 0.001 OR f_raw > 0.999 THEN 0.0
            ELSE ROUND(f_raw::numeric, 3)::double precision
        END AS frac
    FROM core_ring cr
    CROSS JOIN doors d
    CROSS JOIN LATERAL (
        SELECT ST_LineLocatePoint(cr.ring, ST_ClosestPoint(cr.ring, d.a_m)) AS f_raw
    ) loc
),
all_breaks AS (
    SELECT f, frac FROM room_breaks
    UNION
    SELECT f, frac FROM door_breaks
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
entrance_points AS (
    SELECT
        d.k,
        ST_Force3D(g.g_4326) AS g_pt,
        ST_Force3D(ST_Transform(ST_ClosestPoint(ST_ExteriorRing(cr.fp), d.a_m), 4326)) AS d_pt,
        ST_Force3D(ST_Transform(ST_LineInterpolatePoint(cr.ring, db.frac), 4326)) AS e_pt
    FROM core_ring cr
    CROSS JOIN gate g
    JOIN doors d ON TRUE
    JOIN door_breaks db ON db.k = d.k
),
nearest_walkway_pts AS (
    SELECT
        ep.k,
        ep.g_pt,
        ep.d_pt,
        ep.e_pt,
        -- Điểm gần nhất TRÊN lối đi (không phải đầu mút gần nhất): lối đi dài thì đầu mút có thể ở rất xa.
        -- Bước noding lại bên dưới (ST_Snap + ST_Node) cắt lối đi tại điểm này thành nút thật.
        (SELECT ST_Force3D(ST_ClosestPoint(ST_Force2D(w.geom), ST_Force2D(ep.d_pt))) FROM campus_paths w
         WHERE w.path_type = 'Walkway' ORDER BY ST_Distance(w.geom::geography, ep.d_pt::geography) LIMIT 1) AS v_pt,
        (SELECT ST_Force3D(ST_ClosestPoint(ST_Force2D(w.geom), ST_Force2D(ep.g_pt))) FROM campus_paths w
         WHERE w.path_type = 'Walkway' ORDER BY ST_Distance(w.geom::geography, ep.g_pt::geography) LIMIT 1) AS v2_pt
    FROM entrance_points ep
),
building_entrances AS (
    -- Amenity hiện không đánh dấu cửa vào; tạm nối đến ranh tòa gần lối đi nhất.
    -- Đã rà overlay với Esri World Imagery: connector chạm lối đi và ranh footprint.
    -- Vị trí cửa thực tế vẫn cần xác nhận tại hiện trường vì ảnh vệ tinh chỉ thấy mái.
    SELECT
        'Walkway' AS path_type,
        1 AS floor_from,
        1 AS floor_to,
        ST_MakeLine(
            ST_Force3D(ST_Transform(near.boundary_pt, 4326)),
            ST_Force3D(ST_Transform(near.path_pt, 4326))
        ) AS geom
    FROM buildings b
    CROSS JOIN LATERAL (
        SELECT
            ST_ClosestPoint(bm.boundary, pm.geom_m) AS boundary_pt,
            ST_ClosestPoint(pm.geom_m, bm.boundary) AS path_pt
        FROM campus_paths cp
        CROSS JOIN LATERAL (
            SELECT ST_ExteriorRing(ST_Transform(b.geom, 32648)) AS boundary
        ) bm
        CROSS JOIN LATERAL (
            SELECT ST_Force2D(ST_Transform(cp.geom, 32648)) AS geom_m
        ) pm
        WHERE cp.path_type = 'Walkway'
        ORDER BY ST_Distance(pm.geom_m, bm.boundary)
        LIMIT 1
    ) near
    WHERE b.building_code <> 'A'
      -- Tòa đã có lối vào do người dùng vẽ (path_entrances): không tự nối thêm. Nối tự động tính ở vị trí thật nên
      -- trên sơ đồ model thường cắt chéo qua bồn cỏ / bồn cây, và tuyến sẽ đi theo đường không ai vẽ.
      AND NOT EXISTS (SELECT 1 FROM path_entrances pe WHERE pe.building_code = b.building_code)
),
connector_edges AS (
    SELECT 'Corridor' AS path_type, 1 AS floor_from, 1 AS floor_to, ST_MakeLine(e_pt, d_pt) AS geom FROM nearest_walkway_pts
    UNION ALL
    SELECT 'Walkway' AS path_type, 1 AS floor_from, 1 AS floor_to, ST_MakeLine(d_pt, v_pt) AS geom FROM nearest_walkway_pts
    UNION ALL
    SELECT 'Walkway' AS path_type, 1 AS floor_from, 1 AS floor_to, ST_MakeLine(g_pt, v2_pt) AS geom FROM nearest_walkway_pts WHERE k = 0
)
INSERT INTO campus_paths (path_type, floor_from, floor_to, length_m, geom)
SELECT path_type, floor_from, floor_to, ST_Length(geom::geography), geom FROM corridor_segs
UNION ALL
SELECT path_type, floor_from, floor_to, length_m, geom FROM stair_edges
UNION ALL
SELECT path_type, floor_from, floor_to, ST_Length(geom::geography), geom FROM connector_edges
UNION ALL
SELECT path_type, floor_from, floor_to, ST_Length(geom::geography), geom FROM building_entrances;

-- Noding lại sau khi thêm các connector để đỉnh connector trên thân Walkway thành nút thật.
CREATE TEMP TABLE tmp_noded_all_walkways AS
WITH walkway_m AS (
    SELECT ST_Force2D(ST_Transform(geom, 32648)) AS geom_m
    FROM campus_paths
    WHERE path_type = 'Walkway'
),
all_walkways AS (
    SELECT ST_Collect(geom_m) AS geom_m FROM walkway_m
),
snapped AS (
    SELECT ST_Snap(w.geom_m, a.geom_m, 0.3) AS geom_m
    FROM walkway_m w
    CROSS JOIN all_walkways a
),
noded AS (
    SELECT (ST_Dump(ST_Node(ST_Collect(geom_m)))).geom AS geom_m
    FROM snapped
)
SELECT ST_Force3D(ST_Transform(geom_m, 4326)) AS geom
FROM noded
WHERE ST_GeometryType(geom_m) = 'ST_LineString'
  AND ST_Length(geom_m) >= 0.01;

DELETE FROM campus_paths WHERE path_type = 'Walkway';
INSERT INTO campus_paths (path_type, floor_from, floor_to, length_m, geom)
SELECT 'Walkway', 1, 1, ST_Length(geom::geography), geom
FROM tmp_noded_all_walkways;

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
