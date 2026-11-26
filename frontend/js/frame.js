// Đổi tọa độ giữa CSDL (vị trí thật theo ảnh vệ tinh) và bản đồ đang hiển thị.
// Chế độ vệ tinh: giữ nguyên. Sơ đồ model đặt tòa theo mô hình gốc nên dữ liệu được dời ngược theo SAT_ALIGN:
// điểm thuộc / nằm trong một tòa (nới 1 m) dời cứng theo tòa đó, điểm ngoài tòa dời theo nội suy IDW
// như Models_3D/scripts/08_align_to_satellite.py (cùng gốc O và hệ số mét/độ).
import { SAT_ALIGN, SAT_PIVOT, pointInRing } from './campus/geo.js';

const O = [106.8037076, 10.8704966];
const MLNG = 111320 * Math.cos((O[1] * Math.PI) / 180);
const MLAT = 110574;
const IDW_FADE_M = 80;
const NO_IDW = new Set(['D', 'CAFE_VOI']); // đã ở vị trí vệ tinh trước script 08 nên không góp vào IDW
const DB = Symbol('db'); // tọa độ CSDL gốc, gắn vào geometry đã dời

const enu = ([lng, lat]) => [(lng - O[0]) * MLNG, (lat - O[1]) * MLAT];

// Dời cứng theo tòa: dir = 1 mô hình -> vệ tinh, -1 ngược lại
function rigid(code, [x, y], dir) {
  const [de, dn, deg = 0] = SAT_ALIGN[code];
  if (dir < 0) {
    x -= de;
    y -= dn;
  }
  if (deg) {
    const [cx, cy] = enu(SAT_PIVOT[code]);
    const t = (dir * -deg * Math.PI) / 180; // độ theo chiều kim đồng hồ
    [x, y] = [cx + Math.cos(t) * (x - cx) - Math.sin(t) * (y - cy), cy + Math.sin(t) * (x - cx) + Math.cos(t) * (y - cy)];
  }
  return dir > 0 ? [x + de, y + dn] : [x, y];
}

function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Khoảng cách (m) từ điểm tới polygon (vành ngoài + lỗ), 0 nếu nằm trong
function distTo(p, rings) {
  if (rings.reduce((inside, r) => inside !== pointInRing(p[0], p[1], r), false)) return 0;
  let d = Infinity;
  rings.forEach((r) => {
    for (let i = 1; i < r.length; i += 1) d = Math.min(d, segDist(p, r[i - 1], r[i]));
  });
  return d;
}

let satellite = false;
// mỗi tòa: footprint ở hệ vệ tinh (sat), mô hình gốc (model) và hệ dùng khi nội suy (idw, như script 08)
let footprints = [];
const containing = (p, key) => footprints.find((b) => distTo(p, b[key]) <= 1)?.code;

function idwShift(p) {
  let tot = 1 / IDW_FADE_M ** 2;
  let e = 0;
  let n = 0;
  footprints.forEach((b) => {
    const w = 1 / Math.max(distTo(p, b.idw), 5) ** 2;
    tot += w;
    if (!NO_IDW.has(b.code)) {
      e += w * SAT_ALIGN[b.code][0];
      n += w * SAT_ALIGN[b.code][1];
    }
  });
  return [e / tot, n / tot];
}

const lngLatOf = ([x, y], rest) => [O[0] + x / MLNG, O[1] + y / MLAT, ...rest];

// CSDL -> hiển thị. code: mã tòa của đối tượng (nếu có).
// smooth = true (lối đi, tuyến chỉ đường): chỉ dùng nội suy IDW, không dời cứng theo tòa chứa điểm. Nếu không, đỉnh nào
// nằm sát mép tòa (trong 1 m) sẽ bị dời theo tòa (tới ~20 m với C, D, Cafe Voi) còn đỉnh bên cạnh thì không -> đường gãy khúc.
export function toView([lng, lat, ...rest], code, smooth = false) {
  if (satellite) return [lng, lat, ...rest];
  const p = enu([lng, lat]);
  const c = SAT_ALIGN[code] ? code : smooth ? null : containing(p, 'sat');
  if (c) return lngLatOf(rigid(c, p, -1), rest);
  return lngLatOf(invertIdw(p), rest);
}

// Tìm q (sa bàn) sao cho q + idwShift(q) = p (CSDL). Sát tòa dời nhiều (C ~19 m) độ dời đổi nhanh hơn khoảng cách,
// lặp điểm bất động thường (bước 1) dao động không hội tụ -> lệch vài mét; giảm bước tới khi sai số < 1 cm.
function invertIdw(p) {
  let [de, dn] = idwShift(p);
  let q = [p[0] - de, p[1] - dn];
  let step = 1;
  let prev = Infinity;
  for (let i = 0; i < 60; i += 1) {
    [de, dn] = idwShift(q);
    const r = [q[0] + de - p[0], q[1] + dn - p[1]];
    const err = Math.hypot(r[0], r[1]);
    if (err < 0.01) break;
    if (err > prev) step = Math.max(0.1, step * 0.5); // đang dao động: bước nhỏ lại
    prev = err;
    q = [q[0] - step * r[0], q[1] - step * r[1]];
  }
  return q;
}

// Hiển thị -> CSDL (vd. vị trí người dùng chọn trên sơ đồ model). smooth: như toView (dùng cho trang sửa lối đi)
export function toDb([lng, lat, ...rest], smooth = false) {
  if (satellite) return [lng, lat, ...rest];
  const p = enu([lng, lat]);
  const c = smooth ? null : containing(p, 'model');
  if (c) return lngLatOf(rigid(c, p, 1), rest);
  const [de, dn] = idwShift(p);
  return lngLatOf([p[0] + de, p[1] + dn], rest);
}

// Gọi một lần với footprint tòa nhà lấy từ API (hệ CSDL), trước khi dời dữ liệu
export function setFrameFootprints(buildingsFc) {
  footprints = buildingsFc.features.filter((f) => SAT_ALIGN[f.properties.building_code]).map((f) => {
    const code = f.properties.building_code;
    const sat = f.geometry.coordinates.map((ring) => ring.map(enu));
    const model = sat.map((ring) => ring.map((p) => rigid(code, p, -1)));
    return { code, sat, model, idw: NO_IDW.has(code) ? sat : model };
  });
  setSatelliteFrame(satellite); // vẽ lại những thứ đặt trước khi có footprint (vd. nhãn cổng)
}

const mapCoords = (c, fn) => (typeof c[0] === 'number' ? fn(c) : c.map((x) => mapCoords(x, fn)));
const registry = new Map();
const listeners = [];

// Lớp dời trơn (lối đi ngoài trời); hành lang / cầu thang của tuyến vẫn dời theo tòa chứa nó
const SMOOTH_KEYS = new Set(['route']);
const RIGID_PATH_TYPES = new Set(['Corridor', 'Stairs']);

const ANCHOR = Symbol('anchor'); // chỉ số đỉnh của đoạn nối (Connector) không nằm trên lối đi nào

function place(f, key) {
  const code = f.properties && f.properties.building_code;
  const smooth = SMOOTH_KEYS.has(key) && !RIGID_PATH_TYPES.has(f.properties && f.properties.path_type);
  const anchors = f[ANCHOR];
  // Đầu đoạn nối là vị trí xuất phát hoặc điểm chạm tường tòa đích: dời như chấm vị trí / khối nhà (theo tòa chứa
  // điểm) để khớp chỗ người dùng thấy; đầu còn lại nằm trên lối đi nên dời trơn như lối đi.
  f.geometry.coordinates = anchors
    ? f.geometry[DB].map((c, i) => toView(c, code, smooth && !anchors.has(i)))
    : mapCoords(f.geometry[DB], (c) => toView(c, code, smooth));
}

// Dời tại chỗ một FeatureCollection từ API sang hệ đang hiển thị; nhớ theo key để dời lại khi đổi chế độ
export function warpFc(fc, key) {
  const k = (c) => `${c[0].toFixed(7)},${c[1].toFixed(7)}`;
  const onPath = new Set();
  fc.features.forEach((f) => {
    if (f.geometry && f.geometry.type === 'LineString' && f.properties && f.properties.path_type !== 'Connector') {
      (f.geometry[DB] || f.geometry.coordinates).forEach((c) => onPath.add(k(c)));
    }
  });
  fc.features.forEach((f) => {
    if (!f.geometry) return;
    if (!f.geometry[DB]) f.geometry[DB] = f.geometry.coordinates;
    if (f.geometry.type === 'LineString' && f.properties && f.properties.path_type === 'Connector') {
      f[ANCHOR] = new Set(f.geometry[DB].map((c, i) => (onPath.has(k(c)) ? -1 : i)).filter((i) => i >= 0));
    }
    place(f, key);
  });
  registry.set(key, fc);
  return fc;
}

export const onFrameChange = (fn) => listeners.push(fn);

export function setSatelliteFrame(on) {
  satellite = on;
  registry.forEach((fc, key) => fc.features.forEach((f) => f.geometry && place(f, key)));
  listeners.forEach((fn) => fn());
}
