# UIT 3D Smart Campus WebGIS (IE402)

Hệ thống WebGIS 3D tra cứu phòng học theo tầng, tiện ích xung quanh và dẫn đường liên tầng trong khuôn viên Trường Đại học Công nghệ Thông tin (UIT – ĐHQG-HCM).

- **Toàn khuôn viên:** LOD 0 – LOD 2 (ranh giới, khối nhà, model `.glb`).
- **Indoor 3D (LOD 3):** bóc tách từng tầng cho **Tòa A**.

## Tính năng chính
| API | Chức năng |
|---|---|
| `GET /api/buildings` | Khối nhà toàn trường (chiều cao, model 3D) |
| `GET /api/rooms` | Phòng theo tòa & tầng (Floor Switcher) |
| `GET /api/search?q=` | Tìm phòng theo mã/tên, bay tới vị trí |
| `GET /api/amenities/nearby` | Tiện ích trong bán kính (mét) |
| `GET /api/route` | Dẫn đường liên tầng bằng pgRouting |

## Công nghệ
- **CSDL:** PostgreSQL 16 + PostGIS + pgRouting (cài trực tiếp trên Windows, không Docker)
- **Backend:** Python FastAPI, Psycopg2 – trả GeoJSON FeatureCollection
- **Frontend:** HTML/CSS/Vanilla JS, MapLibre GL JS + Three.js (custom 3D layer)

Toàn bộ hình học lưu ở `EPSG:4326`; khoảng cách luôn tính bằng `::geography` (mét).

## Cấu trúc thư mục
```text
database/   01_schema.sql, 02_seed_uit_data.sql, 03_toa_a_indoor.sql, 04_campus_graph.sql, checks.sql
dataset/    bộ dữ liệu chuẩn GeoJSON: buildings, floors, rooms, amenities, paths, campus_boundary
backend/    FastAPI (main.py, db.py, tests/test_api.py)
frontend/   index.html, style.css, app.js, campus-scene.js, models/campus.glb (mô hình toàn trường – Heli Ton, CC BY 4.0)
docs/       SETUP.md (hướng dẫn cài đặt)
```

## Chạy nhanh
Chi tiết từng bước xem [docs/SETUP.md](docs/SETUP.md).

```powershell
# 1. Tạo DB và nạp dữ liệu (file SQL có tiếng Việt → bắt buộc UTF8; nạp lại thì chạy lại cả 01→04)
$env:PGCLIENTENCODING = "UTF8"
$env:PGPASSWORD = "<mật_khẩu_postgres>"
psql -U postgres -c "CREATE DATABASE uit_campus;"
psql -U postgres -d uit_campus -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting;"
psql -U postgres -d uit_campus -f database\01_schema.sql
psql -U postgres -d uit_campus -f database\02_seed_uit_data.sql
psql -U postgres -d uit_campus -f database\03_toa_a_indoor.sql
psql -U postgres -d uit_campus -f database\04_campus_graph.sql

# 2. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env     # rồi sửa mật khẩu trong DATABASE_URL
uvicorn main:app --reload --port 8000   # tài liệu API: http://localhost:8000/docs

# 3. Frontend (cửa sổ khác)
cd frontend
python -m http.server 5500   # mở http://localhost:5500 (không mở index.html bằng file://)
```

Yêu cầu: PostgreSQL 16 + PostGIS Bundle (có pgRouting) cài qua Stack Builder, `psql` có trong PATH. Gặp lỗi xem mục "Lỗi thường gặp" trong [docs/SETUP.md](docs/SETUP.md).

## Kiểm thử
- **API (T01–T05):** `backend\.venv\Scripts\python -m pytest backend/tests -q`
- **CSDL & pgRouting (T06):** `psql -U postgres -d uit_campus -tA -f database\checks.sql` (kiểm tra `ST_IsValid` và tuyến Cổng A → A.305)
- **Giao diện (T07):** kiểm tra thủ công trên trình duyệt: chuyển đổi LOD 1 ↔ 2 ↔ 3, lọc tầng T1–T3, không lỗi Console.

## Dữ liệu
- Bộ dữ liệu chuẩn: 6 lớp GeoJSON trong `dataset/` (EPSG:4326), đã nạp sẵn vào các file seed trong `database/`.
- Footprint tòa nhà và lối đi lấy từ OpenStreetMap.
- Phòng Tòa A tầng 1–3 lấy theo ảnh sơ đồ và danh sách phòng khảo sát thực địa. Thư viện là cánh phía Bắc, chỉ có tầng 1–2. Tầng 3 có hội trường tròn ở giữa.
- Vị trí phòng được đặt theo khung khối nhà của mô hình 3D, nên chỉ gần đúng (chưa đo đạc).

## Thông tin
Đồ án môn **IE402 – Hệ thống thông tin địa lý 3D**, Trường ĐH Công nghệ Thông tin – ĐHQG-HCM.
