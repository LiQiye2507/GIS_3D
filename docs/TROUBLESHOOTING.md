# Lỗi thường gặp

Các lỗi hay gặp khi cài đặt và chạy hệ thống, theo từng cách chạy.

[← Quay lại README](../README.md)

## Windows (không Docker)

Xem các bước cài ở [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md).

| Lỗi | Cách xử lý |
|---|---|
| `psql: command not found` / không nhận lệnh | Chưa thêm PATH (bước 1.4), hoặc chưa mở lại terminal |
| `password authentication failed` | Sai `PGPASSWORD`, hoặc sai mật khẩu trong `.env` |
| Tiếng Việt bị lỗi font trong DB | Quên `$env:PGCLIENTENCODING = "UTF8"` → chạy lại mục 2 |
| `could not open extension control file ... pgrouting` | Chưa cài PostGIS Bundle qua Stack Builder (bước 1.3) |
| `could not load library ".../postgis-3.dll": The specified module could not be found` | Thiếu `libwinpthread-1.dll` trong `bin`. PowerShell (Admin): `Copy-Item "C:\Program Files\PostgreSQL\16\bin\postgisgui\libwinpthread-1.dll" "C:\Program Files\PostgreSQL\16\bin\"` |
| `Address already in use` (port 8000/5500) | Đổi port, ví dụ `--port 8001`, rồi sửa URL API trong frontend |

## Docker

Xem các bước cài ở [DOCKER.md](DOCKER.md).

| Lỗi | Cách xử lý |
|---|---|
| `error during connect` / `Cannot connect to the Docker daemon` / `The system cannot find the file specified` | Docker Desktop chưa chạy. Mở Docker Desktop, đợi **Engine running** rồi chạy lại |
| Docker Desktop báo `WSL not installed` hoặc kẹt ở "Engine starting" | Chưa cài WSL 2 (mục 1.1), hoặc chưa khởi động lại máy |
| `docker` không được nhận là lệnh | Mở lại terminal hoặc VS Code sau khi cài Docker Desktop |
| `Bind for 127.0.0.1:5433 failed: port is already allocated` (hoặc 8000, 5500) | Cổng đang bị chương trình khác dùng (ví dụ đang chạy `python -m http.server 5500`). Tắt chương trình đó, hoặc đổi cổng bên trái trong `ports`, ví dụ `"127.0.0.1:5434:5432"`. Riêng cổng 5500 của frontend nên giữ nguyên, vì backend chỉ cho phép CORS từ cổng này |
| Sửa file SQL nhưng dữ liệu trong Docker không đổi | Script init chỉ chạy khi volume còn trống. Chạy `docker compose down -v` rồi `docker compose up -d --build --wait` |
| Backend báo lỗi 503 ngay sau khi khởi động | CSDL chưa sẵn sàng. Đợi vài giây, hoặc xem `docker compose logs db` |
