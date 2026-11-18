# Hướng dẫn sử dụng

Cách thao tác chi tiết với từng chức năng trên giao diện: camera, phím tắt và các panel.

[← Quay lại README](../README.md)

## A. Cốt lõi

| # | Chức năng | Cách dùng | Module |
|---|---|---|---|
| 1 | Cảnh 3D khuôn viên nhiều mức chi tiết | Nút **LOD 1/2/3** ở góc trên phải. LOD 1: khối extrude theo `height_m`. LOD 2: mô hình `.glb`. LOD 3: nội thất. Nút **↺** về góc nhìn ban đầu, nút **VỆ TINH** bật nền ảnh vệ tinh. Camera kiểu bàn xoay: kéo chuột trái để xoay ngang 360° và nghiêng 0–85° quanh tâm màn hình (tâm khuôn viên, hoặc tòa đang chọn), kéo chuột phải hoặc Shift + chuột trái (cảm ứng: kéo 1–2 ngón) để di chuyển, tâm xoay đi theo vị trí mới; cuộn để thu phóng. Để yên 6 giây thì cảnh tự xoay cùng chiều kim đồng hồ (1 vòng mỗi phút). | `layers.js`, `campus/scene.js` |
| 2 | Mô hình trong nhà theo tầng | Chọn tòa (A, B, C hoặc E) → **XEM TRONG NHÀ** → bộ chọn tầng. Vỏ tòa được ẩn, chỉ hiện phòng của tầng đang chọn. | `layers.js` (`setIndoorBuilding`, `setFloor`) |
| 3 | Xem thông tin khi bấm (click-identify) | Bấm vào tòa, phòng hoặc biểu tượng tiện ích để hiện thẻ thông tin: tên, mã, tầng, loại, sức chứa, mô tả, giờ mở cửa. | `buildings.js`, `rooms.js`, `amenities.js` |
| 4 | Tìm kiếm | Ô tìm trong **Danh sách địa điểm**. Gợi ý ngay khi gõ, không cần dấu (`thu vien`), chịu được gõ sai nhẹ (`A35`). Gõ đúng mã phòng (`A305`, `a.305`) thì phòng đó luôn đứng đầu. Enter mở kết quả đầu tiên. | `search.js` (Fuse.js) |
| 5 | Định vị kết quả | Chọn một kết quả: camera bay tới, tô vàng phòng, tự chuyển sang đúng tòa và đúng tầng. | `rooms.js` (`selectRoom`) |
| 6 | Lớp tiện ích theo danh mục | Mỗi loại có biểu tượng và màu riêng. Ô chọn trong mục **Định vị & tiện ích** vừa bật/tắt từng loại vừa là chú giải. WC và Thư viện mặc định tắt. | `amenities.js` |
| 6b | Sân thể thao | Rê chuột lên sân để tô viền, bấm vào sân để xem mã sân, loại sân, diện tích, giờ mở cửa. Tìm được trong ô tìm kiếm theo tên (`san the thao`) hoặc mã (`SF04`). Lớp vẽ trong suốt trên mặt sân của mô hình. | `sports.js` |

## B. Nên có

| # | Chức năng | Cách dùng | Module |
|---|---|---|---|
| 7 | Tô màu theo chức năng | Phòng tô theo `room_type` (chú giải ở LOD 3). Tòa nhà ở LOD 1 tô theo nhóm chức năng (chú giải góc phải). | `layers.js`, `buildings.js` |
| 8 | Liên kết chia sẻ + mã QR | `?room=A305` hoặc `?building=E` mở trang và bay thẳng tới đối tượng. Nút **Chia sẻ** (trong thẻ phòng hoặc panel tòa) sao chép liên kết và hiện mã QR. | `share.js` (qrcode-generator) |
| 9 | Vị trí của tôi | Nút **Vị trí của tôi (GPS)** dùng Geolocation API, vẽ vòng tròn sai số. Có thông báo khi người dùng từ chối quyền, mất tín hiệu, hết thời gian chờ, hoặc đang ở ngoài khuôn viên. | `geolocate.js` |
| 10 | Chỉ đường | Chọn phòng → **Chỉ đường đến phòng này**. Tuyến tính bằng pgRouting (`pgr_dijkstra`) trên đồ thị nội bộ, hiện quãng đường (m) và thời gian đi bộ ước tính (1.2 m/s, cộng 15 giây mỗi tầng phải leo). | `route.js`, `backend/services/route_service.py` |
| 11 | Giao diện điện thoại | Màn hình ≤ 720 px: thanh công cụ dồn lên trên, danh sách thành bottom sheet chiếm 55% màn hình, nút tối thiểu 40 px. | `style.css` |

## C. Nâng cao

| # | Chức năng | Cách dùng | Module |
|---|---|---|---|
| 12 | Truy vấn thuộc tính | Mục **Truy vấn phòng**: chọn tòa, tầng, loại phòng, sức chứa ≥ N → **Lọc phòng**. Kết quả được tô hồng và liệt kê; bấm vào một dòng để định vị phòng đó. | `query.js` |
| 13 | Tìm gần nhất / trong bán kính | **Click chọn vị trí giả lập** hoặc dùng GPS, kéo thanh **Bán kính** (50–300 m) để liệt kê tiện ích kèm khoảng cách. Các nút **WC / Căn tin / ATM gần nhất** tìm trong bán kính 500 m bằng `ST_DWithin` trên `::geography`. | `amenities.js`, `nearest.js` |
| 14 | Chỉ đường nhiều tầng | Cầu thang là các cạnh nối giữa các tầng (chi phí = chiều dài × 2.5). Sau khi chỉ đường, bản đồ hiện toàn tuyến rồi lần lượt bật từng tầng mà tuyến đi qua. | `route.js` |
| 15 | Mặt cắt ngang | Thanh **Mặt cắt ngang** (0–50 m) cắt bỏ phần mô hình 3D cao hơn độ cao đã chọn để nhìn vào bên trong tòa nhà. | `measure.js`, `campus/scene.js` |
| 16 | Đo đạc | **Đo khoảng cách** (m) và **Đo diện tích** (m², kèm chu vi): nhấp lần lượt các điểm. **Đo chiều cao**: nhấp vào tòa nhà để xem `height_m` và số tầng trong CSDL. Phím Esc để thoát. | `measure.js` (Turf.js) |
