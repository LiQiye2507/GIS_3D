// Raster hóa mặt trên mô hình campus.glb thành lưới độ cao (mét, hệ cục bộ Đông/Bắc quanh một điểm lng/lat).
// Dùng: node extract_model_heightmap.cjs <campus.glb> <draco_decoder.js> <out.json> <lng> <lat> <bán_kính_m>
const fs = require('fs');
const [glbPath, dracoJs, out, lon0, lat0, half] = process.argv.slice(2);
// Dùng đúng tham số nắn mô hình của frontend để viền Tòa A khớp với cảnh 3D
const sceneSrc = fs.readFileSync(require('path').join(require('path').dirname(glbPath), '..', 'campus-scene.js'), 'utf8');
const geoMatch = sceneSrc.match(/const GEO = (\{[^}]*\});/);
if (!geoMatch) throw new Error('Không tìm thấy GEO trong frontend/campus-scene.js');
const GEO = Function(`return ${geoMatch[1]}`)();
const D = Math.PI / 180, rot = GEO.rotDeg * D, ML = 110574, MG = 111320 * Math.cos(GEO.lat * D);
const buf = fs.readFileSync(glbPath);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bv = (i) => { const v = gltf.bufferViews[i]; return buf.slice(binStart + (v.byteOffset || 0), binStart + (v.byteOffset || 0) + v.byteLength); };

function mul(a, b) { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return r; }
function trs(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const L0 = +lon0, A0 = +lat0, H = +half, cell = 0.5, N = Math.round(2 * H / cell);
const hm = new Float32Array(N * N).fill(-1);
function toLocal(p) {
  const e = GEO.scale * (p[0] * Math.cos(rot) + p[2] * Math.sin(rot)), n = GEO.scale * (p[0] * Math.sin(rot) - p[2] * Math.cos(rot));
  return [(GEO.lng + e / MG - L0) * MG, (GEO.lat + n / ML - A0) * ML, p[1] * GEO.scale];
}
function raster(a, b, c) {
  const minx = Math.min(a[0], b[0], c[0]), maxx = Math.max(a[0], b[0], c[0]), miny = Math.min(a[1], b[1], c[1]), maxy = Math.max(a[1], b[1], c[1]);
  if (maxx < -H || minx > H || maxy < -H || miny > H) return;
  const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(den) < 1e-9) return;
  for (let gy = Math.max(0, Math.floor((miny + H) / cell)); gy <= Math.min(N - 1, Math.ceil((maxy + H) / cell)); gy++)
    for (let gx = Math.max(0, Math.floor((minx + H) / cell)); gx <= Math.min(N - 1, Math.ceil((maxx + H) / cell)); gx++) {
      const x = gx * cell - H, y = gy * cell - H;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2], k = gy * N + gx; if (z > hm[k]) hm[k] = z;
    }
}
require(dracoJs)().then((dm) => {
  const dec = new dm.Decoder();
  function decode(prim) {
    const ext = prim.extensions.KHR_draco_mesh_compression, data = bv(ext.bufferView);
    const dbuf = new dm.DecoderBuffer(); dbuf.Init(new Int8Array(data), data.length);
    const mesh = new dm.Mesh(); const st = dec.DecodeBufferToMesh(dbuf, mesh); if (!st.ok()) throw st.error_msg();
    const att = dec.GetAttributeByUniqueId(mesh, ext.attributes.POSITION), np = mesh.num_points();
    const pa = new dm.DracoFloat32Array(); dec.GetAttributeFloatForAllPoints(mesh, att, pa);
    const pos = new Float32Array(np * 3); for (let i = 0; i < np * 3; i++) pos[i] = pa.GetValue(i);
    const nf = mesh.num_faces(), ia = new dm.DracoInt32Array(), idx = new Uint32Array(nf * 3);
    for (let f = 0; f < nf; f++) { dec.GetFaceFromMesh(mesh, f, ia); for (let j = 0; j < 3; j++) idx[f * 3 + j] = ia.GetValue(j); }
    return { pos, idx };
  }
  function plain(prim) {
    const acc = gltf.accessors[prim.attributes.POSITION], b = bv(acc.bufferView);
    const pos = new Float32Array(b.buffer.slice(b.byteOffset + (acc.byteOffset || 0), b.byteOffset + (acc.byteOffset || 0) + acc.count * 12));
    let idx; if (prim.indices != null) { const ia = gltf.accessors[prim.indices], ib = bv(ia.bufferView), C = ia.componentType === 5125 ? Uint32Array : Uint16Array;
      idx = new C(ib.buffer.slice(ib.byteOffset + (ia.byteOffset || 0), ib.byteOffset + (ia.byteOffset || 0) + ia.count * C.BYTES_PER_ELEMENT)); }
    else idx = Uint32Array.from({ length: acc.count }, (_, i) => i);
    return { pos, idx };
  }
  function walk(ni, parent) {
    const n = gltf.nodes[ni], m = mul(parent, trs(n));
    if (n.mesh != null) for (const prim of gltf.meshes[n.mesh].primitives) {
      const { pos, idx } = prim.extensions && prim.extensions.KHR_draco_mesh_compression ? decode(prim) : plain(prim);
      const P = (i) => { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; return toLocal([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]); };
      for (let t = 0; t < idx.length; t += 3) raster(P(idx[t]), P(idx[t + 1]), P(idx[t + 2]));
    }
    (n.children || []).forEach((c) => walk(c, m));
  }
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  gltf.scenes[gltf.scene || 0].nodes.forEach((n) => walk(n, I));
  fs.writeFileSync(out, JSON.stringify({ N, cell, H, hm: Array.from(hm, (v) => Math.round(v * 10) / 10) }));
  console.log('ok', N);
});
