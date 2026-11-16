-- Nguồn dữ liệu: footprint Tòa A (OSM) và danh sách phòng Tòa A (dataset/field_survey/survey_floorplans_template.csv)
-- TODO: kiểm chứng thực địa (vị trí phòng giả lập theo dải quanh chu vi)

DELETE FROM rooms WHERE building_id = (SELECT id FROM buildings WHERE building_code = 'A');
DELETE FROM floors WHERE building_id = (SELECT id FROM buildings WHERE building_code = 'A');

-- 1. Chèn 3 mặt sàn tầng 1-3 Tòa A (cao độ trần: base_height + 3.5 m)
WITH bld AS (
    SELECT id AS building_id, ST_Transform(geom, 32648) AS fp
    FROM buildings
    WHERE building_code = 'A'
),
outer_floor AS (
    SELECT
        b.building_id,
        ST_Force2D(ST_Transform(o.geom, 4326)) AS geom
    FROM bld b
    CROSS JOIN LATERAL (
        SELECT d.geom
        FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(ST_Buffer(b.fp, -0.5)), 3)) AS d
        ORDER BY ST_Area(d.geom) DESC
        LIMIT 1
    ) o
)
INSERT INTO floors (building_id, floor_number, base_height, ceiling_height, geom)
SELECT
    f.building_id,
    gs AS floor_number,
    (gs - 1) * 3.8 AS base_height,
    (gs - 1) * 3.8 + 3.5 AS ceiling_height,
    f.geom
FROM outer_floor f
CROSS JOIN generate_series(1, 3) AS gs;

-- 2. Chèn các phòng, hành lang, cầu thang và khối giữa Tòa A tầng 1-3
WITH bld AS (
    SELECT id AS building_id, ST_Transform(geom, 32648) AS fp
    FROM buildings
    WHERE building_code = 'A'
),
zones AS (
    SELECT
        b.building_id,
        ST_X(ST_Centroid(b.fp)) AS cx,
        ST_Y(ST_Centroid(b.fp)) AS cy,
        ST_Difference(o.geom, ST_Buffer(b.fp, -8.0)) AS room_band,
        c.geom AS corridor_poly,
        ctr.geom AS center_poly
    FROM bld b
    CROSS JOIN LATERAL (
        SELECT d.geom
        FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(ST_Buffer(b.fp, -0.5)), 3)) AS d
        ORDER BY ST_Area(d.geom) DESC
        LIMIT 1
    ) o
    CROSS JOIN LATERAL (
        SELECT d.geom
        FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(ST_Difference(ST_Buffer(b.fp, -8.0), ST_Buffer(b.fp, -10.5))), 3)) AS d
        ORDER BY ST_Area(d.geom) DESC
        LIMIT 1
    ) c
    CROSS JOIN LATERAL (
        SELECT d.geom
        FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(ST_Buffer(b.fp, -10.5)), 3)) AS d
        ORDER BY ST_Area(d.geom) DESC
        LIMIT 1
    ) ctr
),
survey_rooms AS (
    SELECT
        ROW_NUMBER() OVER () AS seq,
        v.room_code,
        COALESCE(NULLIF(v.room_name, ''), 'Phòng ' || v.room_code) AS room_name,
        v.room_type,
        v.floor_number,
        v.capacity
    FROM (VALUES
        -- Tầng 1
        ('A.101', 'Phòng Công tác sinh viên', 'Office', 1, NULL::int),
        ('A.102', 'Phòng Đào tạo Đại học chính quy', 'Office', 1, NULL::int),
        ('A.103', 'Phòng Y tế', 'Office', 1, NULL::int),
        ('A.104', 'Phòng Đào tạo Đại học từ xa', 'Office', 1, NULL::int),
        ('A.105', 'Phòng Tổ chức - Hành chính', 'Office', 1, NULL::int),
        ('A.106', 'Phòng học chương trình tiên tiến', 'Theory', 1, NULL::int),
        ('A.107', 'Phòng Tổ chức - Hành chính', 'Office', 1, NULL::int),
        ('A.108', 'Phòng Quản trị thiết bị', 'Office', 1, NULL::int),
        ('A.109', 'Phòng Phó hiệu trưởng', 'Office', 1, NULL::int),
        ('A.110', 'Phòng Thí nghiệm Hệ thống thông tin', 'Lab', 1, NULL::int),
        ('A.111', 'Phòng Kế hoạch - Tài chính', 'Office', 1, NULL::int),
        ('A.112', 'Phòng họp', 'Office', 1, NULL::int),
        ('A.113', 'Phòng Kế hoạch - Tài chính', 'Office', 1, NULL::int),
        ('A.114', 'Phòng họp', 'Office', 1, NULL::int),
        ('A.115', 'Phòng Hiệu trưởng', 'Office', 1, NULL::int),
        ('A.116', 'Phòng Thí nghiệm truyền thông Đa phương tiện', 'Lab', 1, NULL::int),
        ('A.117', 'Phòng Phó hiệu trưởng', 'Office', 1, NULL::int),
        ('A.118', 'Phòng Thanh tra - Pháp chế - Đảm bảo chất lượng', 'Office', 1, NULL::int),
        ('A.119', 'Phòng Phó hiệu trưởng', 'Office', 1, NULL::int),
        ('A.120', 'Phòng máy Chương trình tiên tiến', 'Lab', 1, NULL::int),
        ('A.121', NULL, 'Office', 1, NULL::int),
        ('A.123', NULL, 'Office', 1, NULL::int),
        ('A.125', NULL, 'Office', 1, NULL::int),
        ('A.127', NULL, 'Office', 1, NULL::int),
        ('A.181', NULL, 'Office', 1, NULL::int),
        ('A.182', NULL, 'Office', 1, NULL::int),
        ('A.183', NULL, 'Office', 1, NULL::int),
        ('A.184', NULL, 'Office', 1, NULL::int),
        ('A.1A2', NULL, 'Office', 1, NULL::int),
        ('A.1A4', NULL, 'Office', 1, NULL::int),
        ('A.1A6', NULL, 'Office', 1, NULL::int),
        ('A.1A8', NULL, 'Office', 1, NULL::int),
        ('A.TV', 'Thư viện UIT', 'Library', 1, NULL::int),
        -- Tầng 2
        ('A.201', 'Phòng trưởng phòng Công tác sinh viên', 'Office', 2, NULL::int),
        ('A.203', 'Phòng trưởng phòng Dữ liệu & CNTT', 'Office', 2, NULL::int),
        ('A.205', 'Phòng thực hành Vật lý', 'Lab', 2, NULL::int),
        ('A.207', 'Phòng Dữ liệu & CNTT', 'Office', 2, NULL::int),
        ('A.209', 'Trung tâm Công nghệ Đào tạo trực tuyến', 'Office', 2, NULL::int),
        ('A.211', 'Văn phòng Công đoàn', 'Office', 2, NULL::int),
        ('A.213', 'Phòng thực hành khoa Kỹ thuật máy tính', 'Lab', 2, NULL::int),
        ('A.215', 'Phòng Dữ liệu & CNTT', 'Office', 2, NULL::int),
        ('A.TV2', 'Thư viện UIT', 'Library', 2, NULL::int),
        -- Tầng 3
        ('A.301', 'Phòng học A.301', 'Theory', 3, 30),
        ('A.303', 'Phòng học A.303', 'Theory', 3, NULL::int),
        ('A.305', 'Phòng học A.305', 'Theory', 3, 30),
        ('A.307', 'Phòng học A.307', 'Theory', 3, 30),
        ('A.309', 'Phòng học A.309', 'Theory', 3, 30),
        ('A.311', 'Phòng học A.311', 'Theory', 3, 25),
        ('A.313', 'Phòng học A.313', 'Theory', 3, NULL::int),
        ('A.315', 'Phòng học A.315', 'Theory', 3, 50),
        ('A.317', 'Phòng học A.317', 'Theory', 3, NULL::int),
        ('A.319', 'Phòng học A.319', 'Theory', 3, NULL::int),
        ('A.321', 'Phòng học A.321', 'Theory', 3, NULL::int),
        ('A.323', 'Phòng học A.323', 'Theory', 3, 30),
        ('A.325', 'Phòng học A.325', 'Theory', 3, 48),
        ('A.HT', 'Hội trường Tòa A', 'Theory', 3, 300)
    ) AS v(room_code, room_name, room_type, floor_number, capacity)
),
perim_indexed AS (
    SELECT
        room_code,
        room_name,
        room_type,
        floor_number,
        capacity,
        ROW_NUMBER() OVER (PARTITION BY floor_number ORDER BY seq) AS idx,
        COUNT(*) OVER (PARTITION BY floor_number) AS n,
        CEIL(COUNT(*) OVER (PARTITION BY floor_number) / 2.0)::int AS half
    FROM survey_rooms
    WHERE room_code NOT IN ('A.TV', 'A.TV2', 'A.HT')
),
sector_specs AS (
    SELECT
        room_code,
        room_name,
        room_type,
        floor_number,
        capacity,
        CASE
            WHEN idx <= half THEN 8.0 + (180.0 - 8.0) * (idx - 1) / half
            ELSE 188.0 + (360.0 - 188.0) * (idx - half - 1) / (n - half)
        END AS a1,
        CASE
            WHEN idx <= half THEN 8.0 + (180.0 - 8.0) * idx / half
            ELSE 188.0 + (360.0 - 188.0) * (idx - half) / (n - half)
        END AS a2
    FROM perim_indexed
    UNION ALL
    SELECT
        'A.CT1-' || f,
        'Cầu thang 1 tầng ' || f,
        'Stairs',
        f,
        NULL::int,
        0.0,
        8.0
    FROM generate_series(1, 3) AS f
    UNION ALL
    SELECT
        'A.CT2-' || f,
        'Cầu thang 2 tầng ' || f,
        'Stairs',
        f,
        NULL::int,
        180.0,
        188.0
    FROM generate_series(1, 3) AS f
),
sector_rooms AS (
    SELECT
        s.room_code,
        s.room_name,
        s.room_type,
        z.building_id,
        s.floor_number,
        s.capacity,
        (s.floor_number - 1) * 3.8 AS base_height,
        (s.floor_number - 1) * 3.8 + 3.5 AS extrude_height,
        ST_Force2D(ST_Transform(clipped.geom, 4326)) AS geom
    FROM sector_specs s
    CROSS JOIN zones z
    CROSS JOIN LATERAL (
        SELECT ST_SetSRID(
            ST_MakePolygon(
                ST_MakeLine(
                    ARRAY[ST_MakePoint(z.cx, z.cy)]
                    || ARRAY(
                        SELECT ST_MakePoint(
                            z.cx + 200.0 * sin(radians(s.a1 + (s.a2 - s.a1) * g / k.steps)),
                            z.cy + 200.0 * cos(radians(s.a1 + (s.a2 - s.a1) * g / k.steps))
                        )
                        FROM LATERAL (SELECT GREATEST(4, CEIL((s.a2 - s.a1) / 2.0)::int) AS steps) k
                        CROSS JOIN generate_series(0, k.steps) AS g
                    )
                    || ARRAY[ST_MakePoint(z.cx, z.cy)]
                )
            ),
            32648
        ) AS sector_geom
    ) sec
    CROSS JOIN LATERAL (
        SELECT d.geom
        FROM ST_Dump(ST_CollectionExtract(ST_MakeValid(ST_Intersection(z.room_band, sec.sector_geom)), 3)) AS d
        ORDER BY ST_Area(d.geom) DESC
        LIMIT 1
    ) clipped
),
center_rooms AS (
    SELECT
        sr.room_code,
        sr.room_name,
        sr.room_type,
        z.building_id,
        sr.floor_number,
        sr.capacity,
        (sr.floor_number - 1) * 3.8 AS base_height,
        (sr.floor_number - 1) * 3.8 + 3.5 AS extrude_height,
        ST_Force2D(ST_Transform(z.center_poly, 4326)) AS geom
    FROM survey_rooms sr
    CROSS JOIN zones z
    WHERE sr.room_code IN ('A.TV', 'A.TV2', 'A.HT')
),
corridor_rooms AS (
    SELECT
        'A.HL' || f AS room_code,
        'Hành lang tầng ' || f AS room_name,
        'Corridor' AS room_type,
        z.building_id,
        f AS floor_number,
        NULL::int AS capacity,
        (f - 1) * 3.8 AS base_height,
        (f - 1) * 3.8 + 0.2 AS extrude_height,
        ST_Force2D(ST_Transform(z.corridor_poly, 4326)) AS geom
    FROM generate_series(1, 3) AS f
    CROSS JOIN zones z
)
INSERT INTO rooms (room_code, room_name, room_type, building_id, floor_number, capacity, base_height, extrude_height, geom)
SELECT room_code, room_name, room_type, building_id, floor_number, capacity, base_height, extrude_height, geom
FROM (
    SELECT * FROM sector_rooms
    UNION ALL
    SELECT * FROM center_rooms
    UNION ALL
    SELECT * FROM corridor_rooms
) all_rooms;
