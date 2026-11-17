# Bộ dữ liệu thô khuôn viên UIT (ĐHQG-HCM)

Lập ngày 13/11/2026 từ: file Excel thống kê phòng học, sơ đồ tổng mặt bằng và 6 ảnh chụp trên cao do bạn cung cấp, cùng một số trang web của trường.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `UIT_bo_du_lieu_tho.xlsx` | Bản tổng hợp: thuộc tính tòa nhà, phòng theo tầng, sơ đồ tầng tòa C, POI, các chỗ không khớp của dữ liệu |
| `01_raster/so_do_tong_mat_bang_UIT.png` | Sơ đồ tổng mặt bằng (minh họa, không tỷ lệ, không tọa độ) |
| `01_raster/anh_tren_cao/anh_1..6.png` | Ảnh chụp xiên từ trên cao (không phải ảnh vệ tinh hay trực giao) |
| `02_buildings/buildings_attributes.csv` | Thuộc tính tòa A, B, C, D, E, Thư viện, Nhà PVSV |
| `03_floorplans/rooms_by_floor.csv` | Danh sách phòng theo tòa và tầng (179 dòng) |
| `03_floorplans/floorplan_toa_C_layout.csv` và `Toa_C_so_do_cac_tang.png` | Bố cục mặt bằng 3 tầng tòa C |
| `04_poi/poi_coordinates.csv` | POI có vị trí tương đối trên sơ đồ, cột lat/lon để trống |
| `scripts/` | `fetch_uit_osm.py` (tòa nhà, POI, lối đi từ OpenStreetMap), `merge_dataset.py` (gộp thành `processed/final/`) |

CSV dùng UTF-8; mở bằng Excel qua Data > From Text/CSV, chọn UTF-8.

## Kết quả chính

Số tầng và chiều cao tương đối (theo số mức sàn, tòa E = 1,00):

| Tòa | Số tầng | Chiều cao tương đối | Căn cứ |
|---|---|---|---|
| E | Tầng G và Tầng 1-12 (13 mức sàn) | 1,00 | Danh sách phòng tòa E trong file Excel |
| B | 9 | 0,69 | Sơ đồ khu B (Tầng 1-9) |
| C | 3 | 0,23 | Sơ đồ khu C (Tầng 1-3) |
| A | Tối thiểu 3 | 0,23 | Mã phòng A2xx, A3xx; chưa có sơ đồ khu A |
| Thư viện | 2 (trệt và 1 lầu) | 0,15 | Trang thuvien.uit.edu.vn |
| D | Chưa có dữ liệu | | Chỉ có vị trí trên sơ đồ |

Các số này lấy từ tài liệu của trường, chưa kiểm chứng thực địa. Ảnh chụp trên cao khớp về thứ tự cao thấp (tháp E cao nhất, khối cong B cao, khối dài 3 tầng nhiều khả năng là C), nhưng tôi không đếm tầng từ ảnh.

Sơ đồ tầng: chọn tòa C (3 tầng, có đủ bố cục phòng, cầu thang, WC, kho). Tòa B có danh sách phòng 9 tầng; tòa E có chức năng theo từng tầng (Tầng G đến 12), đều nằm trong `rooms_by_floor.csv`.

POI: có căng tin (Nhà PVSV), bãi đỗ xe, Cổng 1, Cổng 2, sân thể thao với tọa độ pixel trên sơ đồ (`map_x_px`, `map_y_px`, ảnh 1534 x 1536, gốc trên-trái). Đây là vị trí tương đối, không phải lat/lon.

## Còn thiếu

- Ảnh vệ tinh hoặc ảnh trực giao có tọa độ. Ảnh nền: dùng Esri World Imagery trong QGIS (xem điều khoản và ghi nguồn), hoặc Sentinel-2 cho nền tổng quan.
- Tọa độ lat/lon của mọi POI. Đo bằng app GPS ngoài trời 30-60 giây, ghi sai số vào `gnss_accuracy_m`. ATM và cây nước uống chưa có dữ liệu nào trong các nguồn.
- Số tầng tòa D; kiểm tra số tầng tòa A và Thư viện (nguồn ghi thư viện thuộc Khu A, chưa rõ 2 tầng là của riêng thư viện hay cả khối).
- Sơ đồ tầng tòa E (hiện chỉ có danh sách chức năng) và tòa A.
- Sơ đồ tổng mặt bằng không có tỷ lệ: muốn dùng trong GIS cần georeference bằng ít nhất 4 điểm đo thực địa.

## Lưu ý về nguồn

- 6 ảnh trên cao là ảnh chụp xiên, nên không dùng làm raster nền GIS được. Ảnh 2-6 có watermark "Kỳ Yêu Sài Gòn Photography"; quyền sử dụng chưa rõ, hãy xin phép trước khi công bố.
- Dữ liệu trong file Excel có vài chỗ không khớp (tổng chỗ ngồi 7.033 so với 7.083 cộng theo dòng, tổng số phòng 94/95, hai sheet ẩn có số liệu khác). Chi tiết trong sheet `Luu_y_du_lieu`.
- Diện tích trường khác nhau giữa các nguồn (12,3 ha; 133.900 m2 theo quy hoạch 1/500; gần 14 ha), nên nêu rõ nguồn khi trích.
- OpenStreetMap: © OpenStreetMap contributors (ODbL).
