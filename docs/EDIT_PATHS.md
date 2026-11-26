# Sửa mạng lối đi

Cách sửa lối đi ngoài trời (`Walkway`) để chức năng chỉ đường đi đúng mặt đường, rồi nạp vào CSDL.

[← Quay lại README](../README.md)

## Cách 1: Sửa ngay trên web (khuyên dùng)

Cần dự án đang chạy bằng Docker (`docker compose up -d`), có Python 3 và Node.js ≥ 22. Lệnh `fix`/`issues` dùng `database/paths_view.mjs` (chạy chính `frontend/js/frame.js`) để kiểm tra và sửa hình dạng lối **trên sa bàn**, đúng như bạn thấy. Đo ở tọa độ thật thì sát các tòa lệch nhiều, góc giữa hai lối có thể sai tới vài chục độ.

### Mở chế độ sửa

Mở trình duyệt tại **http://localhost:5500/?edit=paths**.

Bảng **Sửa lối đi** hiện ở góc trái. Bản đồ chuyển sang nhìn thẳng xuống, và trên bản đồ có:

| Ký hiệu | Ý nghĩa |
|---|---|
| Đường **cam** | Lối đi (đường **xanh lơ** là lối đang chọn) |
| Chấm **trắng** | Đỉnh của lối đi, kéo được |
| Chấm **xanh lá** | Chỗ nhiều lối đi chung một đỉnh (đã nối) |
| Chấm **đỏ** | Đầu cụt: lối đi dừng ở đó. Đúng nếu là cửa vào tòa, sai nếu lối đi bị hở |
| Chấm **xanh dương** | Lối vào tòa: đầu lối đi chạm tòa (trong 3 m). Tuyến chỉ đường kết thúc đúng ở các chấm này |
| Vòng **hồng** đậm | Nếp gấp: lối rẽ gắt hơn 100° (đo trên sa bàn, cập nhật ngay khi sửa) |
| Vòng **cam** | Hai nút cách nhau dưới 2,5 m, hoặc lối ngắn dưới 1,5 m: nên gộp |
| Vòng **vàng** | Hai lối cắt nhau mà chưa có nút chung |
| Vòng **hồng** nhạt | Chỗ cần xem, do lệnh `paths_tool.py issues` tìm ra |

Mục **Kiểm tra** trên bảng đếm các lỗi này. Nút **Lỗi tiếp ▶** (phím **F**) đưa bản đồ tới từng chỗ và chọn sẵn đỉnh ở đó.

### Thao tác

| Muốn làm | Thao tác |
|---|---|
| Nắn lối đi về giữa mặt đường | **Kéo** chấm trắng. Kéo một chỗ nối thì mọi lối đi chung đỉnh đó cùng di chuyển. |
| Thêm điểm ở khúc cong | **Double-click** lên lối đi. |
| Vẽ lối mới | Bấm **Vẽ lối mới** (hoặc phím **N**), **click** từng điểm dọc giữa đường, rồi nhấn **Enter** hoặc double-click để xong. **Esc** để hủy. |
| Nối hai lối | Kéo hoặc click điểm **sát** lối kia: nó tự dính vào đỉnh hay cạnh trong vòng 10 px. Dính rồi thì chấm chuyển xanh lá, hết đỏ. |
| Xóa một điểm | **Chuột phải** lên chấm. |
| Xóa cả lối | **Chuột phải** lên lối đi, hoặc chọn lối rồi nhấn **Delete**. |
| Chọn | **Click** lên lối (hoặc lên chấm để chọn đỉnh). **Shift+click** chọn thêm, **Shift+kéo** chọn các lối trong khung, **Ctrl+A** chọn tất cả, **Esc** bỏ chọn. |
| Nhích đỉnh cho chính xác | Chọn đỉnh rồi bấm **phím mũi tên** (giữ Shift để nhích xa hơn). |
| Tách một lối khỏi chỗ nối | **Alt+kéo** chấm: chỉ đỉnh của lối đó di chuyển. |
| Vẽ thẳng hàng / vuông góc | Giữ **Shift** khi vẽ: góc khóa theo bội 15° so với đoạn trước. Nhãn vàng cạnh chuột cho biết độ dài và góc rẽ. **Alt** để không bắt dính, **Backspace** bỏ điểm vừa thêm. |
| Tách / ghép lối | Chọn đỉnh rồi nhấn **S** để tách lối tại đó. **J** ghép 2 lối nối đuôi nhau thành một. |
| Hoàn tác / làm lại | **Ctrl+Z** / **Ctrl+Y** |

### Chuẩn hóa

Các công cụ này áp dụng cho các lối đang chọn. Nếu chưa chọn lối nào thì áp dụng cho toàn bộ, riêng **Làm thẳng** bắt buộc phải chọn trước. Mọi phép đều đo trên sa bàn, giữ nguyên đầu mút và chỗ nối, không tạo đoạn cắt qua tòa nhà, và hoàn tác được bằng Ctrl+Z.

| Nút (phím) | Tác dụng |
|---|---|
| **Làm thẳng** (T) | Bỏ mọi đỉnh giữa lối, chỉ giữ hai đầu và chỗ nối với lối khác. |
| **Giản lược** (G) | Bỏ các đỉnh lệch khỏi đường thẳng ít hơn số mét đã nhập (mặc định 1 m), giữ các khúc cong thật. |
| **Gộp nút gần** (W) | Dồn các nút cách nhau dưới số mét đã nhập (mặc định 3 m) về một nút; đầu cụt sát cạnh lối khác thì dính vào cạnh đó; xóa lối bị co lại hoặc trùng nhau. Dùng để dọn các tam giác nhỏ ở ngã ba, như chỗ Cafe Voi trước đây. |
| **Chuẩn hóa nhanh** | Gộp nút gần rồi Giản lược, tính là một lần hoàn tác. |
| Đổi nền | Nút **Vệ tinh / Sơ đồ**. Vẽ ở nền nào cũng được, dữ liệu luôn lưu theo vị trí thật. |

Nếu lỡ tải lại trang thì không mất gì: bản đang sửa được tự lưu tạm trong trình duyệt, và lần mở sau web sẽ hỏi có mở lại không.

### Lưu và nạp vào CSDL

1. Bấm **Lưu (tải paths.geojson)**. File được tải về thư mục **Downloads**.
2. Ở thư mục dự án, chạy:

   ```powershell
   python database/paths_tool.py apply
   ```

   Lệnh này lấy file `paths*.geojson` mới nhất trong Downloads, chép đè `dataset/paths.geojson` (bản cũ để ở `dataset/paths.geojson.bak`), **tự sửa các lỗi vẽ thường gặp** (xem lệnh `fix` bên dưới), sinh lại khối `INSERT` trong `02_seed_uit_data.sql`, nạp lại CSDL và in kết quả kiểm tra.
3. Kết quả cần có: `e_all_graph_components|1`, nghĩa là mạng đường liền một khối.
4. Tải lại trang `?edit=paths`: các vòng hồng đã được cập nhật theo dữ liệu mới. Mở trang thường http://localhost:5500 để thử **Chỉ đường**.

Lặp lại tới khi không còn chấm đỏ hay vòng hồng nào vô lý.

### Mẹo

- **Trước mỗi lần sửa, nhấn Ctrl+F5** để chắc trang đang dùng dữ liệu và code mới nhất. Nếu trang đã mở từ trước, bản Lưu sẽ ghi đè mất các chỉnh sửa đã nạp sau đó.
- Muốn dời một lối mà không kéo theo lối khác: đừng kéo **chấm xanh lá** (nút chung), vì mọi lối dùng chung nút đó sẽ bị kéo theo.

- Chỉ vẽ chỗ **người đi bộ đi được**. Không vẽ băng qua bãi cỏ hay khối nhà.
- **Cửa vào tòa:** cho đầu lối đi chạm sát mép tòa (trong khoảng 3 m), chấm chuyển xanh dương. Tuyến chỉ đi theo các lối bạn vẽ và kết thúc ở lối vào gần phòng đích nhất (tính cả quãng từ lối vào tới phòng); hệ thống không tự nối thêm lối vào nào. Chỉ tòa chưa có lối vào nào mới được nối thẳng từ lối đi gần nhất. Với Tòa A, các lối vào này đồng thời là cửa vào hành lang tầng 1.
- Các lối có `id` bắt đầu bằng `osm_` là đường bên ngoài cổng (Hàn Thuyên, đường ra Xa lộ Hà Nội). Chỉ sửa khi thật cần.
- Không chạy bằng Docker: trang sửa không tự đọc được dữ liệu. Bấm **Mở file…** và chọn `dataset/paths.geojson`. Sau khi Lưu thì chạy `paths_tool.py sync` và tự nạp CSDL theo [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md).

## Cách 2: Sửa bằng QGIS

Dùng khi cần sửa nhiều và quen QGIS.

1. **Thêm nền vệ tinh:** XYZ Tiles → New Connection, URL `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`, max zoom 19.
2. **Thêm các lớp:** kéo vào `dataset/paths.geojson` (lớp cần sửa), `dataset/buildings.geojson` và `dataset/path_issues.geojson`. Đặt CRS project là `EPSG:3857`.
3. **Bật Snapping:** *Project → Snapping Options*, chọn Vertex + Segment, 12 px, bật **Topological Editing**.
4. Sửa lớp `paths` (bút chì → Vertex Tool / Add Line Feature), rồi **Ctrl+S**.
5. Chạy lệnh:

   ```powershell
   python database/paths_tool.py sync reload issues
   ```

## Các lệnh của `database/paths_tool.py`

| Lệnh | Việc làm |
|---|---|
| `apply` | Lấy file Lưu mới nhất từ Downloads, rồi chạy `sync`, `fix`, `issues` |
| `fix` | Tự sửa lỗi vẽ thường gặp rồi nạp lại CSDL: đầu lối suýt chạm (< 3 m) thì dính vào; lối tự quay ngược hoặc có mũi nhọn ở nút chung thì nắn lại; hai lối chồng nhau một đoạn ngắn ở nút thì dời chỗ nối về điểm tách; chỗ hở < 25 m mà phải đi vòng > 2,5 lần thì nối (không nối vào lối vào tòa nhà; lối nối tự động `gapfix_*` mà bạn đã xóa trên web được `apply` ghi vào `dataset/paths_nolink.json` và không bị nối lại). In ra từng thay đổi. |
| `sync` | `dataset/paths.geojson` → khối `INSERT campus_paths` trong `02_seed_uit_data.sql`. Không sửa tay khối này. |
| `reload` | Nạp lại toàn bộ CSDL trong Docker và in `checks.sql`. Cần a=0, b=0, d=1, e=1, f=0. |
| `issues` | Xuất `dataset/path_issues.geojson` (vòng hồng ở trang sửa): `detour` là hai điểm gần nhau nhưng phải đi vòng, `dead_end` là đầu cụt, `island` là cụm tách rời, `fold` là nếp gấp (lối tự quay ngược, hoặc hai lối rời một nút gần như cùng hướng nên tuyến phải đi tới rồi quay lại; hay gặp khi kéo nút chung lệch khỏi đường). |
