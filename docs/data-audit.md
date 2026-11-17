# Báo cáo khảo sát dữ liệu (Giai đoạn 1 – chỉ đọc)

Ngày khảo sát: 17/11/2026 · Nhánh: `data-consolidation` · Không sửa file nào trong quá trình khảo sát.

> Đường dẫn trong báo cáo này là cấu trúc cũ. Sau đó `dataset/` được tổ chức lại thành `raw/` (01–05, field_survey, Excel), `interim/` (processed) và `final/`. Xem `dataset/README.md`.

## 1. Danh mục file dữ liệu

CRS: tất cả GeoJSON đều là WGS84 (CRS84/EPSG:4326, thứ tự lng, lat). Không thấy hệ VN-2000 hoặc tọa độ bị đảo.

### 1.1 Dữ liệu thô (`dataset/01_*…05_*`, chỉ đọc)

| File | Định dạng | Số bản ghi | Trường chính | Nguồn |
|---|---|---|---|---|
| `01_raster/anh_tren_cao_1..6`, `so_do_tong_mat_bang`, `Toa_C_so_do` | ảnh | 8 | – | Ảnh vệ tinh/sơ đồ (tham khảo, không có georef) |
| `02_buildings/osm_raw/buildings_osm.geojson` | GeoJSON | 95 Polygon | osm_id, name, building, building:levels, height… | OSM Overpass (bbox rộng quanh trường) |
| `02_buildings/buildings_attributes.csv` | CSV | 7 (A, B, C, D, E, THUVIEN, NHA_PVSV) | mã, tên, số tầng, chức năng | Tài liệu trường/nhập tay |
| `02_buildings/campus_boundary_osm.geojson` | GeoJSON | 4 | osm_id, name, amenity | OSM |
| `03_floorplans/rooms_by_floor.csv` | CSV | 179 | building, floor, room_code, room_name, type | Danh sách phòng theo tầng (nhập tay) |
| `03_floorplans/floorplan_toa_C_layout.csv` | CSV | 67 | room_code, row, col, w, h | Bố cục lưới Tòa C (nhập tay) |
| `04_poi/poi_osm.geojson` | GeoJSON | 19 Point | osm_id, name, amenity | OSM |
| `04_poi/poi_coordinates.csv` | CSV | 8 | tên, loại – **không có lat/lon** | Nhập tay |
| `05_paths/paths_osm.geojson` | GeoJSON | 131 LineString | osm_id, highway, name | OSM |
| `UIT_bo_du_lieu_tho.xlsx` | Excel | các sheet trùng với CSV ở trên | – | Bản gộp nhập tay |

### 1.2 Khảo sát thực địa (`dataset/field_survey/`)

| File | Số bản ghi | Ghi chú |
|---|---|---|
| `survey_buildings_template.csv` | 10 | Mẫu, nhiều ô trống |
| `survey_floorplans_template.csv` | 59 | Phòng Tòa A tầng 1–3 (từ ảnh khảo sát) – được `database/03_toa_a_indoor.sql` dùng |
| `survey_poi_and_gcp_template.csv` | 16 (P001–P012, GCP01–04) | 10 dòng có tọa độ |
| `raw/` | ảnh + `so_do_toa_B_C_E.drawio` | Ảnh gốc, chưa kiểm chứng |

### 1.3 Dữ liệu đã xử lý (`dataset/processed/`)

| File | Số bản ghi | Ghi chú |
|---|---|---|
| `uit_buildings_osm_filtered.geojson` | 8 | A (259211695), B (327427158), D (693343290), E (693343289, levels 12), Căn tin (722732584, levels 2), 3 khối chưa rõ tên (490935520, 490935521, 1459032884) |
| `uit_buildings_draft.geojson` | 6 | Có thêm Tòa C tạm (đa giác 5 điểm, `provisional`) |
| `uit_campus_boundary.geojson` | 1 | **Trùng hệt** `frontend/data/campus_boundary.geojson` |
| `uit_paths_osm_filtered.geojson` | 33 | **Trùng hệt** `frontend/data/campus_paths.geojson` |
| `uit_poi_osm_filtered.geojson` | 14 | – |
| `rooms_C_3d.geojson` / `floors_C_3d.geojson` / `indoor_paths_C_3d.geojson` | 67 / 3 / 9 (có Z) | Sinh từ lưới Tòa C |
| `rooms_normalized.csv` | 168 | Chuẩn hoá từ `rooms_by_floor.csv` |
| `toa_C_indoor_grid.csv` | 67 | – |
| `seed_uit_draft_preview.sql` | 6/3/67/8/42 | Bản nháp cũ của seed |
| `data_quality_report.md`, `osm_uit_preview.png` | – | Báo cáo/ảnh xem trước cũ |

### 1.4 Dữ liệu trong `database/` và `frontend/`

| File | Nội dung | Được dùng bởi |
|---|---|---|
| `database/01_schema.sql` | 5 bảng + extension | nạp DB |
| `database/02_seed_uit_data.sql` | buildings 6, floors 3 (C), rooms 67 (C), amenities 6, campus_paths 33 | nạp DB (sinh bởi `build_postgis_seed.py`) |
| `database/03_toa_a_indoor.sql` | floors A 1–3 + 65 phòng/hành lang/cầu thang sinh bằng SQL từ footprint OSM | nạp DB |
| `database/04_campus_graph.sql` | Nối mạng lưới, thêm Corridor/Stairs | nạp DB, `/api/route` |
| `frontend/data/campus_boundary.geojson` | 1 | `app.js` (LOD 1) |
| `frontend/data/campus_paths.geojson` | 33 | **Không còn code nào dùng** |
| `frontend/data/campus_extras.geojson` | 7 | **Không còn code nào dùng** |
| `frontend/models/campus.glb` | Mô hình toàn trường (Heli Ton, CC BY 4.0) | `campus-scene.js` |
| `frontend/models/building_a.glb` | Mô hình Tòa A cũ | Chỉ còn trong cột `glb_model_url` của DB, seed 02 và `build_glb_toa_a.py`; frontend không tải |
| `backup_uit_campus.dump`, `uit_campus_final.dump` | Bản sao lưu DB | Không commit (`.gitignore`) |

Dữ liệu cứng trong code: `GATE_A`, `GATE_B`, `DEFAULT_CENTER` và `BUILDING_USER_DESCRIPTIONS` ở `frontend/app.js` (cổng trùng P006/P007). Tham số nắn mô hình (`GEO`, `HIDE_BOXES`) ở `frontend/campus-scene.js` (thuộc mô hình, không phải dữ liệu GIS).

### 1.5 CSDL đang chạy (`uit_campus`) – nguồn dữ liệu thực tế của ứng dụng

| Bảng | Số dòng | Chi tiết |
|---|---|---|
| buildings | 6 | A 3 tầng/11.4 m · B 9/34.2 · C 3/11.4 (tạm) · D 1/3.8 (tạm) · E 13/49.4 · NHA_PVSV 2/7.6 |
| floors | 6 | A 1–3, C 1–3 |
| rooms | 132 | A 36/12/17 theo tầng, C 20/23/24 |
| amenities | 6 | Canteen PVSV, Parking bắc A, Parking G E, Canteen E7.1, ATM cổng A, máy nước T1 A |
| campus_paths | 119 | Walkway 62, Corridor 53, Stairs 4 |

Kiểm tra: không có hình học lỗi (`ST_IsValid`), không trùng `room_code`.

## 2. Trùng lặp

- `processed/uit_campus_boundary.geojson` ≡ `frontend/data/campus_boundary.geojson`.
- `processed/uit_paths_osm_filtered.geojson` ≡ `frontend/data/campus_paths.geojson`.
- `UIT_bo_du_lieu_tho.xlsx` lặp lại nội dung các CSV.
- `rooms_normalized.csv` ↔ `rooms_by_floor.csv` (168 vs 179 dòng – bản chuẩn hoá đã bỏ 11 dòng).
- `toa_C_indoor_grid.csv` ↔ `floorplan_toa_C_layout.csv` (cùng 67 phòng C).
- `seed_uit_draft_preview.sql` là bản cũ của `database/02_seed_uit_data.sql`.
- POI P002 và P004 (bãi xe) có thể là cùng một điểm.

## 3. Xung đột

| Đối tượng | Xung đột |
|---|---|
| Tòa E – số tầng | OSM 12 · tài liệu trường 13 (tính cả tầng G) · DB 13 |
| Tòa D – số tầng | Không có nguồn nào; DB để tạm 1 tầng |
| NHA_PVSV – số tầng | Chỉ có OSM (2) |
| Tòa C – footprint | Không có trên OSM; đa giác tạm bị lệch về phía bắc so với ảnh vệ tinh |
| THUVIEN | CSV coi là tòa riêng; POI P009/OSM node 2645632780 đặt bên trong Tòa A |
| Phòng Tòa A | Danh sách phòng đầy đủ trong `survey_floorplans_template.csv` (theo ảnh sơ đồ), nhưng hình học trong `03_toa_a_indoor.sql` là các lát quạt giả lập, Thư viện bị đặt giữa khối chính; A.181–A.184 đúng ra là A.1B1–A.1B4; 12 phòng tầng 1 chưa có tên dù ảnh danh sách có |
| Tiện ích | DB 6 · bản nháp 8 · survey 12 POI |
| 3 khối OSM không tên | 490935520, 490935521, 1459032884 – chỉ có trong `campus_extras.geojson` |

## 4. Thiếu dữ liệu

- `poi_coordinates.csv`: cả 8 dòng không có tọa độ.
- `survey_poi_and_gcp_template.csv`: 6/16 dòng không có tọa độ.
- Tòa D: số tầng, chiều cao.
- Tòa C: footprint thật.
- Giờ mở cửa/trạng thái của đa số tiện ích.
- `dataset/PIPELINE_README.md` nhắc tới `uit_buildings_verified.geojson` nhưng file này không tồn tại.

## 5. Lỗi dữ liệu thuộc tính

- Mã phòng nghi sai trong `rooms_by_floor.csv`: C112, C114, C215; nhãn WB/LV không theo chuẩn; E4.1, E11.5 dùng dấu chấm khác quy ước còn lại.
- Hình học: không có vòng hở hay đa giác < 4 điểm trong mọi GeoJSON; không có hình học lỗi trong DB.

## 6. Quyết định đã duyệt (17/11/2026)

- Schema chuẩn, thứ tự ưu tiên nguồn và vị trí thư mục: xem `dataset/final/README.md`.
- Tòa E 13 tầng (tính tầng G). Tòa D 1 tầng.
- Thư viện là cánh phía Bắc của Tòa A, chỉ có tầng 1–2; tầng 3 Tòa A có hội trường tròn ở giữa, các phòng A.301–A.325 (số lẻ) bao quanh.
- Phòng Tòa A dựng lại theo ảnh sơ đồ khảo sát (`field_survey/toa_A_layout_digitized.csv`).
