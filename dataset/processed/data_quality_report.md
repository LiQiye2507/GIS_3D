# Báo cáo Chuẩn hóa Dữ liệu Phòng học UIT

## 1. Thống kê tổng hợp
- Tổng số phòng chuẩn hóa từ `rooms_by_floor.csv`: **168** phòng.
- Phân bố theo tòa: **A** (10), **B** (74), **C** (48), **E** (36)
- Phân bố theo `room_type` (`01_schema.sql`): `Lab` (8), `Office` (19), `Theory` (139), `WC` (2)
- Tổng số khối lưới Tòa C (gồm cả WC, Cầu thang, Kho, Hồ nước): **67** khối trên 3 tầng.

## 2. Các điểm cần xác minh thực địa (Phát hiện tự động)
- `A` / `A.GĐ1`: không có trong sơ đồ Tầng 1–3 Tòa A, loại khỏi LOD 3 (TODO: kiểm chứng thực địa).
- `A` / `A.GĐ2`: không có trong sơ đồ Tầng 1–3 Tòa A, loại khỏi LOD 3 (TODO: kiểm chứng thực địa).
- `A` / `A.GĐ3`: không có trong sơ đồ Tầng 1–3 Tòa A, loại khỏi LOD 3 (TODO: kiểm chứng thực địa).
- Tòa C / `C112` (tầng 1): có trong danh sách Excel nhưng KHÔNG có trong sơ đồ tầng.
- Tòa C / `C114` (tầng 1): có trong danh sách Excel nhưng KHÔNG có trong sơ đồ tầng.
- Tòa C / `C215` (tầng 2): có trong danh sách Excel nhưng KHÔNG có trong sơ đồ tầng.
- Tòa C có nhãn `Phòng WB` và `Phòng LV` chưa rõ tên đầy đủ (hiện tạm gán `WB -> Theory`, `LV -> Office`).
- Tòa E (`E4.1`): danh sách ghi Phòng thí nghiệm, sheet ẩn ghi Phòng học 54 chỗ.
- Tòa E (`E11.5`): có trên sơ đồ, không có trong danh sách phòng.
