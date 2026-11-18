# UIT 3D Smart Campus WebGIS (IE402)

Hệ thống WebGIS 3D phục vụ **số hóa dữ liệu khuôn viên** và các chức năng **tra cứu, truy vấn, định vị** cho Trường Đại học Công nghệ Thông tin (UIT – ĐHQG-HCM): tra cứu phòng học theo tầng, tiện ích xung quanh và dẫn đường liên tầng. Hệ thống không phải tour tham quan: không có ảnh 360° hay virtual tour.

- **Toàn khuôn viên:** LOD 1 – LOD 2 (ranh giới, khối nhà, mô hình `.glb`).
- **Trong nhà (LOD 3):** bóc tách từng tầng cho **Tòa A, B, C, E**; Tòa A có thêm đồ thị dẫn đường trong nhà.

## Công nghệ
- **CSDL:** PostgreSQL 16 + PostGIS + pgRouting (cài trực tiếp trên Windows, không Docker)
- **Backend:** Python FastAPI, Psycopg2 – trả GeoJSON FeatureCollection, chia lớp `routes → controllers → services`
- **Frontend:** HTML/CSS/JavaScript thuần, MapLibre GL JS + Three.js (custom 3D layer nạp `.glb`); mỗi chức năng là một module trong `frontend/js/`

Toàn bộ hình học lưu ở `EPSG:4326`; khoảng cách luôn tính bằng `::geography` (mét).

Thư viện ngoài (nạp từ CDN, có ghi rõ phiên bản):

| Thư viện | Phiên bản | Dùng cho |
|---|---|---|
| MapLibre GL JS | 4.7.1 | Bản đồ, lớp `fill-extrusion` |
| Three.js | 0.165.0 | Mô hình `.glb` toàn khuôn viên |
| Fuse.js | 7.0.0 | Tìm kiếm gần đúng |
| qrcode-generator | 1.4.4 | Mã QR chia sẻ |
| @turf/area, @turf/length | 7.1.0 | Đo diện tích, chiều dài |

## Chức năng

### A. Cốt lõi

| # | Chức năng | Cách dùng | Module |
|---|---|---|---|
| 1 | Cảnh 3D khuôn viên nhiều mức chi tiết | Nút **LOD 1/2/3** ở góc trên phải. LOD 1: khối extrude theo `height_m`. LOD 2: mô hình `.glb`. LOD 3: nội thất. Nút **↺** về góc nhìn ban đầu, nút **VỆ TINH** bật nền ảnh vệ tinh. Camera kiểu bàn xoay: kéo chuột trái để xoay ngang 360° và nghiêng 0–85° quanh tâm màn hình (tâm khuôn viên, hoặc tòa đang chọn), kéo chuột phải để di chuyển, cuộn để thu phóng. Để yên 6 giây thì cảnh tự xoay cùng chiều kim đồng hồ (1 vòng mỗi phút). | `layers.js`, `campus/scene.js` |
| 2 | Mô hình trong nhà theo tầng | Chọn tòa (A, B, C hoặc E) → **XEM TRONG NHÀ** → bộ chọn tầng. Vỏ tòa được ẩn, chỉ hiện phòng của tầng đang chọn. | `layers.js` (`setIndoorBuilding`, `setFloor`) |
| 3 | Xem thông tin khi bấm (click-identify) | Bấm vào tòa, phòng hoặc biểu tượng tiện ích để hiện thẻ thông tin: tên, mã, tầng, loại, sức chứa, mô tả, giờ mở cửa. | `buildings.js`, `rooms.js`, `amenities.js` |
| 4 | Tìm kiếm | Ô tìm trong **Danh sách địa điểm**. Gợi ý ngay khi gõ, không cần dấu (`thu vien`), chịu được gõ sai nhẹ (`A35`). Gõ đúng mã phòng (`A305`, `a.305`) thì phòng đó luôn đứng đầu. Enter mở kết quả đầu tiên. | `search.js` (Fuse.js) |
| 5 | Định vị kết quả | Chọn một kết quả: camera bay tới, tô vàng phòng, tự chuyển sang đúng tòa và đúng tầng. | `rooms.js` (`selectRoom`) |
| 6 | Lớp tiện ích theo danh mục | Mỗi loại có biểu tượng và màu riêng. Ô chọn trong mục **Định vị & tiện ích** vừa bật/tắt từng loại vừa là chú giải. WC và Thư viện mặc định tắt. | `amenities.js` |
| 6b | Sân thể thao | Rê chuột lên sân để tô viền, bấm vào sân để xem mã sân, loại sân, diện tích, giờ mở cửa. Tìm được trong ô tìm kiếm theo tên (`san the thao`) hoặc mã (`SF04`). Lớp vẽ trong suốt trên mặt sân của mô hình. | `sports.js` |

### B. Nên có

| # | Chức năng | Cách dùng | Module |
|---|---|---|---|
| 7 | Tô màu theo chức năng | Phòng tô theo `room_type` (chú giải ở LOD 3). Tòa nhà ở LOD 1 tô theo nhóm chức năng (chú giải góc phải). | `layers.js`, `buildings.js` |
| 8 | Liên kết chia sẻ + mã QR | `?room=A305` hoặc `?building=E` mở trang và bay thẳng tới đối tượng. Nút **Chia sẻ** (trong thẻ phòng hoặc panel tòa) sao chép liên kết và hiện mã QR. | `share.js` (qrcode-generator) |
| 9 | Vị trí của tôi | Nút **Vị trí của tôi (GPS)** dùng Geolocation API, vẽ vòng tròn sai số. Có thông báo khi người dùng từ chối quyền, mất tín hiệu, hết thời gian chờ, hoặc đang ở ngoài khuôn viên. | `geolocate.js` |
| 10 | Chỉ đường | Chọn phòng → **Chỉ đường đến phòng này**. Tuyến tính bằng pgRouting (`pgr_dijkstra`) trên đồ thị nội bộ, hiện quãng đường (m) và thời gian đi bộ ước tính (1.2 m/s, cộng 15 giây mỗi tầng phải leo). | `route.js`, `backend/services/route_service.py` |
| 11 | Giao diện điện thoại | Màn hình ≤ 720 px: thanh công cụ dồn lên trên, danh sách thành bottom sheet chiếm 55% màn hình, nút tối thiểu 40 px. | `style.css` |

### C. Nâng cao

| # | Chức năng | Cách dùng | Module |
|---|---|---|---|
| 12 | Truy vấn thuộc tính | Mục **Truy vấn phòng**: chọn tòa, tầng, loại phòng, sức chứa ≥ N → **Lọc phòng**. Kết quả được tô hồng và liệt kê; bấm vào một dòng để định vị phòng đó. | `query.js` |
| 13 | Tìm gần nhất / trong bán kính | **Click chọn vị trí giả lập** hoặc dùng GPS, kéo thanh **Bán kính** (50–300 m) để liệt kê tiện ích kèm khoảng cách. Các nút **WC / Căn tin / ATM gần nhất** tìm trong bán kính 500 m bằng `ST_DWithin` trên `::geography`. | `amenities.js`, `nearest.js` |
| 14 | Chỉ đường nhiều tầng | Cầu thang là các cạnh nối giữa các tầng (chi phí = chiều dài × 2.5). Sau khi chỉ đường, bản đồ hiện toàn tuyến rồi lần lượt bật từng tầng mà tuyến đi qua. | `route.js` |
| 15 | Mặt cắt ngang | Thanh **Mặt cắt ngang** (0–50 m) cắt bỏ phần mô hình 3D cao hơn độ cao đã chọn để nhìn vào bên trong tòa nhà. | `measure.js`, `campus/scene.js` |
| 16 | Đo đạc | **Đo khoảng cách** (m) và **Đo diện tích** (m², kèm chu vi): nhấp lần lượt các điểm. **Đo chiều cao**: nhấp vào tòa nhà để xem `height_m` và số tầng trong CSDL. Phím Esc để thoát. | `measure.js` (Turf.js) |

## API backend

| Endpoint | Chức năng |
|---|---|
| `GET /api/buildings` | Danh sách tòa nhà (GeoJSON): chiều cao, mô hình 3D |
| `GET /api/rooms?building_code=&floor_number=` | Phòng theo tòa/tầng; 404 nếu sai mã tòa |
| `GET /api/search?q=` | Tìm phòng theo mã/tên (`ILIKE`, có chống SQL injection) |
| `GET /api/amenities/nearby?lat=&lng=&radius=&category=` | Tiện ích trong bán kính 50–500 m, sắp theo khoảng cách. Danh mục: `Canteen, ATM, Water, Parking, Medical, FireSafety, WC, Library, Hall` |
| `GET /api/sports-fields` | Danh sách sân thể thao (GeoJSON) |
| `GET /api/route?start_lng=&start_lat=&end_room_code=` | Tuyến đường nhiều tầng: `total_length_m`, `floors`, `reaches_room` |

Khi không kết nối được CSDL, API trả 503 với thông báo tiếng Việt (`middlewares/errors.py`). Phản hồi lớn hơn 1 KB được nén gzip; kết nối CSDL dùng chung qua pool (`utils/db.py`).

## Dữ liệu

| Lớp | Bảng CSDL | Số đối tượng | Khóa ổn định |
|---|---|---|---|
| Ranh giới khuôn viên | (hằng số frontend, từ OSM) | 1 | – |
| Tòa nhà | `buildings` | 7 | `building_code` (A, B, C, D, E, NHA_PVSV, CAFE_VOI) |
| Tầng | `floors` | 28 (Tòa A: 3, B: 9, C: 3, E: 13) | `building_id` + `floor_number` |
| Phòng | `rooms` | 454 (Tòa A: 98, B: 135, C: 67, E: 154) | `room_code` (vd. `A305`, `C312`, `B1.02`, `E7.01`) |
| Tiện ích | `amenities` | 8 (3 căn tin, 1 ATM, 1 nước uống, 3 bãi xe) | `id` |
| Sân thể thao | `sports_fields` | 9 (tách từ mô hình 3D) | `field_code` (SF01–SF09) |
| Mạng lưới đường đi | `campus_paths` | 133 cạnh (đường ngoài trời 62, hành lang 57, cầu thang 14) | `id`, `source_node`, `target_node` |

**Nguồn hình học:** mô hình 3D toàn trường (`frontend/models/uit_campus.glb`) là chuẩn vị trí. Footprint các tòa được lấy từ mô hình và quy đổi sang WGS84 bằng một phép đồng dạng (tỉ lệ 0,969, xoay 0,63°, fit với footprint OSM của 5 tòa). Phòng, sàn và tiện ích của mỗi tòa được dời và xoay theo tòa đó, còn lối đi, cổng và ranh giới được dời theo các tòa lân cận. Cách tính nằm trong `Models_3D/scripts/04_align_gis_to_model.py`. Footprint tòa nhà và lối đi ban đầu lấy từ OpenStreetMap.

**Nội thất Tòa A, B, E** (`Models_3D/scripts/07_import_lod3.py`): Tòa A và Tòa E (mã dạng `E7.01`, hội trường `HTE`) lấy theo bộ mô hình nội thất LOD 3 dựng từ sơ đồ tầng; Tòa B bố trí theo sơ đồ tầng của trường (phòng đánh số từ đông sang tây), hình dạng ô phòng cắt theo khối tòa trong mô hình 3D. Dữ liệu lưu ở `dataset/rooms.geojson` + `database/03_toa_a_indoor.sql` (Tòa A) và `dataset/rooms_b_e.geojson`, `dataset/floors_b_e.geojson` + `database/06_toa_b_e_indoor.sql` (Tòa B, E). Tọa độ được quy đổi về cùng hệ với mô hình khuôn viên (sai số khớp khoảng 6 mm; Tòa E bù thêm tỉ lệ và góc xoay để nằm trong vỏ tòa, sai lệch còn dưới 1 m). Vị trí phòng chỉ gần đúng (chưa đo đạc thực địa).

**Sân thể thao:** 9 sân tách từ mặt sân của mô hình 3D, lưu ở `dataset/sports_fields.geojson` (`Models_3D/scripts/06_extract_sports_fields.py`), nạp vào bảng `sports_fields` (`database/05_sports_fields.sql`). Loại sân (`sport_type`) và giờ mở cửa để trống, mọi sân có `verified = false`.

Quan hệ phân cấp: **tòa nhà → tầng → phòng**, cộng với lớp tiện ích. Nhà vệ sinh (WC) và Thư viện được lưu là phòng (`rooms.room_type`) và được API tiện ích trả về như một danh mục tiện ích, lấy tâm phòng làm vị trí. Phòng Y tế (A103, tầng 1 Tòa A) cũng được trả về theo cách này với danh mục `Medical`; các phòng có tên bắt đầu bằng "Hội trường" (`A.HT` tầng 3 Tòa A, `HTE` tầng 12 Tòa E) được trả về với danh mục `Hall`. Biểu tượng của tiện ích trên tầng cao được đặt đúng độ cao sàn phòng.

Độ cao 3D: mỗi tầng cao 3.8 m. `base_height = (tầng − 1) × 3.8`, `extrude_height = base_height + 3.5` (hành lang chỉ dày 0.2 m).

## Cấu trúc thư mục
```text
database/   01_schema.sql, 02_seed_uit_data.sql, 03_toa_a_indoor.sql, 04_campus_graph.sql, 05_sports_fields.sql, 06_toa_b_e_indoor.sql, checks.sql, load_all.sql (nạp tất cả bằng 1 lệnh)
dataset/    bộ dữ liệu chuẩn GeoJSON: buildings, floors, rooms, amenities, paths, campus_boundary;
            sports_fields (sân thể thao tách từ model, nạp bằng database/05_sports_fields.sql);
            rooms_b_e, floors_b_e (nội thất LOD 3 Tòa B, E, nạp bằng database/06_toa_b_e_indoor.sql)
backend/    FastAPI, chia theo lớp:
            main.py (tạo app, CORS, gzip, gắn router) · routes/api.py (URL -> controller)
            controllers/ (nhận request, kiểm tra tham số) · services/ (truy vấn PostGIS, pgRouting)
            models/enums.py (giá trị loại phòng/tiện ích) · config/settings.py (.env)
            utils/ (db, geojson, text) · middlewares/errors.py (lỗi CSDL) · tests/test_api.py
frontend/   index.html, style.css, models/uit_campus.glb (mô hình toàn trường tách theo tòa, nén Draco –
            dựng từ mô hình của Heli Ton, CC BY 4.0)
            js/ (ES module, mỗi chức năng một file): main.js (điểm vào), config, state, dom, utils, map,
                intro, camera, layers (LOD, tầng, ánh sáng), buildings, rooms, search, amenities,
                nearest, route, share, geolocate, query, measure, sports
            js/campus/: scene.js (lớp Three.js nạp uit_campus.glb), geo.js (nắn tọa độ), palette.js (ánh sáng)
Models_3D/scripts/  dựng model tách tòa (01–03, chạy trong Blender), 04_align_gis_to_model.py (nắn
            dataset/ và database/ theo model), 05_export_web_glb.py (xuất bản nén cho frontend),
            06_extract_sports_fields.py (tách sân thể thao, sinh
            dataset/sports_fields.geojson và database/05_sports_fields.sql),
            07_import_lod3.py (nạp nội thất LOD 3 Tòa A, B, E vào dataset/ và database/03, 06).
            File model nguồn (.blend, .glb) không đưa lên repo.
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
psql -U postgres -d uit_campus -f database\load_all.sql
```

Kiểm chứng:

```powershell
psql -U postgres -d uit_campus -c "SELECT postgis_version(), pgr_version();"
psql -U postgres -d uit_campus -c "SELECT 'buildings', count(*) FROM buildings UNION ALL SELECT 'rooms', count(*) FROM rooms UNION ALL SELECT 'amenities', count(*) FROM amenities UNION ALL SELECT 'campus_paths', count(*) FROM campus_paths;"
```

`02_seed_uit_data.sql` và `03_toa_a_indoor.sql` chứa bộ dữ liệu chuẩn trong `dataset/` (GeoJSON, EPSG:4326).

`load_all.sql` nạp lần lượt `01_schema.sql` → `06_toa_b_e_indoor.sql` rồi chạy `checks.sql`, dừng ngay khi một file lỗi. `01_schema.sql` tự `DROP` bảng cũ, nên muốn nạp lại từ đầu chỉ cần chạy lại lệnh trên. `checks.sql` in kết quả kiểm tra: các dòng `invalid` phải bằng 0, có tuyến `c_route_gate_to_A305`.

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
- **API:** `backend\.venv\Scripts\python -m pytest backend/tests -q` (19 test)
- **CSDL & pgRouting:** `psql -U postgres -d uit_campus -tA -f database\checks.sql` (kiểm tra `ST_IsValid` và tuyến Cổng A → A305)
- **Giao diện:** kiểm tra thủ công trên trình duyệt: chuyển đổi LOD 1 ↔ 2 ↔ 3, lọc tầng, không lỗi Console.

## Giới hạn và hướng xử lý

| Giới hạn | Nguyên nhân | Cách xử lý hiện tại |
|---|---|---|
| Không định vị được trong nhà | Web thuần chỉ có Geolocation API (GPS/Wi-Fi), sai số trong nhà vài chục mét và không biết tầng | Người dùng chọn điểm xuất phát trên bản đồ (**Click chọn vị trí giả lập**) hoặc quét **mã QR** dán tại phòng/sảnh (liên kết `?room=`) |
| GPS chỉ chính xác ngoài trời | Sai số phụ thuộc thiết bị | Hiện vòng tròn sai số và ghi chú trên giao diện |
| Không có tùy chọn "tránh cầu thang" | Chưa có dữ liệu thang máy / lối tiếp cận | Cần bổ sung cạnh thang máy vào `campus_paths` |
| Tòa B, C, E chưa có đường đi trong nhà | Đồ thị hành lang/cầu thang mới có cho Tòa A | Tuyến dừng ở lối vào gần nhất (`reaches_room = false`) và có ghi chú trên giao diện |
| Lọc theo sức chứa chưa đầy đủ | 238/426 phòng (không tính hành lang) chưa có `capacity` | Phòng thiếu sức chứa bị loại khi lọc và được đếm trong dòng tổng kết |
| Một số phòng Tòa C bị phân loại sai | Kho (`C*-STORE*`) và hồ nước (`C1-POOL1`) đang mang `room_type = 'WC'` | Cần nhóm khảo sát xác nhận lại loại phòng |
| Dữ liệu chưa được kiểm chứng thực địa | Phần lớn đối tượng có `verified = false` (lấy từ OSM, sơ đồ PCCC); hình học đã nắn theo mô hình 3D, mô hình lệch OSM 8–20 m ở một số tòa | Cần đối chiếu thực địa trước khi dùng chính thức |
| Phòng Tòa C chưa khớp hẳn vỏ tòa | Lưới phòng Tòa C là bản tạm, không có sân trong như mô hình | Khoảng 5% diện tích phòng (WC, cầu thang ở hai đầu) nhô ra ngoài vỏ vài mét; cần số hóa lại theo sơ đồ thật |
| Sân thể thao chưa xác định | Mô hình không ghi loại sân; 3 sân phía đông bắc (SF01–SF03) nằm ngoài ranh giới khuôn viên lấy từ OSM | Thẻ thông tin ghi "Chưa xác định"; cần khảo sát loại sân và đối chiếu ranh giới |
| Tiện ích còn ít | Mới có 8 điểm, Y tế chỉ có phòng A103 và chưa có PCCC | Lớp và chú giải đã hỗ trợ đủ 9 danh mục, chỉ cần bổ sung dữ liệu |

## Nguồn tham khảo
- **Mô hình 3D khuôn viên:** "University of Information Technology - UIT" của Heli Ton, giấy phép CC BY 4.0 (tách theo tòa, nén Draco trong `frontend/models/uit_campus.glb`).
- **cs.uitmap.site:** mô hình tham chiếu `NewMap.glb` và khung định hướng các tòa (`uit-building-hitboxes/v1`) dùng khi dựng model trong `Models_3D/scripts/02_build_uit_models.py`; giao diện (hiệu ứng làm mờ khi mở Credits, ngăn kéo bên trái) và ánh sáng cảnh có tham khảo phong cách của trang này.
- **OpenStreetMap:** footprint tòa nhà, lối đi và ranh giới khuôn viên ban đầu.

## Thông tin
Đồ án môn **IE402 – Hệ thống thông tin địa lý 3D**, Trường ĐH Công nghệ Thông tin – ĐHQG-HCM.
