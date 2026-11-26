// Đổi tọa độ lối đi giữa CSDL (vị trí thật) và sơ đồ model (sa bàn) bằng đúng frontend/js/frame.js của web.
// paths_tool.py dùng để kiểm tra / tự sửa hình dạng lối đi TRÊN SA BÀN, nơi người dùng vẽ và nhìn: phép dời giữa
// hai hệ làm méo góc mạnh sát các tòa lệch nhiều (vd. 15° ở CSDL thành 39° trên sa bàn).
//   node database/paths_view.mjs to-view|to-db <in.json> <out.json>   (mảng [[lng, lat], ...])
// Cần backend đang chạy (lấy footprint tòa nhà từ /api/buildings). Node >= 22 (nạp được ES module .js).
import fs from 'fs';
import { setFrameFootprints, toDb, toView } from '../frontend/js/frame.js';

const [, , dir, inp, out] = process.argv;
const api = process.env.API || 'http://127.0.0.1:8000';
setFrameFootprints(await (await fetch(`${api}/api/buildings`)).json());
const pts = JSON.parse(fs.readFileSync(inp, 'utf8'));
const conv = dir === 'to-view' ? (c) => toView(c, undefined, true) : (c) => toDb(c, true);
fs.writeFileSync(out, JSON.stringify(pts.map((c) => conv([c[0], c[1]]).slice(0, 2))));
