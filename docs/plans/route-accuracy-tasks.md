# Cải thiện độ chính xác tìm đường – phân công

Hạn chót đồ án: 30/11/2026. Làm theo thứ tự **R1 → R2 → R3 → R4**. R1 và R2 làm song song được (khác file).
Trước khi sửa `database/`: `pg_dump -U postgres -Fc uit_campus > backup_uit_campus.dump`.

## Hiện trạng (vì sao tuyến chưa chính xác)

| # | Vấn đề | Chỗ trong code |
|---|--------|----------------|
| 1 | Điểm xuất phát bị "hút" vào **đỉnh** gần nhất, không phải **cạnh** gần nhất. Người đứng giữa một lối đi dài có thể bị đưa về đỉnh ở phía sau lưng, tuyến đi vòng. Đoạn từ vị trí người dùng tới lối đi không được vẽ, cũng không được cộng vào quãng đường. | `backend/services/route_service.py` – CTE `start_v` |
| 2 | Điểm đích cũng chỉ là đỉnh gần tâm phòng nhất, nên tuyến dừng ở hành lang, không có đoạn cuối vào tới phòng. | `route_service.py` – CTE `end_v` |
| 3 | Với tòa chưa có đồ thị trong nhà (B, C, D, E…), đích lùi về "đỉnh tầng 1 gần tâm phòng nhất". Đỉnh này không biết thuộc tòa nào, nên có thể rơi vào hành lang Tòa A hoặc vào lối đi ở phía sau tòa. | `route_service.py` – `end_v` |
| 4 | Đoạn đường trả về giữ hướng gốc lúc vẽ dữ liệu. Có đoạn bị ngược chiều đi (điểm cuối đoạn trước không trùng điểm đầu đoạn sau), làm sai thứ tự hiển thị và hướng đi. | `route_service.py` – `ST_AsGeoJSON(cp.geom)` |
| 5 | Lối đi ngoài trời chỉ được nối khi các đường **cắt nhau thật** (`ST_Node`). Hai lối đi chỉ "gần chạm" (hở vài chục cm) thì vẫn bị đứt, tạo ngõ cụt và đường vòng. `checks.sql` chỉ kiểm tra liên thông của Tòa A, chưa kiểm tra toàn bộ đồ thị. | `database/04_campus_graph.sql` mục 1, `database/checks.sql` (d) |
| 6 | Chỉ Tòa A có cạnh nối lối vào với lối đi. Các tòa khác không có điểm lối vào. | `04_campus_graph.sql` – `connector_edges` |
| 7 | Thời gian đi bộ cộng 15 s theo số tầng trong danh sách, chưa tính độ dài cầu thang thật. | `frontend/js/route.js` – `minutes` |

Quy tắc bắt buộc của dự án: khoảng cách luôn dùng `::geography` (mét), tọa độ `[lng, lat]`, SRID 4326.

---

## R1 — Bám điểm đầu/cuối vào cạnh gần nhất, giới hạn đích theo đúng tòa, đảo hướng đoạn (Backend)

- **Người làm:** ……
- **File được sửa:** `backend/services/route_service.py`
- **Mục tiêu:** sửa vấn đề 1, 2, 3, 4.
- **Cách làm:**
  1. Kiểm tra phiên bản: `SELECT pgr_version();` (cần ≥ 3.2 để có `pgr_withPoints`).
  2. **Điểm xuất phát:** tìm cạnh tầng 1 gần nhất bằng `ORDER BY geom::geography <-> điểm` (hoặc `ST_Distance(...::geography)`) rồi tính `fraction = ST_LineLocatePoint(ST_Force2D(geom), điểm)`.
  3. **Điểm đích:** nếu tòa của phòng có đồ thị trong nhà (có cạnh `Corridor` cùng tầng nằm trong `buildings.geom` của tòa đó, dùng `ST_DWithin(...::geography, 5)`), lấy cạnh Corridor gần tâm phòng nhất **cùng tầng, cùng tòa**. Nếu không có, lấy cạnh tầng 1 gần **ranh tòa** (`ST_ExteriorRing(b.geom)`) nhất. Không được lấy theo tâm phòng.
  4. Thay `pgr_dijkstra` bằng `pgr_withPoints(edges_sql, points_sql, -1, -2, directed := false, details := false)`. `points_sql` trả 2 dòng `(pid, edge_id, fraction)`. Phần cạnh bị cắt dở lấy bằng `ST_LineSubstring`.
  5. Thêm 2 feature nối (`path_type = 'Connector'`): đoạn thẳng từ vị trí người dùng tới điểm bám, và từ điểm bám cuối tới `ST_PointOnSurface(room.geom)` (z = `base_height` của phòng). Cộng độ dài 2 đoạn này vào `total_length_m`.
  6. **Đảo hướng:** trong kết quả có `d.node` (đỉnh bắt đầu bước đi). Nếu `d.node <> cp.source_node` thì trả `ST_Reverse(cp.geom)`.
  7. Thêm trường `walk_seconds` = tổng `length_m` / 1.2 + tổng `length_m` cạnh `Stairs` × 1.5 (leo thang chậm hơn), làm tròn.
  8. Giữ nguyên các trường đang có (`reaches_room`, `floors`, `room_code`, `total_length_m`) để frontend không bị hỏng.
- **Không làm:** đổi API, thêm tham số mới, sửa controller.
- **Kiểm chứng:**
  ```powershell
  curl "http://127.0.0.1:8000/api/route?start_lng=106.8020546&start_lat=10.8704376&end_room_code=A305"
  ```
  Tuyến liên tục: điểm cuối feature i trùng điểm đầu feature i+1 (lệch < 0.5 m). Feature đầu tiên bắt đầu đúng ở tọa độ xuất phát. Phòng C312 thì tuyến dừng sát ranh Tòa C, không đi vào Tòa A.

## R2 — Làm sạch đồ thị và thêm lối vào các tòa (Database)

- **Người làm:** ……
- **File được sửa:** `database/04_campus_graph.sql`, `database/checks.sql`, (nếu thêm lối đi) `database/02_seed_uit_data.sql` + `dataset/paths.geojson`
- **Mục tiêu:** sửa vấn đề 5, 6.
- **Cách làm:**
  1. Ở mục 1 của `04`, trước `ST_Node`: dùng `ST_Snap(geom, ST_Collect(geom), 1.5)` (đơn vị mét, vì đang ở EPSG:32648) để nối các đầu mút hở ≤ 1.5 m.
  2. Mỗi tòa có `buildings.geom`: thêm 1 cạnh `Walkway` nối điểm lối vào của tòa với đỉnh lối đi gần nhất (làm giống `connector_edges` của Tòa A). Lối vào lấy từ OSM entrance nếu có trong `dataset/amenities.geojson`, nếu không thì dùng `ST_ClosestPoint(ranh tòa, lối đi gần nhất)` và ghi chú `-- TODO: kiểm chứng thực địa`.
  3. Xem ảnh vệ tinh trong QGIS. Lối đi thật nào còn thiếu thì vẽ thêm vào `dataset/paths.geojson`, đồng thời thêm dòng `INSERT` tương ứng vào `02_seed_uit_data.sql` (hai nơi phải khớp nhau).
  4. `checks.sql` thêm:
     - (e) số thành phần liên thông của **toàn bộ** đồ thị, phải bằng 1;
     - (f) số đỉnh treo (bậc 1) cách một đỉnh khác < 3 m, phải bằng 0 (đây là các chỗ đáng lẽ phải nối).
- **Không làm:** chạy lại `Models_3D/scripts/04/06/07` (dữ liệu đã chỉnh tay).
- **Kiểm chứng:**
  ```powershell
  $env:PGCLIENTENCODING="UTF8"; psql -U postgres -d uit_campus -v ON_ERROR_STOP=1 -f database/load_all.sql
  ```
  (a) = 0, (b) = 0, (d) = 1, (e) = 1, (f) = 0; (c) vẫn ra tuyến Cổng A → A305 qua tầng 1,2,3.

## R3 — Hiển thị đoạn nối và thời gian chính xác (Frontend)

- **Người làm:** ……
- **Làm sau R1.**
- **File được sửa:** `frontend/js/route.js`, `frontend/index.html` hoặc `frontend/js/map.js` (chỗ khai báo layer `route`)
- **Mục tiêu:** sửa vấn đề 7 và vẽ phần mới của R1.
- **Cách làm:**
  1. Feature `path_type = 'Connector'` vẽ nét đứt (`line-dasharray`) để người xem phân biệt với lối đi thật.
  2. Thời gian lấy `routeFc.walk_seconds` từ backend, bỏ công thức `15 * (floors.length - 1)`.
  3. Nếu đoạn nối đầu dài > 50 m thì hiện `showToast('Vị trí xuất phát cách lối đi gần nhất X m')`.
- **Không làm:** chỉ dẫn từng bước rẽ trái/phải, đổi màu theo tầng.
- **Kiểm chứng:** mở trang, chọn A305, bấm Chỉ đường. Có nét đứt từ điểm xuất phát tới lối đi và từ hành lang vào phòng. Console không có lỗi. Đổi sang chế độ xem vệ tinh rồi quay lại sơ đồ model, tuyến vẫn vẽ đúng chỗ.

## R4 — Test hồi quy độ chính xác (Kiểm thử)

- **Người làm:** ……
- **Làm sau R1, R2.**
- **File được sửa:** `backend/tests/test_api.py`
- **Thêm test:**
  1. `test_route_is_continuous`: với A305, mọi cặp feature liền nhau có điểm nối lệch < 0.5 m.
  2. `test_route_starts_at_user`: tọa độ đầu của feature đầu tiên trùng điểm xuất phát.
  3. `test_route_not_longer_than_needed`: `total_length_m` ≥ khoảng cách đường chim bay và ≤ 2.5 lần khoảng cách đó (tuyến không đi vòng vô lý).
  4. `test_route_mid_walkway_no_backtrack`: đặt điểm xuất phát ở giữa một lối đi dài (lấy trung điểm một Walkway trong `02`). Tuyến không được đi qua đỉnh nằm ngược hướng (feature đầu tiên phải là phần cạnh bị cắt).
  5. Sửa `test_route_reaches_room_flag` cho phòng C312: kiểm tra điểm cuối tuyến cách ranh Tòa C < 10 m.
  6. Một tòa có LOD 3 nhưng chưa có đồ thị (vd. `B1.02`): tuyến không đi vào hành lang Tòa A.
- **Kiểm chứng:**
  ```powershell
  cd backend; .\.venv\Scripts\python -m pytest tests -q
  ```
  Tất cả test pass, kể cả các test cũ.

---

### Ghi chú chung
- Chiều dài vế thang 7.6 m đang là ước lượng (`TODO: kiểm chứng thực địa`). Ai đến trường thì đo lại rồi báo người làm R2 sửa trong `04`.
- Sửa xong mỗi task: chạy toàn bộ test + `load_all.sql`, rồi commit với message mô tả rõ thay đổi.
