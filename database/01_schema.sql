-- Kích hoạt Extension PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

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
    room_type VARCHAR(50) NOT NULL, -- 'Theory', 'Lab', 'Office', 'WC'
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
    category VARCHAR(50) NOT NULL, -- 'Canteen', 'ATM', 'Water', 'Parking', 'WC'
    building_id INT REFERENCES buildings(id) ON DELETE SET NULL,
    floor_number INT DEFAULT 1,
    elevation_z DOUBLE PRECISION DEFAULT 0.5,
    open_hours VARCHAR(100) DEFAULT '07:00 - 17:30',
    geom GEOMETRY(PointZ, 4326) NOT NULL
);

-- 5. Bảng Lối đi bộ & Hành lang 3D
CREATE TABLE campus_paths (
    id SERIAL PRIMARY KEY,
    path_type VARCHAR(50) NOT NULL, -- 'Walkway', 'Corridor', 'Stairs'
    floor_from INT DEFAULT 1,
    floor_to INT DEFAULT 1,
    length_m DOUBLE PRECISION,
    geom GEOMETRY(LineStringZ, 4326) NOT NULL
);

-- Tạo Spatial Index (R-Tree GiST) tăng tốc truy vấn không gian
CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom);
CREATE INDEX idx_rooms_geom ON rooms USING GIST (geom);
CREATE INDEX idx_amenities_geom ON amenities USING GIST (geom);
CREATE INDEX idx_paths_geom ON campus_paths USING GIST (geom);