# Báo cáo gộp dữ liệu

Sinh tự động bởi `dataset/scripts/merge_dataset.py`. Không sửa tay.

## Số lượng

| Lớp | Đầu vào | Đầu ra |
|---|---|---|
| buildings | 6 (processed/uit_buildings_draft.geojson) | 6 |
| floors | 3 C (floors_C_3d) + 3 A (sơ đồ khảo sát) | 6 |
| rooms | 67 C (rooms_C_3d) + 56 A trong survey (+ hành lang/cầu thang/WC theo sơ đồ) | 145 |
| amenities | 12 POI + 4 GCP (survey_poi_and_gcp_template.csv) | 6 |
| paths | 33 (processed/uit_paths_osm_filtered.geojson) | 33 |
| campus_boundary | 1 (processed/uit_campus_boundary.geojson) | 1 |

Phòng theo tầng: A1=40, A2=16, A3=22, C1=20, C2=23, C3=24

## Kiểm tra tự động

- ID duy nhất, hình học hợp lệ (vòng khép kín, >= 4 điểm, không tự cắt), tọa độ trong vùng UIT: **ĐẠT**

## Vấn đề còn lại (để null / cần kiểm chứng)

| Lớp | Đối tượng | Vấn đề |
|---|---|---|
| rooms | A.127 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.125 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.123 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.121 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1B1 | survey ghi 'A.181', ảnh danh sách phòng ghi 'A.1B1' -> dùng mã theo ảnh |
| rooms | A.1B1 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1B3 | survey ghi 'A.183', ảnh danh sách phòng ghi 'A.1B3' -> dùng mã theo ảnh |
| rooms | A.1B3 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1A8 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1A6 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1B2 | survey ghi 'A.182', ảnh danh sách phòng ghi 'A.1B2' -> dùng mã theo ảnh |
| rooms | A.1B2 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1B4 | survey ghi 'A.184', ảnh danh sách phòng ghi 'A.1B4' -> dùng mã theo ảnh |
| rooms | A.1B4 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1A4 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | A.1A2 | survey chưa có tên -> lấy tên từ ảnh danh sách phòng |
| rooms | C1-STORE1 | Kho đang gán room_type 'WC' (enum không có loại Kho) |
| rooms | C2-STORE1 | Kho đang gán room_type 'WC' (enum không có loại Kho) |
| rooms | C3-STORE1 | Kho đang gán room_type 'WC' (enum không có loại Kho) |
| buildings | C | footprint tạm (không có trên OSM) - cần số hóa lại trên ảnh vệ tinh |
| amenities | P004 | chưa có tọa độ -> không đưa vào (Bãi đỗ xe vòng số 8 (bên hông Tòa A)) |
| amenities | P006 | loại 'Gate' ngoài enum amenities -> không đưa vào (Cổng 1 (Cổng A - Đường Hàn Thuyên)) |
| amenities | P007 | loại 'Gate' ngoài enum amenities -> không đưa vào (Cổng 2 (Cổng B)) |
| amenities | P008 | loại 'Sport' ngoài enum amenities -> không đưa vào (Sân Bóng UIT) |
| amenities | P009 | loại 'Library' ngoài enum amenities -> không đưa vào (Thư viện ĐH CNTT) |
| amenities | P012 | chưa có tọa độ -> không đưa vào (Phòng Y tế Sinh viên) |
