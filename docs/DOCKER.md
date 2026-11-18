# Chạy bằng Docker (khuyên dùng)

Chạy CSDL, backend và frontend bằng Docker Compose, không cần cài PostgreSQL, PostGIS, pgRouting hay Python.

[← Quay lại README](../README.md)

Chỉ cần cài Docker Desktop. Docker chạy ba thành phần:

- `db`: PostgreSQL 16 + PostGIS 3.5 + pgRouting 4.0 (image `pgrouting/pgrouting:16-3.5-4.0.1`). Lần đầu khởi động, CSDL tự nạp `database/01_schema.sql` → `06_toa_b_e_indoor.sql` rồi chạy `checks.sql`.
- `backend`: FastAPI, tự nối vào `db`.
- `frontend`: nginx phục vụ thư mục `frontend/` ở cổng 5500 (khớp CORS của backend).

## 1. Cài Docker Desktop

1. Cài WSL 2. Mở PowerShell bằng **Run as administrator**, chạy:
   ```powershell
   wsl --install --no-distribution
   ```
   Sau đó **khởi động lại máy**. Nếu báo lỗi liên quan đến virtualization, vào BIOS/UEFI bật Intel VT-x hoặc AMD-V/SVM.
2. Cài Docker Desktop: tải từ https://www.docker.com/products/docker-desktop/, hoặc chạy `winget install -e --id Docker.DockerDesktop`. Có thể phải khởi động lại máy lần nữa.
3. Mở **Docker Desktop**, đợi góc dưới bên trái hiện **Engine running**. Không cần đăng nhập.
4. Kiểm tra:
   ```powershell
   docker info
   docker run --rm hello-world
   ```

## 2. Chạy

```powershell
git clone https://github.com/LiQiye2507/GIS_3D.git
cd GIS_3D
docker compose up -d --build --wait
```

Lần đầu phải tải image và nạp dữ liệu, nên mất vài phút. Khi lệnh chạy xong, cả ba service đều đã chạy.

- Website: http://localhost:5500
- Tài liệu API: http://localhost:8000/docs
- Sửa file trong `frontend/` thì chỉ cần tải lại trang, không phải chạy lại Docker.

Kiểm tra dữ liệu:

```powershell
docker compose logs db                     # phải thấy "running /docker-entrypoint-initdb.d/07_checks.sql", không có ERROR
docker compose exec db psql -U postgres -d uit_campus -c "SELECT postgis_full_version(), pgr_version();"
docker compose exec db psql -U postgres -d uit_campus -c "SELECT count(*) FROM rooms;"
```

## 3. Thông tin kết nối CSDL

| Mục | Giá trị |
|---|---|
| Host | `localhost` |
| Port | `5433` (khác `5432` để không trùng PostgreSQL cài trên Windows) |
| User | `postgres` |
| Mật khẩu | `postgres` |
| Database | `uit_campus` |

- Mật khẩu `postgres` chỉ dành cho môi trường dev trên máy cá nhân. Không dùng cho máy chủ thật.
- Cổng `5433` (CSDL), `8000` (backend) và `5500` (website) chỉ mở cho chính máy đang chạy (`127.0.0.1`). Muốn máy khác trong mạng LAN truy cập được thì bỏ `127.0.0.1:` trong mục `ports` của `docker-compose.yml`.
- Muốn chạy backend trên Windows nhưng dùng CSDL trong Docker: chạy `docker compose up -d db`, rồi đặt trong `backend/.env`: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/uit_campus`. Biến `DATABASE_URL` của service `backend` trong compose đã ghi đè `.env`, nên không cần sửa `.env` khi chạy backend bằng Docker.

## 4. Dừng và reset dữ liệu

```powershell
docker compose down        # dừng, GIỮ dữ liệu (volume pgdata)
docker compose down -v     # dừng và XÓA dữ liệu; lần up sau sẽ nạp lại từ các file SQL
docker compose up -d --build --wait
```

Gặp lỗi: xem [TROUBLESHOOTING.md](TROUBLESHOOTING.md#docker).
