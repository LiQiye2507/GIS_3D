# Hướng dẫn Khảo sát Thực địa UIT (Cầm tay khi ra trường)

Mục tiêu: Thu thập & kiểm chứng đúng các phần còn thiếu/chưa chắc chắn sau khi đã đối chiếu với dữ liệu OpenStreetMap (`dataset/processed/osm_uit_preview.png`).

---

## 0. Những phát hiện quan trọng từ dữ liệu OSM vừa kéo về (Để bạn đối chiếu nhanh)
1. **Tòa C hiện CHƯA CÓ đa giác (footprint) trên OpenStreetMap!** OSM mới chỉ có **3 điểm cửa vào (`entrance`)** nằm thẳng hàng ở phía Bắc sân bóng: `(10.869596, 106.802865)`, `(10.869600, 106.803428)`, `(10.869521, 106.803670)`. -> Cần vẽ lại footprint Tòa C trên ảnh vệ tinh QGIS và kiểm chứng góc/chiều dài ngoài thực tế.
2. **Thư viện UIT** trên OSM (`2645632780`) nằm ngay trong **cánh Bắc của Tòa A** (`10.870660, 106.803024`).
3. **Căn tin UIT** (`722732584`) trên OSM ghi nhận **2 tầng**, nằm ở góc Đông (`10.869887, 106.804534`).
4. **Có 3 khối nhà trên OSM chưa có tên** cần kiểm chứng xem là công trình gì (nhà bảo vệ, trạm điện, nhà thi đấu, hay công trình cũ):
   - `way 490935521` (OSM ghi 2 tầng, phía Đông-Nam, giữa Căn tin và Cổng B).
   - `way 490935520` (ngay sát Cổng B).
   - `way 1459032884` (khối nhỏ 56 m² sát cánh Tây Tòa A).
5. **Hướng bản đồ:** Sơ đồ minh họa `so_do_tong_mat_bang_UIT.png` bị xoay/đảo vị trí tương đối so với thực tế Bắc-Nam; khi làm GIS sẽ bám theo tọa độ thật (`osm_uit_preview.png`).

---

## 1. Dụng cụ cần chuẩn bị trên điện thoại
- App đo GPS hiển thị kinh độ/vĩ độ thập phân (`WGS84 / EPSG:4326`) và sai số mét: khuyến nghị **GPS Test**, **SW Maps**, hoặc **QField** (Android) / **GPS Coordinates** (iOS).
- 3 bảng mẫu trong `dataset/field_survey/`:
  1. `survey_buildings_template.csv`
  2. `survey_floorplans_template.csv`
  3. `survey_poi_and_gcp_template.csv`

> **Mẹo đo GPS chính xác:** Đứng nơi thoáng (tránh sát vách kính Tòa E hoặc dưới mái tôn), chờ **30–60 giây** cho sai số (`Accuracy`) xuống `< 5m` rồi ghi lại `lat`, `lon` và `gnss_accuracy_m`.

---

## 2. Checklist kiểm tra từng tòa nhà (`survey_buildings_template.csv`)

1. **Tòa A & Thư viện:**
   - Đếm tổng số tầng thực tế của các khối thuộc Tòa A (và kiểm tra Thư viện 2 tầng chiếm cánh nào của Tòa A).
   - Xác nhận 3 giảng đường `A.GĐ1`, `A.GĐ2`, `A.GĐ3` nằm ở tầng nào.
   - Chụp ảnh sơ đồ thoát hiểm (PCCC) / danh sách phòng từng tầng của Tòa A & Thư viện.
2. **Tòa B:**
   - Xác nhận cấu trúc bậc thang **9 tầng** (trên ảnh chụp trên cao thấy các cánh thấp dần từ 9 tầng xuống) — chụp sơ đồ thoát hiểm các tầng để biết chính xác từng tầng kết thúc ở cánh nào.
3. **Tòa C (Trọng điểm LOD 3 Indoor):**
   - Xác nhận đúng **3 tầng** (`Tầng 1–3`).
   - **Xác định hướng sơ đồ:** Đầu chứa `C101 / C102 / HỒ NƯỚC` (khối mái cam trong ảnh trên cao) nằm về phía **Tòa B / Căn tin (hướng Đông)** hay phía **Tòa E (hướng Tây)**?
   - Kiểm tra **3 phòng `C112`, `C114`, `C215`** (có trong Excel nhưng không có trên sơ đồ) xem thực tế có tồn tại không.
   - Xem biển tên phòng để giải nghĩa **`Phòng WB`** và **`Phòng LV`**.
4. **Tòa D:**
   - Đếm số tầng thực tế (gần Cổng B / Cổng 2), ghi sơ đồ phòng/chức năng.
5. **Tòa E:**
   - Xác nhận **13 mức sàn** (`Tầng G` + `Tầng 1–12`).
   - Kiểm tra phòng **`E4.1`** (phòng thí nghiệm hay phòng học) và **`E11.5`**.
   - Ước lượng chiều cao tầng `G` (sảnh/bãi xe ô tô) so với các tầng trên.
6. **Nhà PVSV (Căng tin) & 3 khối chưa rõ tên (`490935521`, `490935520`, `1459032884`):**
   - Xác nhận Căng tin đúng **2 tầng** như OSM hay không, ghi giờ mở cửa.
   - Kiểm tra 3 khối chưa rõ tên trên OSM là công trình gì (hay cần xóa/gộp).

---

## 3. Cách thu thập nhanh sơ đồ phòng học các tòa (`survey_floorplans_template.csv`)
- **Cách nhanh và chính xác nhất:** Vào sảnh thang máy / cầu thang mỗi tầng chụp rõ **bảng Sơ đồ thoát hiểm (PCCC)** dán trên tường (hoặc chụp bảng danh sách phòng ở sảnh).
- Sau khi bạn gửi bộ ảnh sơ đồ + số tầng về, tôi sẽ nhập chuẩn hóa vào `survey_floorplans_template.csv` và chạy script tự động sinh hình học 3D cho từng tòa.

---

## 4. Điểm khống chế (GCP) & Tiện ích cần chấm GPS (`survey_poi_and_gcp_template.csv`)
1. **Kiểm chứng điểm đã có từ OSM:**
   - Cổng A / Cổng 1 (`10.870437, 106.802055`) và Cổng B / Cổng 2 (`10.868997, 106.803924`).
   - Bãi xe máy phía Bắc Tòa A (`10.871356, 106.802923`) — kiểm tra xem còn bãi xe nào gần Cổng 1 hoặc vòng số 8 không.
   - Đứng đo thử GPS tại **2–4 góc Tòa C** (nơi chưa có trên OSM) và **góc Tòa E, Căn tin** để làm GCP đối chiếu độ lệch của ảnh vệ tinh.
2. **Tiện ích mới cần thu thập (OSM & tài liệu hiện chưa có):**
   - Vị trí **Trụ ATM** (tên ngân hàng, giờ hoạt động).
   - Vị trí **Cây nước uống** (tòa nào, tầng mấy, gần phòng/cầu thang nào).
   - **Phòng Y tế Sinh viên** (tòa nào, tầng mấy, giờ mở cửa).
   - **Thang máy** tại các tòa (B, C nếu có, E, A).
