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
import re
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
    new['CAFE_VOI'] = apply_T(T, fps['CAFE_VOI'])  # tòa mới, chỉ có trong model
    # khớp theo vành ngoài: sân trong của model (Tòa C) không có trong lưới phòng cũ
    R = {k: fit_rigid(old[k], Polygon(new[k].exterior)) for k in old}
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


# ---------- ghi dữ liệu ----------
GEOJSON_FILES = ['buildings', 'floors', 'rooms', 'amenities', 'paths', 'campus_boundary']
SQL_FILES = ['02_seed_uit_data.sql', '03_toa_a_indoor.sql', '04_campus_graph.sql', 'checks.sql']
INSERT_RE = re.compile(r'INSERT INTO (\w+)')
WKT_RE = re.compile(r"ST_GeomFromText\('([^']+)'")
PAIR_RE = re.compile(r'(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)')
GATE_A = (106.8020546, 10.8704376)
GATE_B = (106.8039237, 10.8689966)
# Cafe Voi: không có trên OSM; chiều cao = đỉnh mái node Root_Cafe_Voi (7.28 m), số tầng ước lượng
CAFE_VOI = {
    'building_code': 'CAFE_VOI', 'name': 'Cafe Voi', 'total_floors': 2, 'height_m': 7.3, 'base_elevation': 0.0,
    'description': 'Footprint và chiều cao lấy từ model 3D (Root_Cafe_Voi); số tầng tạm để 2, cần kiểm chứng thực địa.',
    'osm_id': None, 'floors_source': 'ước lượng từ chiều cao model 3D', 'source': 'model',
    'source_ref': 'Models_3D/uit_campus_full.glb (Root_Cafe_Voi)', 'verified': False,
}

# Cổng 2 vào bãi xe: không có trong dữ liệu gốc; tọa độ = tâm mái che giữa Tòa B và Nhà PVSV trong model, đã quy đổi bằng T
GATE_2_PARKING = {
    'id': 'P012', 'name': 'Cổng 2 - Lối vào bãi xe', 'category': 'Parking', 'building_code': None,
    'floor_number': 1, 'elevation_z': 1.0, 'open_hours': None, 'source': 'model',
    'source_ref': 'Models_3D/uit_campus_full.glb (mái che giữa Tòa B và Nhà PVSV)', 'verified': False,
}
GATE_2_LNGLAT = (106.8042039, 10.8703884)
# Căn tin Cafe Voi: điểm đặt tại tâm footprint Root_Cafe_Voi
CAFE_VOI_CANTEEN = {
    'id': 'P013', 'name': 'Căn tin Cafe Voi', 'category': 'Canteen', 'building_code': 'CAFE_VOI',
    'floor_number': 1, 'elevation_z': 1.0, 'open_hours': None, 'source': 'model',
    'source_ref': 'Models_3D/uit_campus_full.glb (Root_Cafe_Voi)', 'verified': False,
}
# Tiện ích thêm mới (không có trong dữ liệu gốc): (thuộc tính, (lng, lat))
EXTRA_AMENITIES = [(GATE_2_PARKING, GATE_2_LNGLAT), (CAFE_VOI_CANTEEN, (106.8039055, 10.8693549))]
# Tiện ích đặt lại theo model thay vì nội suy: ATM ra mặt đường trước chòi bảo vệ Cổng A,
# bãi xe máy phía Bắc Tòa A vào mái nhà xe (cách mép mái 3 m),
# phòng ăn E7.1 vào tâm phòng E7.1 của LOD 3 Tòa E, cao = sàn tầng 7 (22.8 m) + 1 m.
# Giá trị (lng, lat) hoặc (lng, lat, z)
AMENITY_LNGLAT = {
    'Trụ ATM ngoài Cổng A (Đường Hàn Thuyên)': (106.8018981, 10.8706263),
    'Bãi giữ xe máy UIT (Phía Bắc Tòa A)': (106.8028612, 10.8714743),
    'Phòng ăn GV - VC & NLĐ (E7.1)': (106.802661, 10.8697176, 23.8),
    # máy bán nước tầng 1 Tòa A: góc hành lang cạnh thư viện (vị trí người dùng chỉ trên sơ đồ)
    'Máy bán nước tự động Tầng 1 Tòa A': (106.80297, 10.8706288),
}


def dump_fc(fc) -> bytes:
    """Cùng định dạng file gốc (ogr2ogr): thụt 1 dấu cách, CRLF, không xuống dòng cuối."""
    return json.dumps(fc, indent=1, ensure_ascii=False).replace('\n', '\r\n').encode('utf-8')


def _lnglat_mover(displace):
    def move(lng, lat, code=None):
        e, n = displace((lng - O[0]) * MLNG, (lat - O[1]) * MLAT, code)
        return round(float(O[0] + e / MLNG), 7), round(float(O[1] + n / MLAT), 7)
    return move


def _move_coords(c, move, code):
    if isinstance(c[0], (int, float)):
        return [*move(c[0], c[1], code), *c[2:]]
    return [_move_coords(x, move, code) for x in c]


def _round_coords(c):
    return [round(c[0], 7), round(c[1], 7)] if isinstance(c[0], float) else [_round_coords(x) for x in c]


def _wkt_polygon(coords) -> str:
    return 'POLYGON(' + ', '.join('(' + ', '.join(f'{x!r} {y!r}' for x, y in ring) + ')' for ring in coords) + ')'


def write_all(r) -> None:
    move = _lnglat_mover(r['displace'])
    new_geom = {k: _round_coords(mapping(orient(enu_to_lnglat(g), 1.0))['coordinates']) for k, g in r['new_buildings'].items()}

    for name in GEOJSON_FILES:
        fc = load_fc(name)
        for f in fc['features']:
            p = f['properties']
            if name == 'buildings':
                code = p['building_code']
                f['geometry']['coordinates'] = new_geom[code]
                if code == 'C':
                    p['source'] = 'model'
                    p['source_ref'] = 'Models_3D/uit_campus_full.glb (Root_Toa_C)'
                    p['description'] = ('Footprint lấy từ model 3D (Root_Toa_C), quy đổi theo '
                                        'Models_3D/scripts/04_align_gis_to_model.py; cần kiểm chứng thực địa.')
                else:
                    p['description'] = p['description'].rstrip().rstrip('.') + '. Hình học nắn theo model 3D.'
            elif name == 'amenities' and p['name'] in AMENITY_LNGLAT:
                v = AMENITY_LNGLAT[p['name']]
                f['geometry']['coordinates'][:len(v)] = v
                if len(v) == 3:
                    p['elevation_z'] = v[2]
            else:
                f['geometry']['coordinates'] = _move_coords(f['geometry']['coordinates'], move, p.get('building_code'))
        if name == 'buildings':
            fc['features'].append({'type': 'Feature', 'properties': dict(CAFE_VOI),
                                   'geometry': {'type': 'Polygon', 'coordinates': new_geom['CAFE_VOI']}})
        if name == 'amenities':
            for g, lnglat in EXTRA_AMENITIES:
                fc['features'].append({'type': 'Feature', 'properties': dict(g), 'geometry': {
                    'type': 'Point', 'coordinates': [*lnglat, g['elevation_z']]}})
        (ROOT / 'dataset' / f'{name}.geojson').write_bytes(dump_fc(fc))

    gate_a, gate_b = move(*GATE_A), move(*GATE_B)
    for fname in SQL_FILES:
        src = (ROOT / 'database' / fname.replace('.sql', '.backup.sql')).read_text(encoding='utf-8')
        out = []
        for line in src.split('\n'):
            m = INSERT_RE.match(line)
            if m and m.group(1) == 'buildings':
                code = re.search(r"VALUES \('([^']+)'", line).group(1)
                line = WKT_RE.sub(lambda w: f"ST_GeomFromText('{_wkt_polygon(new_geom[code])}'", line)
            elif m and m.group(1) == 'amenities' and (nm := re.search(r"VALUES \('((?:[^']|'')+)'", line).group(1).replace("''", "'")) in AMENITY_LNGLAT:
                v = AMENITY_LNGLAT[nm]
                if len(v) == 3:  # elevation_z là số ngay trước NULL (open_hours) và trong POINT Z
                    line = re.sub(r', [\d.]+, NULL, ST_GeomFromText', f', {v[2]}, NULL, ST_GeomFromText', line)
                    line = re.sub(r'POINT Z \(\S+ \S+ \S+\)', f'POINT Z ({v[0]!r} {v[1]!r} {v[2]})', line)
                else:
                    line = re.sub(r'POINT Z \((\S+) (\S+) ', f'POINT Z ({v[0]!r} {v[1]!r} ', line)
            elif m:
                bc = re.search(r"building_code = '(\w+)'", line)
                code = bc.group(1) if bc else None
                line = WKT_RE.sub(lambda w: "ST_GeomFromText('" + PAIR_RE.sub(
                    lambda p: '{0!r} {1!r}'.format(*move(float(p.group(1)), float(p.group(2)), code)), w.group(1)) + "'", line)
            line = line.replace(f'{GATE_A[0]}, {GATE_A[1]}', f'{gate_a[0]!r}, {gate_a[1]!r}')
            out.append(line)
            if m and m.group(1) == 'buildings' and code == 'C':  # dòng tòa cuối cùng trong 02_seed
                c = CAFE_VOI
                out.append(
                    'INSERT INTO buildings (building_code, name, total_floors, base_elevation, height_m, glb_model_url, '
                    'anchor_lng, anchor_lat, model_rotation, description, geom) VALUES '
                    f"('{c['building_code']}', '{c['name']}', {c['total_floors']}, {c['base_elevation']}, {c['height_m']}, "
                    f"NULL, NULL, NULL, NULL, '{c['description']}', "
                    f"ST_GeomFromText('{_wkt_polygon(new_geom['CAFE_VOI'])}', 4326));" + ('\r' if line.endswith('\r') else ''))
        if fname == '02_seed_uit_data.sql':  # thêm tiện ích mới sau dòng tiện ích cuối cùng
            i = max(k for k, l in enumerate(out) if l.startswith('INSERT INTO amenities'))
            cr = '\r' if out[i].endswith('\r') else ''
            for k, (g, (lng, lat)) in enumerate(EXTRA_AMENITIES, 1):
                bid = f"(SELECT id FROM buildings WHERE building_code = '{g['building_code']}')" if g['building_code'] else 'NULL'
                out.insert(i + k,
                    'INSERT INTO amenities (name, category, building_id, floor_number, elevation_z, open_hours, geom) VALUES '
                    f"('{g['name']}', '{g['category']}', {bid}, {g['floor_number']}, {g['elevation_z']}, NULL, "
                    f"ST_GeomFromText('POINT Z ({lng!r} {lat!r} {g['elevation_z']})', 4326));" + cr)
        (ROOT / 'database' / fname).write_bytes('\n'.join(out).encode('utf-8'))

    rep = json.loads(REPORT.read_text(encoding='utf-8')) if REPORT.exists() else {}
    rep.update({'gate_a': gate_a, 'gate_b': gate_b})
    REPORT.write_text(json.dumps(rep, indent=1, ensure_ascii=False), encoding='utf-8')
    print(f'Đã ghi {len(GEOJSON_FILES)} GeoJSON + {len(SQL_FILES)} SQL; Cổng A -> {gate_a}, Cổng B -> {gate_b}')


def verify_outputs() -> None:
    """Định dạng ghi giữ nguyên byte; mọi hình học trong SQL trùng GeoJSON (sai số < 1e-7 độ)."""
    for name in GEOJSON_FILES:
        src = (ROOT / 'dataset' / f'{name}.backup.geojson').read_bytes()
        assert dump_fc(json.loads(src.decode('utf-8'))) == src, f'{name}: định dạng ghi khác bản gốc'
    sql = {}
    for f in SQL_FILES:
        for line in (ROOT / 'database' / f).read_text(encoding='utf-8').splitlines():
            m = INSERT_RE.match(line)
            if m:
                sql.setdefault(m.group(1), []).append(line)
    keyed = {
        'buildings': lambda l: re.search(r"VALUES \('([^']+)'", l).group(1),
        'rooms': lambda l: re.search(r"VALUES \('([^']+)'", l).group(1),
        'floors': lambda l: (re.search(r"building_code = '(\w+)'", l).group(1), int(re.search(r"\), (\d+),", l).group(1))),
        'amenities': lambda l: re.search(r"VALUES \('((?:[^']|'')+)'", l).group(1).replace("''", "'"),
    }
    gj_key = {
        'buildings': lambda p: p['building_code'], 'rooms': lambda p: p['room_code'],
        'floors': lambda p: (p['building_code'], p['floor_number']), 'amenities': lambda p: p['name'],
    }
    n = 0
    for table, fc_name in [('buildings', 'buildings'), ('rooms', 'rooms'), ('floors', 'floors'), ('amenities', 'amenities'), ('campus_paths', 'paths')]:
        feats = json.loads((ROOT / 'dataset' / f'{fc_name}.geojson').read_text(encoding='utf-8'))['features']
        lines = sql[table]
        if table == 'campus_paths':
            pairs = zip(lines, feats)
        else:
            by = {gj_key[table](f['properties']): f for f in feats}
            pairs = [(l, by[keyed[table](l)]) for l in lines]
        for line, feat in pairs:
            g_sql = shapely.force_2d(shapely.from_wkt(WKT_RE.search(line).group(1)))
            g_js = shapely.force_2d(shape(feat['geometry']))
            assert g_sql.equals_exact(g_js, 1e-7), (table, line[:80])
            n += 1
    assert len(sql['rooms']) == 145 and n == 7 + 145 + 6 + 8 + 33, n
    assert any("VALUES ('CAFE_VOI'" in l for l in sql['buildings']), 'thiếu Cafe Voi'
    for g, _ in EXTRA_AMENITIES:
        assert any(g['name'] in l for l in sql['amenities']), f"thiếu {g['name']}"
    print(f'SQL==GeoJSON OK ({n} đối tượng)')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')  # console Windows mặc định cp1252
    if '--check' in sys.argv:
        self_check()
    if '--write' in sys.argv:
        write_all(build())
    if '--verify' in sys.argv:
        verify_outputs()
