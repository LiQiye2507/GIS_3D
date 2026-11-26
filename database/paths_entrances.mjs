// Tìm "lối vào tòa" trong dataset/paths.geojson: đầu lối cụt (chỉ 1 lối dùng) nằm trong 3 m quanh một tòa, đo trên
// SA BÀN (đúng như trang ?edit=paths tô chấm xanh dương). Tòa trên sa bàn bị dời khác vị trí thật (vd. Cafe Voi ~23 m)
// nên không đo được trong CSDL. paths_tool.py sync ghi kết quả vào bảng path_entrances.
//   node database/paths_entrances.mjs <paths.geojson> <out.json>   -> [{ building_code, lng, lat }]
// Cần backend đang chạy (lấy footprint tòa từ /api/buildings). Node >= 22.
import fs from 'fs';
import { setFrameFootprints, toView } from '../frontend/js/frame.js';

const [, , inp, out] = process.argv;
const api = process.env.API || 'http://127.0.0.1:8000';
const bfc = await (await fetch(`${api}/api/buildings`)).json();
setFrameFootprints(bfc);
const MO = [106.8037, 10.8705];
const MX = 111320 * Math.cos((MO[1] * Math.PI) / 180);
const MY = 110574;
const vm = (v) => [(v[0] - MO[0]) * MX, (v[1] - MO[1]) * MY];
const rings = bfc.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
  .map((poly) => ({ code: f.properties.building_code, ring: poly[0].map((c) => vm(toView(c, f.properties.building_code))) })));
function dist(p, ring) {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [a, b] = [ring[j], ring[i]];
    if ((b[1] > p[1]) !== (a[1] > p[1]) && p[0] < ((a[0] - b[0]) * (p[1] - b[1])) / (a[1] - b[1]) + b[0]) inside = !inside;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return inside ? 0 : best;
}
const P = JSON.parse(fs.readFileSync(inp, 'utf8'));
const key = (c) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
const deg = new Map();
P.features.forEach((f) => f.geometry.coordinates.forEach((c, i, a) => {
  deg.set(key(c), (deg.get(key(c)) || 0) + (i === 0 || i === a.length - 1 ? 1 : 2));
}));
const res = [];
const seen = new Set();
P.features.forEach((f) => {
  const c = f.geometry.coordinates;
  [c[0], c[c.length - 1]].forEach((e) => {
    if (deg.get(key(e)) !== 1 || seen.has(key(e))) return;
    const p = vm(toView(e, undefined, true));
    const best = rings.map((r) => ({ code: r.code, d: dist(p, r.ring) })).sort((a, b) => a.d - b.d)[0];
    if (best && best.d <= 3) {
      seen.add(key(e));
      res.push({ building_code: best.code, lng: e[0], lat: e[1], path_id: f.properties.id });
    }
  });
});
fs.writeFileSync(out, JSON.stringify(res));
