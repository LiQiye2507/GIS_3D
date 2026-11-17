# Hướng dẫn cài đặt & chạy dự án (Windows, không Docker)

Môi trường đã kiểm tra: Windows 11, PowerShell, Python 3.14 có sẵn.

## 1. Cài PostgreSQL + PostGIS + pgRouting (~20–30 phút)

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

## 2. Tạo database & nạp dữ liệu

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

`02_seed_uit_data.sql` và `03_toa_a_indoor.sql` được sinh từ bộ dữ liệu chuẩn `dataset/final/`. Cách sinh lại xem `dataset/final/README.md`.

Muốn nạp lại từ đầu thì chạy lại `01_schema.sql` (file này tự `DROP` bảng cũ) rồi chạy lần lượt `02_seed_uit_data.sql`, `03_toa_a_indoor.sql`, `04_campus_graph.sql` (đúng thứ tự). `checks.sql` in kết quả kiểm tra: các dòng `invalid` phải bằng 0, có tuyến `c_route_gate_to_A305`.

## 3. Chạy Backend (FastAPI)

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

## 4. Chạy Frontend

Mở terminal thứ hai:

```powershell
cd frontend
python -m http.server 5500
```

Truy cập http://localhost:5500. Không mở trực tiếp `index.html` bằng `file://` vì trình duyệt sẽ chặn nạp `.glb` và gọi API.
Backend phải bật CORS cho `http://localhost:5500`.

## 5. Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `psql: command not found` / không nhận lệnh | Chưa thêm PATH (bước 1.4), hoặc chưa mở lại terminal |
| `password authentication failed` | Sai `PGPASSWORD`, hoặc sai mật khẩu trong `.env` |
| Tiếng Việt bị lỗi font trong DB | Quên `$env:PGCLIENTENCODING = "UTF8"` → chạy lại mục 2 |
| `could not open extension control file ... pgrouting` | Chưa cài PostGIS Bundle qua Stack Builder (bước 1.3) |
| `could not load library ".../postgis-3.dll": The specified module could not be found` | Thiếu `libwinpthread-1.dll` trong `bin`. PowerShell (Admin): `Copy-Item "C:\Program Files\PostgreSQL\16\bin\postgisgui\libwinpthread-1.dll" "C:\Program Files\PostgreSQL\16\bin\"` |
| `Address already in use` (port 8000/5500) | Đổi port, ví dụ `--port 8001`, rồi sửa URL API trong frontend |
