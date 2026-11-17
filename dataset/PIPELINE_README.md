# Pipeline Chuẩn hóa & Sinh Dữ liệu Không gian UIT (`dataset/`)

Thư mục này chứa cả dữ liệu thô ban đầu lẫn các lớp dữ liệu đã xử lý tại nhà và biểu mẫu điền thực địa.

## Cấu trúc đã chuẩn bị sẵn
1. `02_buildings/osm_raw/`, `04_poi/osm_raw/`, `05_paths/osm_raw/`: Dữ liệu OpenStreetMap quanh khu vực ĐHQG (kéo qua `scripts/fetch_uit_osm.py`).
2. `processed/`:
   - `uit_campus_boundary.geojson`, `uit_buildings_osm_filtered.geojson`, `uit_poi_osm_filtered.geojson`, `uit_paths_osm_filtered.geojson`: Các lớp OSM đã lọc đúng trong ranh giới UIT (`scripts/filter_uit_osm.py`).
   - `osm_uit_preview.png`: Ảnh trực quan đối chiếu ranh giới, tòa nhà, lối đi và các điểm cửa OSM của UIT.
   - `rooms_normalized.csv`, `toa_C_indoor_grid.csv`, `data_quality_report.md`: Kết quả chuẩn hóa 171 phòng học + 67 khối lưới Tòa C (`scripts/normalize_uit_rooms.py`).
   - `uit_buildings_draft.geojson`, `rooms_C_3d.geojson`, `floors_C_3d.geojson`, `indoor_paths_C_3d.geojson`: Bản nháp thử nghiệm pipeline (Tòa C đang dựng tạm từ 3 điểm cửa OSM, chờ số liệu thực địa để chốt chính xác).
3. `field_survey/`:
   - `FIELD_SURVEY_GUIDE.md`: Hướng dẫn kiểm chứng & thu thập thực địa tại UIT.
   - `survey_buildings_template.csv`: Bảng kiểm chứng số tầng, chiều cao và 3 khối OSM chưa rõ tên.
   - `survey_floorplans_template.csv`: Mẫu ghi nhận sơ đồ tầng cho các tòa A, B, D, E, Thư viện.
   - `survey_poi_and_gcp_template.csv`: Bảng POI (đã điền sẵn tọa độ OSM cho các điểm đã biết) + danh sách điểm khống chế GCP & tiện ích còn thiếu (ATM, cây nước uống, phòng y tế).

## Quy trình chạy lại khi có dữ liệu thực địa mới
```bash
python dataset/scripts/normalize_uit_rooms.py
python dataset/scripts/generate_indoor_polygons.py --buildings-geojson dataset/processed/uit_buildings_verified.geojson --building-code C
python dataset/scripts/build_postgis_seed.py --buildings dataset/processed/uit_buildings_verified.geojson --outdoor-paths dataset/processed/uit_paths_osm_filtered.geojson --poi-csv dataset/field_survey/survey_poi_and_gcp_template.csv --out-sql database/02_seed_uit_data.sql
```

