"""Nắn dữ liệu GIS 2D (dataset/, database/) theo model 3D uit_campus_full.glb.

Model được coi là chuẩn vị trí. Các bước:
  1. Footprint từng tòa = hình chiếu các tam giác cao hơn 1 m của node Root_* (hệ mét Blender:
     x_bl = x_gltf, y_bl = -z_gltf, z_bl = y_gltf).
  2. Phép đồng dạng T (model -> ENU mét quanh gốc O), fit cực đại IoU với polygon OSM của A, B, D, E, NHA_PVSV.
     ENU -> kinh/vĩ độ: lng = O.lng + E / (111320 cos O.lat), lat = O.lat + N / 110574.
  3. Mỗi tòa k: phép cứng R_k (xoay + dịch, không tỉ lệ) đưa polygon cũ về footprint mới; phòng, sàn,
     tiện ích của tòa đi theo R_k. Điểm ngoài tòa (lối đi, cổng, ranh giới) dịch theo nội suy IDW.

Đầu vào luôn là các file *.backup.* nên chạy lại cho kết quả như nhau.
  --check : tự kiểm tra, in bảng sai số, ghi Models_3D/align_report.json
  --plot  : vẽ Models_3D/align_preview.png
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Polygon, mapping, shape
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / 'Models_3D'
GLB = MODELS / 'uit_campus_full.glb'
REPORT = MODELS / 'align_report.json'

O = (106.8037076, 10.8704966)
MLNG = 111320 * math.cos(math.radians(O[1]))
MLAT = 110574
NODE_CODE = {
    'Root_Toa_A': 'A', 'Root_Toa_B': 'B', 'Root_Toa_C': 'C', 'Root_Toa_D': 'D', 'Root_Toa_E': 'E',
    'Root_Nha_PVSV': 'NHA_PVSV', 'Root_Cafe_Voi': 'CAFE_VOI',
}
CTRL = ['A', 'B', 'D', 'E', 'NHA_PVSV']  # có footprint OSM; C là bản nháp nên không dùng để fit
IDW_FADE_M = 80.0

# ---------- đọc GLB ----------
_CT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}


def _quat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def _node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=float).reshape(4, 4).T
    m = np.eye(4)
    m[:3, :3] = _quat(n.get('rotation', [0, 0, 0, 1])) * np.array(n.get('scale', [1, 1, 1]))
    m[:3, 3] = n.get('translation', [0, 0, 0])
    return m


def read_glb_triangles(path: Path) -> dict[str, np.ndarray]:
    """Node gốc Root_* -> mảng tam giác (n, 3, 3) trong hệ mét Blender."""
    raw = path.read_bytes()
    jlen = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + jlen])
    bin0 = 20 + jlen + 8

    def accessor(i):
        a = gltf['accessors'][i]
        v = gltf['bufferViews'][a['bufferView']]
        ncomp = {'SCALAR': 1, 'VEC3': 3}[a['type']]
        dt = np.dtype(_CT[a['componentType']])
        stride = v.get('byteStride') or dt.itemsize * ncomp
        off = bin0 + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        rows = np.ndarray((a['count'], ncomp), dt, raw, off, (stride, dt.itemsize))
        return rows.astype(np.float64 if dt == np.float32 else np.int64)

    out: dict[str, list] = {}

    def walk(i, parent, bucket):
        n = gltf['nodes'][i]
        world = parent @ _node_matrix(n)
        if 'mesh' in n:
            for prim in gltf['meshes'][n['mesh']]['primitives']:
                if prim.get('mode', 4) != 4:
                    continue
                pos = accessor(prim['attributes']['POSITION'])
                pos = np.c_[pos, np.ones(len(pos))] @ world.T
                idx = accessor(prim['indices']).ravel() if 'indices' in prim else np.arange(len(pos))
                tri = pos[idx.reshape(-1, 3), :3]
                bucket.append(np.stack([tri[..., 0], -tri[..., 2], tri[..., 1]], axis=-1))
        for c in n.get('children', []):
            walk(c, world, bucket)

    for i in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
        name = gltf['nodes'][i].get('name', '')
        if name in NODE_CODE:
            walk(i, np.eye(4), out.setdefault(name, []))
    return {k: np.concatenate(v) for k, v in out.items()}


def footprint(tris: np.ndarray) -> Polygon:
    """Hình chiếu các tam giác cao hơn 1 m, đóng khe 0.5 m, polygon lớn nhất, bỏ lỗ < 20 m²."""
    tris = tris[tris[:, :, 2].min(axis=1) > 1.0][:, :, :2]
    a = tris[:, 1] - tris[:, 0]
    b = tris[:, 2] - tris[:, 0]
    tris = tris[np.abs(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0]) > 2e-4]
    union = shapely.union_all(shapely.polygons(np.concatenate([tris, tris[:, :1]], axis=1)))
    # đóng khe 0.5 m giữa các mái, rồi bỏ gai mảnh < 1.2 m (lan can, cầu thang ngoài)
    union = union.buffer(0.5, join_style='mitre').buffer(-0.5, join_style='mitre')
    union = union.buffer(-0.6, join_style='mitre').buffer(0.6, join_style='mitre')
    poly = max(getattr(union, 'geoms', [union]), key=lambda g: g.area)
    poly = Polygon(poly.exterior, [r for r in poly.interiors if Polygon(r).area >= 20])
    return orient(poly.simplify(0.3), 1.0)


def model_footprints() -> dict[str, Polygon]:
    return {NODE_CODE[k]: footprint(v) for k, v in read_glb_triangles(GLB).items()}


# ---------- phép biến đổi ----------
def _map(geom, fn):
    return shapely.transform(geom, lambda c: np.asarray(fn(c[:, 0], c[:, 1])).T)


def apply_T(T, geom):
    s, th, tx, ty = T
    c, si = math.cos(th), math.sin(th)
    return _map(geom, lambda x, y: (s * (c * x - si * y) + tx, s * (si * x + c * y) + ty))


def invert_T(T):
    s, th, tx, ty = T
    c, si = math.cos(-th), math.sin(-th)
    return (1 / s, -th, -(c * tx - si * ty) / s, -(si * tx + c * ty) / s)


def enu_to_lnglat(geom):
    return _map(geom, lambda e, n: (O[0] + e / MLNG, O[1] + n / MLAT))


def lnglat_to_enu(geom):
    return _map(geom, lambda lng, lat: ((lng - O[0]) * MLNG, (lat - O[1]) * MLAT))


def rigid_xy(x, y, R):
    th, cx, cy, tx, ty = R
    c, si = math.cos(th), math.sin(th)
    return c * (x - cx) - si * (y - cy) + cx + tx, si * (x - cx) + c * (y - cy) + cy + ty


def rigid(geom, R):
    return _map(geom, lambda x, y: rigid_xy(x, y, R))


def _iou(a, b):
    return a.intersection(b).area / a.union(b).area


def _polish(score, x0, steps, stop):
    """Leo đồi theo từng tham số, chia đôi bước khi không cải thiện."""
    best, x = score(x0), list(x0)
    steps = list(steps)
    while steps[-1] > stop:
        improved = False
        for i in range(len(x)):
            for d in (-1, 1):
                c = list(x)
                c[i] += d * steps[i]
                sc = score(c)
                if sc > best + 1e-12:
                    best, x, improved = sc, c, True
        if not improved:
            steps = [s / 2 for s in steps]
    return tuple(x), best


def fit_T(model_fps, osm_enu):
    src = np.array([model_fps[k].centroid.coords[0] for k in CTRL])
    dst = np.array([osm_enu[k].centroid.coords[0] for k in CTRL])
    zs = (src - src.mean(0)) @ [1, 1j]
    zd = (dst - dst.mean(0)) @ [1, 1j]
    k = (np.conj(zs) @ zd) / (np.conj(zs) @ zs)
    s, th = abs(k), math.atan2(k.imag, k.real)
    t = dst.mean(0) - s * np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]]) @ src.mean(0)
    score = lambda T: np.mean([_iou(apply_T(T, model_fps[c]), osm_enu[c]) for c in CTRL])
    return _polish(score, (s, th, t[0], t[1]), [0.02, math.radians(1), 2.0, 2.0], 0.005)


def _long_axis(p):
    c = np.array(p.minimum_rotated_rectangle.exterior.coords)
    e = max((c[i + 1] - c[i] for i in range(4)), key=lambda v: np.hypot(*v))
    return math.atan2(e[1], e[0])


def fit_rigid(old: Polygon, new: Polygon):
    """Xoay quanh tâm polygon cũ + dịch, cực đại IoU. Trả về (theta, cx, cy, tx, ty)."""
    cx, cy = old.centroid.coords[0]
    dx, dy = new.centroid.x - cx, new.centroid.y - cy
    base = _long_axis(new) - _long_axis(old)
    score = lambda p: _iou(rigid(old, (p[0], cx, cy, p[1], p[2])), new)
    wrap = lambda a: math.atan2(math.sin(a), math.cos(a))
    base = wrap(2 * base) / 2  # hướng trục dài không phân biệt chiều -> (-90°, 90°]
    fits = [_polish(score, (base + k * math.pi, dx, dy), [math.radians(2), 1.0, 1.0], 0.005) for k in (0, 1)]
    fits = sorted(((wrap(p[0]), p[1], p[2]), sc) for p, sc in fits)
    fits.sort(key=lambda f: abs(f[0][0]))
    # ưu tiên góc xoay nhỏ (giữ hướng bố trí phòng), trừ khi lật 180° khớp hơn hẳn
    (th, tx, ty), _ = fits[1] if fits[1][1] > fits[0][1] + 0.05 else fits[0]
    return (th, cx, cy, tx, ty)


# ---------- dựng kết quả ----------
def load_fc(name):
    return json.loads((ROOT / 'dataset' / f'{name}.backup.geojson').read_text(encoding='utf-8'))


def build() -> dict:
    fps = model_footprints()
    old = {f['properties']['building_code']: lnglat_to_enu(shape(f['geometry'])) for f in load_fc('buildings')['features']}
    T, mean_iou = fit_T(fps, old)
    new = {k: apply_T(T, fps[k]) for k in old}
    R = {k: fit_rigid(old[k], new[k]) for k in old}
    shift = {k: np.subtract(rigid(old[k].centroid, R[k]).coords[0], old[k].centroid.coords[0]) for k in old}

    def displace(x, y, code=None):
        """ENU mét -> ENU mét. code: mã tòa của đối tượng (nếu có) thì đi theo R của tòa đó."""
        if code is None:
            pt = shapely.Point(x, y)
            code = next((k for k, g in old.items() if g.buffer(1.0).contains(pt)), None)
        if code in R:
            return rigid_xy(x, y, R[code])
        w = {k: 1 / max(g.distance(shapely.Point(x, y)), 5.0) ** 2 for k, g in old.items()}
        tot = sum(w.values()) + 1 / IDW_FADE_M ** 2
        return x + sum(w[k] * shift[k][0] for k in w) / tot, y + sum(w[k] * shift[k][1] for k in w) / tot

    return {'T': T, 'mean_iou': mean_iou, 'fps': fps, 'old': old, 'new_buildings': new, 'R': R, 'displace': displace,
            'cafe_voi': apply_T(T, fps['CAFE_VOI'])}


def write_report(r) -> None:
    s, th, tx, ty = r['T']
    rows = {}
    print(f"T: s={s:.5f} theta={math.degrees(th):.3f} deg tx={tx:.2f} ty={ty:.2f}  mean IoU(OSM)={r['mean_iou']:.3f}")
    print(f"{'code':9s} {'area_old':>8s} {'area_new':>8s} {'IoU_old':>7s} {'shift_m':>7s} {'rot_deg':>7s}")
    for k, g in r['old'].items():
        n = r['new_buildings'][k]
        th_k, cx, cy, tx_k, ty_k = r['R'][k]
        rows[k] = {'area_old': round(g.area, 1), 'area_new': round(n.area, 1), 'iou_old_new': round(_iou(g, n), 3),
                   'shift_m': round(math.hypot(tx_k, ty_k), 2), 'rot_deg': round(math.degrees(th_k), 3),
                   'R': [th_k, cx, cy, tx_k, ty_k]}
        print(f"{k:9s} {g.area:8.0f} {n.area:8.0f} {rows[k]['iou_old_new']:7.2f} {rows[k]['shift_m']:7.1f} {rows[k]['rot_deg']:7.2f}")
    cafe = r['cafe_voi']
    print(f"CAFE_VOI  (đề xuất) area={cafe.area:.0f} m2")
    REPORT.write_text(json.dumps({
        'O': O, 'MLNG': MLNG, 'MLAT': MLAT,
        'T': {'scale': s, 'theta_rad': th, 'theta_deg': math.degrees(th), 'tx': tx, 'ty': ty},
        'geo_js': {'lng': O[0] + tx / MLNG, 'lat': O[1] + ty / MLAT, 'scale': s, 'rotDeg': math.degrees(th)},
        'mean_iou_osm': r['mean_iou'], 'buildings': rows,
        'cafe_voi_lnglat': mapping(orient(enu_to_lnglat(cafe), 1.0)),
    }, indent=1, ensure_ascii=False), encoding='utf-8')


def plot(r) -> None:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(9, 9))
    for k, g in r['old'].items():
        ax.fill(*g.exterior.xy, alpha=0.25, color='tab:red' if k == 'C' else 'tab:blue')
        n = r['new_buildings'][k]
        ax.plot(*n.exterior.xy, color='green', lw=1.5)
        for h in n.interiors:
            ax.plot(*h.xy, color='green', lw=0.8)
        ax.text(n.centroid.x, n.centroid.y, k, color='darkgreen', ha='center', fontsize=9, weight='bold')
    ax.plot(*r['cafe_voi'].exterior.xy, color='orange', lw=1.2, ls='--')
    ax.set_aspect('equal')
    ax.grid(alpha=0.3)
    ax.set_title('Đỏ/xanh dương = polygon cũ · xanh lá = footprint model (ENU m)')
    fig.savefig(MODELS / 'align_preview.png', dpi=90, bbox_inches='tight')


def self_check() -> None:
    fps = model_footprints()
    assert all(fp.is_valid and 100 < fp.area < 10000 for fp in fps.values()), {k: fp.area for k, fp in fps.items()}

    p = Polygon([(0, 0), (40, 0), (40, 10), (0, 10)])
    T = (0.95, math.radians(2.4), 8.9, 3.0)
    assert apply_T(invert_T(T), apply_T(T, p)).equals_exact(p, 1e-6)
    assert lnglat_to_enu(enu_to_lnglat(p)).equals_exact(p, 1e-6)

    moved = rigid(p, (math.radians(10), *p.centroid.coords[0], 5, -3))
    th, cx, cy, tx, ty = fit_rigid(p, moved)
    assert abs(math.degrees(th) - 10) < 0.1 and abs(tx - 5) < 0.1 and abs(ty + 3) < 0.1, (math.degrees(th), tx, ty)

    r = build()
    new = r['new_buildings']
    codes = sorted(new)
    for i, a in enumerate(codes):
        for b in codes[i + 1:]:
            assert new[a].intersection(new[b]).area < 0.5, (a, b)
    assert r['mean_iou'] >= 0.35, r['mean_iou']
    write_report(r)
    if '--plot' in sys.argv:
        plot(r)
    print('CHECK OK')


if __name__ == '__main__':
    if '--check' in sys.argv:
        self_check()
