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
