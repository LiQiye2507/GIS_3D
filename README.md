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
backend/    FastAPI, chia theo lớp:
            main.py (tạo app, CORS, gắn router) · routes/api.py (URL -> controller)
            controllers/ (nhận request, kiểm tra tham số) · services/ (truy vấn PostGIS, pgRouting)
            models/enums.py (giá trị loại phòng/tiện ích) · config/settings.py (.env)
            utils/ (db, geojson, text) · middlewares/errors.py (lỗi CSDL) · tests/test_api.py
frontend/   index.html, style.css, models/uit_campus.glb (mô hình toàn trường tách theo tòa, nén Draco –
            dựng từ mô hình của Heli Ton, CC BY 4.0)
            js/ (ES module, mỗi chức năng một file): main.js (điểm vào), config, state, dom, utils, map,
                intro, camera, layers (LOD, tầng, ánh sáng), buildings, rooms, search, amenities,
                nearest, route, share, geolocate, query, measure
            js/campus/: scene.js (lớp Three.js nạp uit_campus.glb), geo.js (nắn tọa độ), palette.js (ánh sáng)
Models_3D/scripts/  dựng model tách tòa (01–03, chạy trong Blender), 04_align_gis_to_model.py (nắn
            dataset/ và database/ theo model), 05_export_web_glb.py (xuất bản nén cho frontend).
            File model nguồn (.blend, .glb) không đưa lên repo.
docs/       features.md (danh sách chức năng, cách dùng, giới hạn)
```

## Cài đặt & chạy (Windows, không Docker)

### 1. Cài PostgreSQL + PostGIS + pgRouting (~20–30 phút)

1. Tải **PostgreSQL 16** (bộ cài EDB): https://www.postgresql.org/download/windows/
2. Chạy bộ cài:
   - Giữ các thành phần mặc định (PostgreSQL Server, pgAdmin 4, Command Line Tools, **Stack Builder**).
   - Đặt mật khẩu cho user `postgres` và **ghi lại**. Giữ port `5432`.
3. Khi cài xong, Stack Builder tự mở (hoặc mở từ Start Menu):
   - Chọn server `PostgreSQL 16 on port 5432`.
   - Mục **Spatial Extensions** → tick **PostGIS 3.x Bundle for PostgreSQL 16** (gói này có sẵn **pgRouting**).
   - Cài với lựa chọn mặc định. Nếu được hỏi tạo spatial database mẫu thì chọn **No**.
4. Thêm `psql` vào PATH (PowerShell, chỉ làm một lần, sau đó mở lại terminal):
   ```powershell
   $u = [Environment]::GetEnvironmentVariable("Path", "User")
   [Environment]::SetEnvironmentVariable("Path", "$u;C:\Program Files\PostgreSQL\16\bin", "User")
   ```
5. Kiểm tra:
   ```powershell
   psql --version
   ```

### 2. Tạo database & nạp dữ liệu

File SQL có tiếng Việt (UTF-8), nên phải đặt encoding cho psql trước khi chạy:

```powershell
$env:PGCLIENTENCODING = "UTF8"
$env:PGPASSWORD = "<mật_khẩu_postgres>"

psql -U postgres -c "CREATE DATABASE uit_campus;"
psql -U postgres -d uit_campus -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting;"
psql -U postgres -d uit_campus -f database\01_schema.sql
psql -U postgres -d uit_campus -f database\02_seed_uit_data.sql
psql -U postgres -d uit_campus -f database\03_toa_a_indoor.sql
psql -U postgres -d uit_campus -f database\04_campus_graph.sql
psql -U postgres -d uit_campus -tA -f database\checks.sql
```

Kiểm chứng:

```powershell
psql -U postgres -d uit_campus -c "SELECT postgis_version(), pgr_version();"
psql -U postgres -d uit_campus -c "SELECT 'buildings', count(*) FROM buildings UNION ALL SELECT 'rooms', count(*) FROM rooms UNION ALL SELECT 'amenities', count(*) FROM amenities UNION ALL SELECT 'campus_paths', count(*) FROM campus_paths;"
```

`02_seed_uit_data.sql` và `03_toa_a_indoor.sql` chứa bộ dữ liệu chuẩn trong `dataset/` (GeoJSON, EPSG:4326).

Muốn nạp lại từ đầu thì chạy lại `01_schema.sql` (file này tự `DROP` bảng cũ) rồi chạy lần lượt `02_seed_uit_data.sql`, `03_toa_a_indoor.sql`, `04_campus_graph.sql` (đúng thứ tự). `checks.sql` in kết quả kiểm tra: các dòng `invalid` phải bằng 0, có tuyến `c_route_gate_to_A305`.

### 3. Chạy Backend (FastAPI)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env     # rồi sửa mật khẩu trong .env
uvicorn main:app --reload --port 8000
```

- Chuỗi kết nối trong `.env`: `DATABASE_URL=postgresql://postgres:<mật_khẩu>@localhost:5432/uit_campus`
- Tài liệu API: http://localhost:8000/docs
- Nếu PowerShell chặn `Activate.ps1`, chạy: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- Nếu `pip install` lỗi trên Python 3.14 (thường do `psycopg2-binary` chưa có bản wheel), cài thêm **Python 3.12** rồi tạo venv bằng nó: `py -3.12 -m venv .venv`

### 4. Chạy Frontend

Mở terminal thứ hai:

```powershell
cd frontend
python -m http.server 5500
```

Truy cập http://localhost:5500. Không mở trực tiếp `index.html` bằng `file://` vì trình duyệt sẽ chặn nạp `.glb` và gọi API.
Backend phải bật CORS cho `http://localhost:5500`.

### 5. Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `psql: command not found` / không nhận lệnh | Chưa thêm PATH (bước 1.4), hoặc chưa mở lại terminal |
| `password authentication failed` | Sai `PGPASSWORD`, hoặc sai mật khẩu trong `.env` |
| Tiếng Việt bị lỗi font trong DB | Quên `$env:PGCLIENTENCODING = "UTF8"` → chạy lại mục 2 |
| `could not open extension control file ... pgrouting` | Chưa cài PostGIS Bundle qua Stack Builder (bước 1.3) |
| `could not load library ".../postgis-3.dll": The specified module could not be found` | Thiếu `libwinpthread-1.dll` trong `bin`. PowerShell (Admin): `Copy-Item "C:\Program Files\PostgreSQL\16\bin\postgisgui\libwinpthread-1.dll" "C:\Program Files\PostgreSQL\16\bin\"` |
| `Address already in use` (port 8000/5500) | Đổi port, ví dụ `--port 8001`, rồi sửa URL API trong frontend |

## Kiểm thử
- **API (T01–T05):** `backend\.venv\Scripts\python -m pytest backend/tests -q`
- **CSDL & pgRouting (T06):** `psql -U postgres -d uit_campus -tA -f database\checks.sql` (kiểm tra `ST_IsValid` và tuyến Cổng A → A305)
- **Giao diện (T07):** kiểm tra thủ công trên trình duyệt: chuyển đổi LOD 1 ↔ 2 ↔ 3, lọc tầng T1–T3, không lỗi Console.

## Dữ liệu
- Bộ dữ liệu chuẩn: 6 lớp GeoJSON trong `dataset/` (EPSG:4326), đã nạp sẵn vào các file seed trong `database/`.
- Footprint tòa nhà và lối đi lấy từ OpenStreetMap.
- Phòng Tòa A tầng 1–3 lấy theo ảnh sơ đồ và danh sách phòng khảo sát thực địa. Thư viện là cánh phía Bắc, chỉ có tầng 1–2. Tầng 3 có hội trường tròn ở giữa.
- Vị trí phòng được đặt theo khung khối nhà của mô hình 3D, nên chỉ gần đúng (chưa đo đạc).

## Thông tin
Đồ án môn **IE402 – Hệ thống thông tin địa lý 3D**, Trường ĐH Công nghệ Thông tin – ĐHQG-HCM.
