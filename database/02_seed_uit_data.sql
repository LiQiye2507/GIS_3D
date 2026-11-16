-- 1. Thêm dữ liệu các tòa nhà chính tại khuôn viên UIT (106.802 - 106.804, 10.869 - 10.871)
INSERT INTO buildings (building_code, name, total_floors, base_elevation, height_m, glb_model_url, description, geom)
VALUES
('A', 'Tòa nhà A - Hành chính & Ban Giám hiệu', 5, 0, 19.0, '/models/building_a.glb', 'Khối hành chính, phòng đào tạo và hội trường chính.',
 ST_GeomFromText('POLYGON((106.80260 10.87010, 106.80300 10.87010, 106.80300 10.87035, 106.80260 10.87035, 106.80260 10.87010))', 4326)),

('B', 'Tòa nhà B - Giảng đường & Khoa chuyên môn', 5, 0, 19.0, '/models/building_b.glb', 'Khu văn phòng các Khoa và phòng học lý thuyết.',
 ST_GeomFromText('POLYGON((106.80310 10.87010, 106.80355 10.87010, 106.80355 10.87035, 106.80310 10.87035, 106.80310 10.87010))', 4326)),

('C', 'Tòa nhà C - Giảng đường & Phòng Lab (Trọng điểm LOD 3)', 4, 0, 15.2, '/models/building_c.glb', 'Tòa nhà mô hình hóa chi tiết nội thất 3D từng tầng.',
 ST_GeomFromText('POLYGON((106.80260 10.86965, 106.80320 10.86965, 106.80320 10.86995, 106.80260 10.86995, 106.80260 10.86965))', 4326)),

('E', 'Tòa nhà E - Trung tâm Thực hành & Nghiên cứu', 12, 0, 45.6, '/models/building_e.glb', 'Tòa nhà cao tầng hiện đại gồm hệ thống phòng Lab và giảng đường.',
 ST_GeomFromText('POLYGON((106.80335 10.86955, 106.80380 10.86955, 106.80380 10.86995, 106.80335 10.86995, 106.80335 10.86955))', 4326)),

('LIB', 'Thư viện UIT', 3, 0, 11.4, '/models/library.glb', 'Không gian tự học, tra cứu tài liệu và thảo luận nhóm.',
 ST_GeomFromText('POLYGON((106.80215 10.86975, 106.80248 10.86975, 106.80248 10.87015, 106.80215 10.87015, 106.80215 10.86975))', 4326));

-- 2. Thêm dữ liệu Phòng học phân tầng (LOD 3 Indoor) bên trong Tòa C (building_id = 3)
-- Quy tắc độ cao: Tầng 1 (0.0 -> 3.5m), Tầng 2 (3.8 -> 7.3m), Tầng 3 (7.6 -> 11.1m), Tầng 4 (11.4 -> 14.9m)
INSERT INTO rooms (room_code, room_name, room_type, building_id, floor_number, capacity, base_height, extrude_height, equipment_info, geom)
VALUES
-- TẦNG 1 TÒA C
('C101', 'Giảng đường C101', 'Theory', 3, 1, 100, 0.0, 3.5, 'Máy chiếu Laser, Âm thanh hội trường, 2 Điều hòa',
 ST_GeomFromText('POLYGON((106.80262 10.86967, 106.80288 10.86967, 106.80288 10.86980, 106.80262 10.86980, 106.80262 10.86967))', 4326)),
('C102', 'Phòng học C102', 'Theory', 3, 1, 60, 0.0, 3.5, 'Máy chiếu HD, Bảng từ, Điều hòa',
 ST_GeomFromText('POLYGON((106.80290 10.86967, 106.80318 10.86967, 106.80318 10.86980, 106.80290 10.86980, 106.80290 10.86967))', 4326)),
('C103', 'Phòng Quản trị & Kỹ thuật Tầng 1', 'Office', 3, 1, 15, 0.0, 3.5, 'Hệ thống tủ mạng, Điện thoại nội bộ',
 ST_GeomFromText('POLYGON((106.80262 10.86983, 106.80288 10.86983, 106.80288 10.86993, 106.80262 10.86993, 106.80262 10.86983))', 4326)),
('WC-C1', 'Khu vệ sinh & Cầu thang Tầng 1', 'WC', 3, 1, 10, 0.0, 3.5, 'Cầu thang bộ, Thang máy, Khu vệ sinh',
 ST_GeomFromText('POLYGON((106.80290 10.86983, 106.80318 10.86983, 106.80318 10.86993, 106.80290 10.86993, 106.80290 10.86983))', 4326)),

-- TẦNG 2 TÒA C
('C201', 'Phòng Lab Hệ thống Thông tin C201', 'Lab', 3, 2, 45, 3.8, 7.3, '45 PC cấu hình cao, Server nội bộ, Máy chiếu',
 ST_GeomFromText('POLYGON((106.80262 10.86967, 106.80288 10.86967, 106.80288 10.86980, 106.80262 10.86980, 106.80262 10.86967))', 4326)),
('C202', 'Phòng Lab Mạng máy tính C202', 'Lab', 3, 2, 45, 3.8, 7.3, '45 PC, Bộ Router/Switch Cisco thực hành',
 ST_GeomFromText('POLYGON((106.80290 10.86967, 106.80318 10.86967, 106.80318 10.86980, 106.80290 10.86980, 106.80290 10.86967))', 4326)),
('C203', 'Phòng học lý thuyết C203', 'Theory', 3, 2, 60, 3.8, 7.3, 'Máy chiếu, Micro không dây, Điều hòa',
 ST_GeomFromText('POLYGON((106.80262 10.86983, 106.80288 10.86983, 106.80288 10.86993, 106.80262 10.86993, 106.80262 10.86983))', 4326)),
('WC-C2', 'Khu vệ sinh & Cầu thang Tầng 2', 'WC', 3, 2, 10, 3.8, 7.3, 'Cầu thang bộ, Thang máy, Khu vệ sinh',
 ST_GeomFromText('POLYGON((106.80290 10.86983, 106.80318 10.86983, 106.80318 10.86993, 106.80290 10.86993, 106.80290 10.86983))', 4326)),

-- TẦNG 3 TÒA C (Có phòng C302 để demo tìm kiếm bay tự động)
('C301', 'Phòng học C301', 'Theory', 3, 3, 70, 7.6, 11.1, 'Máy chiếu, Điều hòa, Bảng trượt',
 ST_GeomFromText('POLYGON((106.80262 10.86967, 106.80288 10.86967, 106.80288 10.86980, 106.80262 10.86980, 106.80262 10.86967))', 4326)),
('C302', 'Phòng thực hành GIS 3D & Viễn thám (C302)', 'Lab', 3, 3, 50, 7.6, 11.1, '50 Workstation GPU rời, QGIS, PostGIS Server',
 ST_GeomFromText('POLYGON((106.80290 10.86967, 106.80318 10.86967, 106.80318 10.86980, 106.80290 10.86980, 106.80290 10.86967))', 4326)),
('C303', 'Phòng Seminar Khoa Hệ thống Thông tin', 'Office', 3, 3, 30, 7.6, 11.1, 'Màn hình tương tác thông minh 75 inch',
 ST_GeomFromText('POLYGON((106.80262 10.86983, 106.80288 10.86983, 106.80288 10.86993, 106.80262 10.86993, 106.80262 10.86983))', 4326)),
('WC-C3', 'Khu vệ sinh & Cầu thang Tầng 3', 'WC', 3, 3, 10, 7.6, 11.1, 'Cầu thang bộ, Thang máy, Khu vệ sinh',
 ST_GeomFromText('POLYGON((106.80290 10.86983, 106.80318 10.86983, 106.80318 10.86993, 106.80290 10.86993, 106.80290 10.86983))', 4326));

-- 3. Thêm dữ liệu Điểm tiện ích (Amenities - PointZ)
INSERT INTO amenities (name, category, building_id, floor_number, elevation_z, open_hours, geom)
VALUES
('Căng tin Sinh viên UIT', 'Canteen', NULL, 1, 1.0, '06:30 - 18:00', ST_GeomFromText('POINT Z (106.80235 10.86945 1.0)', 4326)),
('Nhà giữ xe Sinh viên Khu A-B', 'Parking', NULL, 1, 0.5, '06:00 - 21:30', ST_GeomFromText('POINT Z (106.80220 10.87040 0.5)', 4326)),
('Trụ ATM ngoài Cổng A', 'ATM', NULL, 1, 1.0, '24/7', ST_GeomFromText('POINT Z (106.80197 10.87035 1.0)', 4326)), -- TODO: kiểm chứng thực địa (tọa độ ước lượng, chưa rõ ngân hàng)
('Cây nước uống nóng lạnh Tầng 1 Tòa C', 'Water', 3, 1, 1.2, '24/7', ST_GeomFromText('POINT Z (106.80289 10.86981 1.2)', 4326)),
('Cây nước uống nóng lạnh Tầng 3 Tòa C', 'Water', 3, 3, 8.8, '24/7', ST_GeomFromText('POINT Z (106.80289 10.86981 8.8)', 4326)),
('Phòng Y tế Sinh viên', 'Medical', 1, 1, 1.0, '07:30 - 16:30', ST_GeomFromText('POINT Z (106.80265 10.87015 1.0)', 4326));