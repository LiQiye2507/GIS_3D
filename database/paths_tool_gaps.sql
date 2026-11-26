-- Dùng bởi: python database/paths_tool.py fix
-- Tìm các cặp nút lối đi cách nhau 1,5–25 m, không có tòa nhà chắn giữa, nhưng trên mạng phải đi vòng > 2,5 lần
-- (và vòng thêm > 40 m). Nối tham lam từ cặp gần nhất, tính lại mỗi lần để không thêm đoạn thừa.
CREATE TEMP TABLE gap_nodes AS
SELECT DISTINCT ON (n) n, p FROM (
    SELECT source_node n, ST_StartPoint(geom) p FROM campus_paths WHERE path_type = 'Walkway'
    UNION ALL
    SELECT target_node, ST_EndPoint(geom) FROM campus_paths WHERE path_type = 'Walkway'
) s ORDER BY n;

CREATE TEMP TABLE gap_cand AS
SELECT a.n AS s, b.n AS t, ST_Distance(a.p::geography, b.p::geography) AS d, ST_MakeLine(a.p, b.p) AS g
FROM gap_nodes a JOIN gap_nodes b ON a.n < b.n AND ST_DWithin(a.p::geography, b.p::geography, 25)
WHERE ST_Distance(a.p::geography, b.p::geography) > 1.5
  -- đầu cụt sát tòa nhà là lối vào tòa: không nối ngang (thường sẽ băng qua bồn cây, bãi cỏ)
  AND NOT EXISTS (
      SELECT 1 FROM gap_nodes x
      JOIN buildings bl ON ST_DWithin(bl.geom::geography, x.p::geography, 3)
      WHERE x.n IN (a.n, b.n)
        AND (SELECT count(*) FROM campus_paths cp WHERE cp.source_node = x.n OR cp.target_node = x.n) = 1)
  AND NOT EXISTS (SELECT 1 FROM buildings bl WHERE ST_Intersects(ST_Buffer(bl.geom::geography, -1)::geometry, ST_MakeLine(a.p, b.p)));

CREATE TEMP TABLE gap_links (id serial, s bigint, t bigint, d float, g geometry);

DO $$
DECLARE r record;
BEGIN
    LOOP
        SELECT c.* INTO r FROM gap_cand c
        JOIN pgr_dijkstraCost(
            'SELECT id, source_node source, target_node target, cost, reverse_cost FROM campus_paths WHERE path_type = ''Walkway''
             UNION ALL SELECT -id, s, t, d, d FROM gap_links',
            'SELECT s AS source, t AS target FROM gap_cand', directed := false) n
          ON n.start_vid = c.s AND n.end_vid = c.t
        WHERE n.agg_cost > 2.5 * c.d AND n.agg_cost - c.d > 40
        ORDER BY c.d LIMIT 1;
        EXIT WHEN NOT FOUND;
        INSERT INTO gap_links (s, t, d, g) VALUES (r.s, r.t, r.d, r.g);
    END LOOP;
END $$;

SELECT COALESCE(json_agg(json_build_object(
    'd', round(d::numeric, 1),
    'coords', ST_AsGeoJSON(ST_Force3D(g), 7)::json -> 'coordinates') ORDER BY id), '[]')
FROM gap_links;
