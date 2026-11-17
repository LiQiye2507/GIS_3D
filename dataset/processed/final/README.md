# Bộ dữ liệu chuẩn UIT (`dataset/processed/final/`)

Đây là nguồn dữ liệu duy nhất cho CSDL và frontend. Mọi file ở đây do `dataset/scripts/merge_dataset.py` sinh ra, **không sửa tay**. Muốn đổi dữ liệu thì sửa nguồn (`dataset/field_survey/`, `dataset/processed/*` cấp dưới) rồi chạy lại script.

- **Hệ tọa độ:** EPSG:4326 (WGS84), thứ tự `[lng, lat]`.
- **Đơn vị:** mét.
- **Cao độ:** tầng cao 3.8 m, phòng 3.5 m, hành lang 0.2 m.

## Các lớp

| File | ID duy nhất | Trường bắt buộc | Ghi chú |
|---|---|---|---|
| `buildings.geojson` | `building_code` | name, total_floors, height_m, Polygon | `floors_source` ghi nguồn số tầng |
| `floors.geojson` | `id` = `{tòa}-{tầng}` | building_code, floor_number, base_height, ceiling_height | Tòa A: tầng 1–2 gồm cả cánh Thư viện, tầng 3 chỉ khối chính |
| `rooms.geojson` | `room_code` | building_code, floor_number, room_type, base_height, extrude_height | `room_type` ∈ Theory, Lab, Library, Office, Corridor, Stairs, WC |
| `amenities.geojson` | `id` (P001…) | name, category, floor_number, elevation_z, PointZ | Chỉ gồm POI có tọa độ và thuộc loại Canteen, ATM, Water, Parking, Medical, FireSafety |
| `paths.geojson` | `id` = `osm_{way}` | path_type, floor_from, floor_to, length_m | Lối đi ngoài trời; hành lang và cầu thang trong nhà do `database/04_campus_graph.sql` sinh |
| `campus_boundary.geojson` | `id` | name | Được chép sang `frontend/data/` |
| `merge_report.md` | – | – | Số lượng trước/sau, kết quả kiểm tra, các vấn đề còn lại |

Mọi đối tượng có thêm 3 trường:
- `source`: osm, field_survey, campus.glb outline, generated hoặc provisional.
- `source_ref`: file hoặc OSM id gốc.
- `verified`: đã được xác nhận thực tế hay chưa.

## Thứ tự ưu tiên nguồn

1. **Hình học:** khảo sát thực địa > OSM > bản nháp provisional.
2. **Số tầng:** `field_survey/building_floors_confirmed.csv` > `field_survey/survey_buildings_template.csv` > `02_buildings/buildings_attributes.csv` > OSM.
3. **Phòng:** `field_survey/survey_floorplans_template.csv` > tên đọc từ ảnh danh sách phòng (`field_survey/raw/`).

Thiếu dữ liệu thì để `null` và ghi vào `merge_report.md`.

## Tòa A (LOD 3)

- **Nguồn bố cục phòng:** lấy từ ảnh sơ đồ Tầng 1–3 trong `field_survey/raw/`. Kết quả số hóa nằm ở `field_survey/toa_A_layout_digitized.csv`, đơn vị mét, Bắc lên trên, gốc tọa độ là tâm khối chính.
  - Ảnh Tầng 1 được xoay 90° theo chiều kim đồng hồ để khớp Tầng 2–3 (A.101 nằm dưới A.201, các khối cầu thang trùng nhau).
- **Đặt lên bản đồ:** khung khối chính và cánh Thư viện lấy từ đường viền mái của mô hình `frontend/models/campus.glb`, mô hình này đã nắn theo ảnh vệ tinh.
  - Đường viền do `dataset/scripts/model_outline_toa_a.py` sinh ra (cần Node.js), lưu ở `processed/toa_A_model_outline.geojson`.
  - Vị trí từng phòng là **gần đúng**, dù thứ tự và mã phòng đúng theo sơ đồ.

## Chạy lại toàn bộ

```powershell
python dataset\scripts\model_outline_toa_a.py      # chỉ khi mô hình campus.glb thay đổi
python dataset\scripts\merge_dataset.py
$F = "dataset\processed\final"
python dataset\scripts\build_postgis_seed.py --buildings $F\buildings.geojson --floors $F\floors.geojson --rooms $F\rooms.geojson --amenities $F\amenities.geojson --outdoor-paths $F\paths.geojson --exclude-building A --out-sql database\02_seed_uit_data.sql
python dataset\scripts\build_postgis_seed.py --floors $F\floors.geojson --rooms $F\rooms.geojson --only-building A --out-sql database\03_toa_a_indoor.sql
```

Sau đó nạp lại CSDL theo `docs/SETUP.md`: chạy `01` → `02` → `03` → `04`, rồi chạy `checks.sql`.
