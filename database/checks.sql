-- Kiểm tra chất lượng dữ liệu không gian và độ liên thông đồ thị dẫn đường

-- (a) Số cạnh thiếu source_node / target_node
SELECT 'a_missing_nodes', count(*)
FROM campus_paths
WHERE source_node IS NULL OR target_node IS NULL;

-- (b) Số hình học lỗi ST_IsValid trên 5 bảng
SELECT 'b_invalid_buildings', count(*) FROM buildings WHERE NOT ST_IsValid(geom);
SELECT 'b_invalid_floors', count(*) FROM floors WHERE NOT ST_IsValid(geom);
SELECT 'b_invalid_rooms', count(*) FROM rooms WHERE NOT ST_IsValid(geom);
SELECT 'b_invalid_amenities', count(*) FROM amenities WHERE NOT ST_IsValid(geom);
SELECT 'b_invalid_campus_paths', count(*) FROM campus_paths WHERE NOT ST_IsValid(geom);

-- (c) Tuyến pgr_dijkstra từ đỉnh gần Cổng A nhất đến đỉnh tầng 3 gần tâm A305 nhất
WITH nodes AS (
    SELECT source_node AS node_id, floor_from AS floor_num, ST_StartPoint(geom) AS pt FROM campus_paths
    UNION
    SELECT target_node AS node_id, floor_to AS floor_num, ST_EndPoint(geom) AS pt FROM campus_paths
),
start_v AS (
    SELECT node_id
    FROM nodes
    ORDER BY ST_Distance(pt::geography, ST_SetSRID(ST_MakePoint(106.8020969, 10.8704188), 4326)::geography)
    LIMIT 1
),
end_v AS (
    SELECT n.node_id
    FROM nodes n
    JOIN rooms r ON r.room_code = 'A305'
    WHERE n.floor_num = 3
    ORDER BY ST_Distance(n.pt::geography, ST_Centroid(r.geom)::geography)
    LIMIT 1
),
route AS (
    SELECT d.seq, cp.path_type, cp.floor_from, cp.floor_to, cp.length_m
    FROM start_v sv, end_v ev,
         pgr_dijkstra(
             'SELECT id, source_node AS source, target_node AS target, cost, reverse_cost FROM campus_paths',
             sv.node_id,
             ev.node_id,
             directed := false
         ) d
    JOIN campus_paths cp ON cp.id = d.edge
    WHERE d.edge <> -1
),
floors_visited AS (
    SELECT string_agg(DISTINCT fl::text, ',' ORDER BY fl::text) AS floors
    FROM route,
         LATERAL unnest(ARRAY[floor_from, floor_to]) AS fl
)
SELECT
    'c_route_gate_to_A305',
    count(*),
    round(sum(length_m)::numeric, 1),
    string_agg(path_type, '->' ORDER BY seq),
    (SELECT floors FROM floors_visited)
FROM route;

-- (d) Số thành phần liên thông chứa các đỉnh của Tòa A (phải = 1)
SELECT 'd_toa_a_components', count(DISTINCT cc.component)
FROM pgr_connectedComponents(
    'SELECT id, source_node AS source, target_node AS target, cost, reverse_cost FROM campus_paths'
) cc
WHERE cc.node IN (
    SELECT source_node FROM campus_paths WHERE path_type IN ('Corridor', 'Stairs')
    UNION
    SELECT target_node FROM campus_paths WHERE path_type IN ('Corridor', 'Stairs')
);

-- (e) Số thành phần liên thông của toàn bộ đồ thị (phải = 1)
SELECT 'e_all_graph_components', count(DISTINCT component)
FROM pgr_connectedComponents(
    'SELECT id, source_node AS source, target_node AS target, cost, reverse_cost FROM campus_paths'
);

-- (f) Đỉnh bậc 1 cách một đỉnh CHƯA NỐI CẠNH dưới 3 m theo 3D (phải = 0).
-- Bỏ qua láng giềng đã có cạnh để không đếm các đoạn đường ngắn hợp lệ.
-- Dùng ST_3DDWithin để cầu thang khác tầng không bị tính nhầm là hai đỉnh gần nhau.
WITH node_occurrences AS (
    SELECT source_node AS node_id, ST_StartPoint(geom) AS pt FROM campus_paths
    UNION ALL
    SELECT target_node AS node_id, ST_EndPoint(geom) AS pt FROM campus_paths
),
node_points AS (
    SELECT DISTINCT ON (node_id)
        node_id,
        ST_Transform(pt, 32648) AS geom_m
    FROM node_occurrences
    WHERE node_id IS NOT NULL
    ORDER BY node_id
),
degrees AS (
    SELECT node_id, count(*) AS degree
    FROM (
        SELECT source_node AS node_id FROM campus_paths
        UNION ALL
        SELECT target_node AS node_id FROM campus_paths
    ) endpoints
    GROUP BY node_id
),
dangling AS (
    SELECT np.node_id, np.geom_m
    FROM node_points np
    JOIN degrees d USING (node_id)
    WHERE d.degree = 1
)
SELECT 'f_dangling_nodes_near_vertex', count(DISTINCT a.node_id)
FROM dangling a
JOIN node_points b
  ON b.node_id <> a.node_id
 AND NOT EXISTS (
     SELECT 1
     FROM campus_paths cp
     WHERE (cp.source_node = a.node_id AND cp.target_node = b.node_id)
        OR (cp.source_node = b.node_id AND cp.target_node = a.node_id)
 )
 AND ST_3DDWithin(a.geom_m, b.geom_m, 3);
