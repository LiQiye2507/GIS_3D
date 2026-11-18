// Kinh/vĩ độ <-> hệ tọa độ mô hình uit_campus.glb

export const DEG = Math.PI / 180;

// Gốc (0,0,0) của mô hình, tỉ lệ ngang (mét / đơn vị mô hình) và góc xoay ngược chiều kim đồng hồ so với hướng Đông.
// Lấy từ Models_3D/align_report.json (geo_js), cùng phép quy đổi đã dùng để nắn dataset/. Độ cao mô hình tính bằng mét.
export const GEO = { lng: 106.8038136, lat: 10.8705244, scale: 0.96886, rotDeg: 0.627 };
// Mô hình cách điệu nên mỗi tòa lệch khỏi vị trí thật một kiểu. Độ dời từ mô hình gốc tới mái thật trên ảnh Esri World
// Imagery: (mét Đông, mét Bắc, độ xoay theo chiều kim đồng hồ quanh SAT_PIVOT). Đo ở zoom 18.2, nhìn thẳng xuống;
// Tòa A trong mô hình to hơn thực tế nên căn theo tâm hai mái vòm. CSDL lưu vị trí thật
// (Models_3D/scripts/08_align_to_satellite.py, cùng số liệu); sơ đồ model dời ngược lại (frame.js).
export const SAT_ALIGN = {
  A: [-3.6, -8.6], B: [3.7, -3.1, -3], C: [4.7, 18.8], D: [9.4, 12.3], E: [3.9, 1.3],
  NHA_PVSV: [2.6, -8.6], CAFE_VOI: [18.75, 13.8],
};
export const SAT_PIVOT = { B: [106.8037311, 10.8700535] }; // (lng, lat) trong hệ mô hình gốc
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos(GEO.lat * DEG);

// Bao lồi (monotone chain) của tập điểm XZ
export function hull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  const upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Kinh/vĩ độ <-> hệ mô hình (x, z); trục y là độ cao (đơn vị mô hình)
export const rot = GEO.rotDeg * DEG;
export function lngLatToModel(lng, lat) {
  const east = (lng - GEO.lng) * M_PER_DEG_LNG;
  const north = (lat - GEO.lat) * M_PER_DEG_LAT;
  return {
    x: (east * Math.cos(rot) + north * Math.sin(rot)) / GEO.scale,
    z: (east * Math.sin(rot) - north * Math.cos(rot)) / GEO.scale,
  };
}
export function modelToLngLat(x, z) {
  const east = GEO.scale * (x * Math.cos(rot) + z * Math.sin(rot));
  const north = GEO.scale * (x * Math.sin(rot) - z * Math.cos(rot));
  return [GEO.lng + east / M_PER_DEG_LNG, GEO.lat + north / M_PER_DEG_LAT];
}
// La bàn (độ, theo chiều kim đồng hồ từ Bắc) của một hướng trong hệ mô hình
export const modelBearing = (dx, dz) => Math.atan2(dx, -dz) / DEG - GEO.rotDeg;

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
