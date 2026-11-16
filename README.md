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
- **CSDL:** PostgreSQL 17 + PostGIS + pgRouting (cài trực tiếp trên Windows, không Docker)
- **Backend:** Python FastAPI, Psycopg2 – trả GeoJSON FeatureCollection
- **Frontend:** HTML/CSS/Vanilla JS, MapLibre GL JS + Three.js (custom 3D layer)

Toàn bộ hình học lưu ở `EPSG:4326`; khoảng cách luôn tính bằng `::geography` (mét).

## Cấu trúc thư mục
```text
database/   01_schema.sql (5 bảng), 02_seed_uit_data.sql
dataset/    dữ liệu thô (raster, OSM, mặt bằng tầng, POI, đường) + processed/ + scripts/
backend/    FastAPI (main.py, db.py)
frontend/   index.html, style.css, app.js, models/*.glb
docs/       SETUP.md (hướng dẫn cài đặt)
```

## Chạy nhanh
Chi tiết từng bước xem [docs/SETUP.md](docs/SETUP.md).

```powershell
# 1. Tạo DB và nạp dữ liệu (file SQL có tiếng Việt → bắt buộc UTF8)
$env:PGCLIENTENCODING = "UTF8"
$env:PGPASSWORD = "<mật_khẩu_postgres>"
psql -U postgres -c "CREATE DATABASE uit_campus;"
psql -U postgres -d uit_campus -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting;"
psql -U postgres -d uit_campus -f database\01_schema.sql
psql -U postgres -d uit_campus -f database\02_seed_uit_data.sql

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

Yêu cầu: PostgreSQL 17 + PostGIS Bundle (có pgRouting) cài qua Stack Builder, `psql` có trong PATH. Gặp lỗi xem mục "Lỗi thường gặp" trong [docs/SETUP.md](docs/SETUP.md).

## Thông tin
Đồ án môn **IE402 – Hệ thống thông tin địa lý 3D**, Trường ĐH Công nghệ Thông tin – ĐHQG-HCM.
