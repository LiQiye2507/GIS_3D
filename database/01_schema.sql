-- Kích hoạt Extension PostGIS và pgRouting
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- Xóa bảng cũ nếu làm mới
DROP TABLE IF EXISTS campus_paths CASCADE;
DROP TABLE IF EXISTS amenities CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS floors CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;

-- 1. Bảng Tòa nhà (LOD 1 & LOD 2)
CREATE TABLE buildings (
    id SERIAL PRIMARY KEY,
    building_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    total_floors INT NOT NULL DEFAULT 1,
    base_elevation DOUBLE PRECISION DEFAULT 0.0,
    height_m DOUBLE PRECISION NOT NULL,
    glb_model_url VARCHAR(255),
    -- Điểm neo = góc Tây-Nam tòa, model_rotation tính bằng độ
    anchor_lng DOUBLE PRECISION,
    anchor_lat DOUBLE PRECISION,
    model_rotation DOUBLE PRECISION DEFAULT 0.0,
    description TEXT,
    geom GEOMETRY(Polygon, 4326) NOT NULL
);

-- 2. Bảng Mặt sàn tầng
CREATE TABLE floors (
    id SERIAL PRIMARY KEY,
    building_id INT REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INT NOT NULL,
    base_height DOUBLE PRECISION NOT NULL,
    ceiling_height DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Polygon, 4326) NOT NULL
);

-- 3. Bảng Phòng học / Lab (LOD 3 Indoor)
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(30) UNIQUE NOT NULL,
    room_name VARCHAR(150) NOT NULL,
    room_type VARCHAR(50) NOT NULL CHECK (room_type IN ('Theory','Lab','Library','Office','Corridor','Stairs','WC')), -- 'Theory', 'Lab', 'Library', 'Office', 'Corridor', 'Stairs', 'WC'
    building_id INT REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INT NOT NULL,
    capacity INT DEFAULT 50,
    base_height DOUBLE PRECISION NOT NULL,    -- (floor_number - 1) * 3.8
    extrude_height DOUBLE PRECISION NOT NULL, -- base_height + 3.5
    equipment_info TEXT,
    geom GEOMETRY(Polygon, 4326) NOT NULL
);

-- 4. Bảng Điểm tiện ích (POI 3D)
CREATE TABLE amenities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Canteen','ATM','Water','Parking','Medical','FireSafety')), -- 'Canteen', 'ATM', 'Water', 'Parking', 'Medical', 'FireSafety'
    building_id INT REFERENCES buildings(id) ON DELETE SET NULL,
    floor_number INT DEFAULT 1,
    elevation_z DOUBLE PRECISION DEFAULT 0.5,
    open_hours VARCHAR(100) DEFAULT '07:00 - 17:30',
    status VARCHAR(30) DEFAULT 'Active',
    geom GEOMETRY(PointZ, 4326) NOT NULL
);

-- 5. Bảng Lối đi bộ & Hành lang 3D
CREATE TABLE campus_paths (
    id SERIAL PRIMARY KEY,
    source_node INT,
    target_node INT,
    path_type VARCHAR(50) NOT NULL CHECK (path_type IN ('Walkway','Corridor','Stairs')), -- 'Walkway', 'Corridor', 'Stairs'
    floor_from INT DEFAULT 1,
    floor_to INT DEFAULT 1,
    length_m DOUBLE PRECISION,
    cost DOUBLE PRECISION GENERATED ALWAYS AS (CASE WHEN path_type = 'Stairs' THEN length_m * 2.5 ELSE length_m END) STORED,
    reverse_cost DOUBLE PRECISION GENERATED ALWAYS AS (CASE WHEN path_type = 'Stairs' THEN length_m * 2.5 ELSE length_m END) STORED,
    geom GEOMETRY(LineStringZ, 4326) NOT NULL
);

-- Tạo Spatial Index (R-Tree GiST) tăng tốc truy vấn không gian
CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom);
CREATE INDEX idx_rooms_geom ON rooms USING GIST (geom);
CREATE INDEX idx_amenities_geom ON amenities USING GIST (geom);
CREATE INDEX idx_paths_geom ON campus_paths USING GIST (geom);

-- Index B-tree cho định tuyến pgRouting
CREATE INDEX idx_paths_source ON campus_paths (source_node);
CREATE INDEX idx_paths_target ON campus_paths (target_node);