# Chức năng hệ thống UIT 3D Smart Campus

Web GIS 3D phục vụ **số hóa dữ liệu khuôn viên** và các chức năng **tra cứu, truy vấn, định vị** cho Trường ĐH Công nghệ Thông tin (UIT – ĐHQG-HCM). Hệ thống không phải tour tham quan: không có ảnh 360° hay virtual tour.

- **Dữ liệu:** PostgreSQL 16 + PostGIS + pgRouting, hệ tọa độ EPSG:4326. Khoảng cách luôn tính theo mét (`::geography`).
- **Backend:** FastAPI, chia lớp `routes → controllers → services`, có 6 API GeoJSON.
- **Frontend:** HTML/CSS/JavaScript thuần, MapLibre GL JS và Three.js (mô hình `.glb`). Mỗi chức năng là một module trong `frontend/js/`.

## 1. Dữ liệu và phân cấp

| Lớp | Bảng CSDL | Số đối tượng | Khóa ổn định |
|---|---|---|---|
| Ranh giới khuôn viên | (hằng số frontend, từ OSM) | 1 | – |
| Tòa nhà | `buildings` | 6 | `building_code` (A, B, C, D, E, NHA_PVSV) |
| Tầng | `floors` | 6 (Tòa A, C) | `building_id` + `floor_number` |
| Phòng | `rooms` | 145 (Tòa A: 78, Tòa C: 67) | `room_code` (vd. `A305`, `C312`) |
| Tiện ích | `amenities` | 6 (căn tin, ATM, nước uống, bãi xe) | `id` |
| Sân thể thao | `sports_fields` | 9 (tách từ mô hình 3D) | `field_code` (SF01–SF09) |
| Mạng lưới đường đi | `campus_paths` | 145 cạnh (đường ngoài trời 62, hành lang 75, cầu thang 8) | `id`, `source_node`, `target_node` |

**Nguồn hình học:** mô hình 3D toàn trường (`frontend/models/uit_campus.glb`) là chuẩn vị trí. Footprint các tòa được lấy từ mô hình và quy đổi sang WGS84 bằng một phép đồng dạng (tỉ lệ 0,969, xoay 0,63°, fit với footprint OSM của 5 tòa). Phòng, sàn và tiện ích của mỗi tòa được dời và xoay theo tòa đó, còn lối đi, cổng và ranh giới được dời theo các tòa lân cận. Cách tính nằm trong `Models_3D/scripts/04_align_gis_to_model.py`.

**Sân thể thao:** 9 sân tách từ mặt sân của mô hình 3D, lưu ở `dataset/sports_fields.geojson` (`Models_3D/scripts/06_extract_sports_fields.py`). Dữ liệu được nạp vào bảng `sports_fields` (`database/05_sports_fields.sql`). Loại sân (`sport_type`) và giờ mở cửa để trống, mọi sân có `verified = false`.

Quan hệ phân cấp: **tòa nhà → tầng → phòng**, cộng với lớp tiện ích. Nhà vệ sinh (WC) và Thư viện được lưu là phòng (`rooms.room_type`) và được API tiện ích trả về như một danh mục tiện ích, lấy tâm phòng làm vị trí.

Độ cao 3D: mỗi tầng cao 3.8 m. `base_height = (tầng − 1) × 3.8`, `extrude_height = base_height + 3.5` (hành lang chỉ dày 0.2 m).

## 2. Danh sách chức năng

### A. Cốt lõi

| # | Chức năng | Cách dùng | Module |
|---|---|---|---|
| 1 | Cảnh 3D khuôn viên nhiều mức chi tiết | Nút **LOD 1/2/3** ở góc trên phải. LOD 1: khối extrude theo `height_m`. LOD 2: mô hình `.glb`. LOD 3: nội thất. Nút **↺** về góc nhìn ban đầu. Camera kiểu bàn xoay: kéo chuột trái để xoay ngang 360° và nghiêng 0–85° quanh tâm màn hình (tâm khuôn viên, hoặc tòa đang chọn), kéo chuột phải để di chuyển, cuộn để thu phóng. | `layers.js`, `campus/scene.js` |
| 2 | Mô hình trong nhà theo tầng | Chọn tòa (A hoặc C) → **XEM TRONG NHÀ** → bộ chọn tầng **T1/T2/T3/Tất cả**. Vỏ tòa được ẩn, chỉ hiện phòng của tầng đang chọn. | `layers.js` (`setIndoorBuilding`, `setFloor`) |
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

## 3. API backend

| Endpoint | Chức năng |
|---|---|
| `GET /api/buildings` | Danh sách tòa nhà (GeoJSON) |
| `GET /api/rooms?building_code=&floor_number=` | Phòng theo tòa/tầng; 404 nếu sai mã tòa |
| `GET /api/search?q=` | Tìm phòng theo mã/tên (`ILIKE`, có chống SQL injection) |
| `GET /api/amenities/nearby?lat=&lng=&radius=&category=` | Tiện ích trong bán kính 50–500 m, sắp theo khoảng cách. Danh mục: `Canteen, ATM, Water, Parking, Medical, FireSafety, WC, Library` |
| `GET /api/sports-fields` | Danh sách sân thể thao (GeoJSON) |
| `GET /api/route?start_lng=&start_lat=&end_room_code=` | Tuyến đường nhiều tầng: `total_length_m`, `floors`, `reaches_room` |

Khi không kết nối được CSDL, API trả 503 với thông báo tiếng Việt (`middlewares/errors.py`). Kiểm thử bằng lệnh `cd backend; .venv\Scripts\python -m pytest -q` (14 test).

## 4. Giới hạn và hướng xử lý

| Giới hạn | Nguyên nhân | Cách xử lý hiện tại |
|---|---|---|
| Không định vị được trong nhà | Web thuần chỉ có Geolocation API (GPS/Wi-Fi), sai số trong nhà vài chục mét và không biết tầng | Người dùng chọn điểm xuất phát trên bản đồ (**Click chọn vị trí giả lập**) hoặc quét **mã QR** dán tại phòng/sảnh (liên kết `?room=`) |
| GPS chỉ chính xác ngoài trời | Sai số phụ thuộc thiết bị | Hiện vòng tròn sai số và ghi chú trên giao diện |
| Không có tùy chọn "tránh cầu thang" | Chưa có dữ liệu thang máy / lối tiếp cận | Cần bổ sung cạnh thang máy vào `campus_paths` |
| Tòa C chưa có đường đi trong nhà | Đồ thị hành lang/cầu thang mới có cho Tòa A | Tuyến dừng ở lối vào gần nhất (`reaches_room = false`) và có ghi chú trên giao diện |
| Lọc theo sức chứa chưa đầy đủ | 105/145 phòng chưa có `capacity` | Phòng thiếu sức chứa bị loại khi lọc và được đếm trong dòng tổng kết |
| Một số phòng Tòa C bị phân loại sai | Kho (`C*-STORE*`) và hồ nước (`C1-POOL1`) đang mang `room_type = 'WC'` | Cần nhóm khảo sát xác nhận lại loại phòng |
| Dữ liệu chưa được kiểm chứng thực địa | Phần lớn đối tượng có `verified = false` (lấy từ OSM, sơ đồ PCCC); hình học đã nắn theo mô hình 3D, mô hình lệch OSM 8–20 m ở một số tòa | Cần đối chiếu thực địa trước khi dùng chính thức |
| Phòng Tòa C chưa khớp hẳn vỏ tòa | Lưới phòng Tòa C là bản tạm, không có sân trong như mô hình | Khoảng 5% diện tích phòng (WC, cầu thang ở hai đầu) nhô ra ngoài vỏ vài mét; cần số hóa lại theo sơ đồ thật |
| Sân thể thao chưa xác định | Mô hình không ghi loại sân; 3 sân phía đông bắc (SF01–SF03) nằm ngoài ranh giới khuôn viên lấy từ OSM | Thẻ thông tin ghi "Chưa xác định"; cần khảo sát loại sân và đối chiếu ranh giới |
| Tiện ích còn ít | Mới có 6 điểm và chưa có Y tế/PCCC | Lớp và chú giải đã hỗ trợ đủ 8 danh mục, chỉ cần bổ sung dữ liệu |

## 5. Thư viện bên ngoài (nạp từ CDN, có ghi rõ phiên bản)

| Thư viện | Phiên bản | Dùng cho |
|---|---|---|
| MapLibre GL JS | 4.7.1 | Bản đồ, lớp `fill-extrusion` |
| Three.js | 0.165.0 | Mô hình `.glb` toàn khuôn viên |
| Fuse.js | 7.0.0 | Tìm kiếm gần đúng |
| qrcode-generator | 1.4.4 | Mã QR chia sẻ |
| @turf/area, @turf/length | 7.1.0 | Đo diện tích, chiều dài |
