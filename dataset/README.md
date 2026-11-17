# Dữ liệu khuôn viên UIT (`dataset/`)

Dữ liệu chia theo 3 mức: thô (`raw/`), trung gian (`interim/`) và chuẩn (`final/`). Ứng dụng chỉ dùng `final/`, thông qua các file seed trong `database/`.

```text
dataset/
├── raw/                    DỮ LIỆU GỐC – chỉ đọc, không sửa
│   ├── osm/                OpenStreetMap: buildings_osm, campus_boundary_osm, poi_osm, paths_osm (.geojson)
│   ├── school_docs/        Tài liệu trường: UIT_bo_du_lieu_tho.xlsx và các bảng tách ra
│   │                       (buildings_attributes.csv, rooms_by_floor.csv, floorplan_toa_C_layout.csv)
│   ├── images/             Sơ đồ tổng mặt bằng, sơ đồ tầng Tòa C, 6 ảnh chụp trên cao (anh_tren_cao/)
│   └── field_survey/       Khảo sát thực địa
│       ├── survey_buildings.csv, survey_floorplans.csv, survey_poi.csv
│       ├── building_floors_confirmed.csv   số tầng đã xác nhận
│       ├── toa_A_layout_digitized.csv      sơ đồ phòng Tòa A tầng 1–3 số hóa từ ảnh (mét, Bắc lên trên)
│       ├── photos/                         ảnh chụp sơ đồ, danh sách phòng, vị trí tiện ích
│       └── FIELD_SURVEY_GUIDE.md
├── interim/                Kết quả trung gian do script sinh (có thể xóa và chạy lại)
├── final/                  BỘ DỮ LIỆU CHUẨN – xem final/README.md
└── scripts/                Pipeline xử lý
```

## Pipeline

| Bước | Script | Đọc | Ghi |
|---|---|---|---|
| 1 | `fetch_uit_osm.py` (cần mạng) | Overpass API | `raw/osm/` |
| 2 | `filter_uit_osm.py` | `raw/osm/` | `interim/uit_campus_boundary`, `uit_buildings_osm_filtered`, `uit_paths_osm_filtered` |
| 3 | `prepare_draft_buildings.py` | `interim/uit_buildings_osm_filtered` | `interim/uit_buildings_draft` (gán mã tòa, thêm footprint tạm Tòa C) |
| 4 | `normalize_uit_rooms.py` | `raw/school_docs/` | `interim/toa_C_indoor_grid.csv` |
| 5 | `generate_indoor_polygons.py` | `interim/uit_buildings_draft`, `toa_C_indoor_grid.csv` | `interim/rooms_C_3d`, `floors_C_3d` |
| 6 | `model_outline_toa_a.py` (cần Node.js) | `frontend/models/campus.glb` | `interim/toa_A_model_outline` |
| 7 | `merge_dataset.py` | `raw/field_survey/`, `raw/school_docs/`, `interim/` | `final/` (và chép ranh giới sang `frontend/data/`) |
| 8 | `build_postgis_seed.py` | `final/` | `database/02_seed_uit_data.sql`, `database/03_toa_a_indoor.sql` |

Chạy lại từ bước 2 (từ thư mục gốc dự án):

```powershell
python dataset\scripts\filter_uit_osm.py
python dataset\scripts\prepare_draft_buildings.py
python dataset\scripts\normalize_uit_rooms.py
python dataset\scripts\generate_indoor_polygons.py --buildings-geojson dataset\interim\uit_buildings_draft.geojson
python dataset\scripts\model_outline_toa_a.py      # chỉ khi campus.glb thay đổi
python dataset\scripts\merge_dataset.py
```

Bước 8 và cách nạp CSDL: xem `final/README.md` và `docs/SETUP.md`.

CSV dùng mã UTF-8. Khi mở bằng Excel, vào Data > From Text/CSV và chọn UTF-8.

## Còn thiếu

- Footprint thật của Tòa C. Hiện footprint dựng tạm từ 3 điểm cửa OSM; cần số hóa lại trên ảnh vệ tinh.
- Tọa độ của bãi xe vòng số 8 (P004) và phòng y tế (P012).
- Ảnh vệ tinh có tọa độ. Ảnh trong `raw/images/` chỉ là sơ đồ minh họa không tỷ lệ và ảnh chụp xiên, nên không dùng làm nền GIS được.

## Lưu ý về nguồn

- OpenStreetMap: © OpenStreetMap contributors (ODbL).
- Ảnh `raw/images/anh_tren_cao/anh_2..6` có watermark "Kỳ Yêu Sài Gòn Photography". Quyền sử dụng chưa rõ, cần xin phép trước khi công bố.
- File Excel có vài chỗ số liệu không khớp. Chi tiết xem sheet `Luu_y_du_lieu`.
