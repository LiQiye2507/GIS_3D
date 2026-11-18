# Dữ liệu không gian

Nguồn hình học, cách nắn tọa độ, nội thất từng tòa, quan hệ phân cấp, quy ước độ cao và số lượng đối tượng trong CSDL.

[← Quay lại README](../README.md)

## Hệ tọa độ

Toàn bộ hình học lưu ở `EPSG:4326`; khoảng cách luôn tính bằng `::geography` (mét).

## Số lượng đối tượng

| Lớp | Bảng CSDL | Số đối tượng | Khóa ổn định |
|---|---|---|---|
| Ranh giới khuôn viên | (hằng số frontend, từ OSM) | 1 | – |
| Tòa nhà | `buildings` | 7 | `building_code` (A, B, C, D, E, NHA_PVSV, CAFE_VOI) |
| Tầng | `floors` | 28 (Tòa A: 3, B: 9, C: 3, E: 13) | `building_id` + `floor_number` |
| Phòng | `rooms` | 454 (Tòa A: 98, B: 135, C: 67, E: 154) | `room_code` (vd. `A305`, `C312`, `B1.02`, `E7.01`) |
| Tiện ích | `amenities` | 8 (3 căn tin, 1 ATM, 1 nước uống, 3 bãi xe) | `id` |
| Sân thể thao | `sports_fields` | 9 (tách từ mô hình 3D) | `field_code` (SF01–SF09) |
| Mạng lưới đường đi | `campus_paths` | 133 cạnh (đường ngoài trời 62, hành lang 57, cầu thang 14) | `id`, `source_node`, `target_node` |

## Nguồn hình học và cách nắn tọa độ

Mô hình 3D toàn trường (`frontend/models/uit_campus.glb`) là chuẩn vị trí. Footprint các tòa được lấy từ mô hình và quy đổi sang WGS84 bằng một phép đồng dạng (tỉ lệ 0,969, xoay 0,63°, fit với footprint OSM của 5 tòa). Phòng, sàn và tiện ích của mỗi tòa được dời và xoay theo tòa đó, còn lối đi, cổng và ranh giới được dời theo các tòa lân cận. Cách tính nằm trong `Models_3D/scripts/04_align_gis_to_model.py`. Footprint tòa nhà và lối đi ban đầu lấy từ OpenStreetMap.

Mô hình là sa bàn cách điệu nên mỗi tòa lệch khỏi vị trí thật vài mét đến khoảng 19 m. Sau bước trên, toàn bộ dữ liệu được dời về vị trí mái nhà trên ảnh vệ tinh Esri World Imagery bằng `Models_3D/scripts/08_align_to_satellite.py`: mỗi tòa dịch (và xoay, với Tòa B) theo độ lệch đo trên ảnh, phòng, sàn, tiện ích đi theo tòa, lối đi, cổng và sân thể thao dời theo nội suy từ các tòa lân cận; ranh giới khuôn viên giữ nguyên. Vì vậy khoảng cách và đường đi tính trong CSDL theo vị trí thật. Khi xem ở sơ đồ model, frontend (`frontend/js/frame.js`) dời dữ liệu ngược lại cho khớp sa bàn; ở chế độ vệ tinh, các tòa trong mô hình được dời tới vị trí thật. Bảng độ lệch dùng chung: `SAT_ALIGN` trong `frontend/js/campus/geo.js` (trùng `SAT` trong script 08).

## Nội thất LOD 3

### Tòa A, B, E

Sinh bởi `Models_3D/scripts/07_import_lod3.py`. Tòa A và Tòa E (mã dạng `E7.01`, hội trường `HTE`) lấy theo bộ mô hình nội thất LOD 3 dựng từ sơ đồ tầng; Tòa B bố trí theo sơ đồ tầng của trường (phòng đánh số từ đông sang tây), hình dạng ô phòng cắt theo khối tòa trong mô hình 3D. Dữ liệu lưu ở `dataset/rooms.geojson` + `database/03_toa_a_indoor.sql` (Tòa A) và `dataset/rooms_b_e.geojson`, `dataset/floors_b_e.geojson` + `database/06_toa_b_e_indoor.sql` (Tòa B, E). Tọa độ được quy đổi về cùng hệ với mô hình khuôn viên (sai số khớp khoảng 6 mm; Tòa E bù thêm tỉ lệ và góc xoay để nằm trong vỏ tòa, sai lệch còn dưới 1 m). Vị trí phòng chỉ gần đúng (chưa đo đạc thực địa).

### Tòa C

Tòa C không đi qua `07_import_lod3.py` (script này giữ nguyên phần Tòa C có sẵn). 3 tầng và 67 phòng của Tòa C nằm chung file với Tòa A (`dataset/floors.geojson`, `dataset/rooms.geojson`) và được nạp bằng `database/02_seed_uit_data.sql`. Đây là lưới phòng **tạm**, sinh tự động từ bố cục `floorplan_toa_C_layout.csv` trên footprint Tòa C tạm (thuộc tính `source = 'generated'`, `verified = false`), sau đó được dời theo mô hình bằng `04_align_gis_to_model.py`. Lưới này không có sân trong như mô hình, nên khoảng 5% diện tích phòng nhô ra ngoài vỏ tòa.

Cần bổ sung: script sinh lưới phòng Tòa C và file `floorplan_toa_C_layout.csv` không có trong repo; sơ đồ tầng thật của Tòa C chưa được số hóa.

### Sân thể thao

9 sân tách từ mặt sân của mô hình 3D, lưu ở `dataset/sports_fields.geojson` (`Models_3D/scripts/06_extract_sports_fields.py`), nạp vào bảng `sports_fields` (`database/05_sports_fields.sql`). Loại sân (`sport_type`) và giờ mở cửa để trống, mọi sân có `verified = false`.

## Quan hệ phân cấp

**Tòa nhà → tầng → phòng**, cộng với lớp tiện ích. Nhà vệ sinh (WC) và Thư viện được lưu là phòng (`rooms.room_type`) và được API tiện ích trả về như một danh mục tiện ích, lấy tâm phòng làm vị trí. Phòng Y tế (A103, tầng 1 Tòa A) cũng được trả về theo cách này với danh mục `Medical`; các phòng có tên bắt đầu bằng "Hội trường" (`A.HT` tầng 3 Tòa A, `HTE` tầng 12 Tòa E) được trả về với danh mục `Hall`. Biểu tượng của tiện ích trên tầng cao được đặt đúng độ cao sàn phòng.

## Quy ước độ cao tầng

Mỗi tầng cao 3.8 m. `base_height = (tầng − 1) × 3.8`, `extrude_height = base_height + 3.5` (hành lang chỉ dày 0.2 m).

## File dữ liệu và script xử lý

- `dataset/`: bộ dữ liệu chuẩn GeoJSON: `buildings`, `floors`, `rooms`, `amenities`, `paths`, `campus_boundary`; `sports_fields` (sân thể thao tách từ model, nạp bằng `database/05_sports_fields.sql`); `rooms_b_e`, `floors_b_e` (nội thất LOD 3 Tòa B, E, nạp bằng `database/06_toa_b_e_indoor.sql`).
- `database/`: `01_schema.sql`, `02_seed_uit_data.sql`, `03_toa_a_indoor.sql`, `04_campus_graph.sql`, `05_sports_fields.sql`, `06_toa_b_e_indoor.sql`, `checks.sql`, `load_all.sql` (nạp tất cả bằng 1 lệnh).
- `Models_3D/scripts/`:
  - `01_prepare_gis_data.py`: tiền xử lý GeoJSON trong `dataset/` (GeoPandas, chuyển sang UTM 48N) để dựng model.
  - `02_build_uit_models.py`, `03_render_and_verify.py`: dựng model tách tòa và render kiểm tra (chạy trong Blender); `live_hot_reload.py`: tự nạp lại `02` trong Blender khi sửa script.
  - `04_align_gis_to_model.py`: nắn `dataset/` và `database/` theo model.
  - `05_export_web_glb.py`: xuất bản nén cho frontend.
  - `06_extract_sports_fields.py`: tách sân thể thao, sinh `dataset/sports_fields.geojson` và `database/05_sports_fields.sql`.
  - `07_import_lod3.py`: nạp nội thất LOD 3 Tòa A, B, E vào `dataset/` và `database/03`, `06`.
  - `08_align_to_satellite.py`: dời `dataset/` và `database/` từ vị trí model về vị trí thật trên ảnh vệ tinh (chạy một lần, có đánh dấu để không dời hai lần). Dữ liệu hiện tại đã có chỉnh sửa tay sau các script 04, 06, 07, nên không chạy lại các script đó.
  - File model nguồn (`.blend`, `.glb`) không đưa lên repo.
