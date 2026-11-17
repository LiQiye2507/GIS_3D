"""Nạp nội thất LOD 3 Tòa B và Tòa E từ Models_3D/Model_LOD3 vào bộ dữ liệu dự án.

GeoJSON trong Model_LOD3 (rooms/floors_ABCE_lod3.geojson) có thuộc tính phòng đầy đủ nhưng tọa độ
lệch khỏi hệ đã nắn của dự án (tỉ lệ ~1.13, xoay ~3-5°). Các file toa_X_indoor_lod3.glb thì khớp 1:1
với vỏ tòa Models_3D/buildings/toa_X.glb, và vỏ đó chỉ là node Root_Toa_X của model khuôn viên dời về gốc.
Vì vậy:
  1. GLB nội thất cục bộ -> model khuôn viên: cộng độ lệch giữa khung bao Root_Toa_X và khung bao vỏ;
  2. khớp đồng dạng (ICP + Umeyama) đỉnh polygon phòng tầng 1 -> đỉnh khối nội thất tầng 1, gộp 4 tòa;
  3. model -> ENU -> WGS84 bằng phép T của 04_align_gis_to_model.py (align_report.json).
Phòng các tầng (trừ tầng G Tòa E) được dựng lại theo sơ đồ tầng của trường (B_PLAN, E_PLAN): ô phòng
chia trên mặt cắt khối tòa trong model, phòng đánh số giữ tên/loại/sức chứa của bộ Model_LOD3 nếu trùng mã.

Ghi: dataset/rooms_b_e.geojson, dataset/floors_b_e.geojson, database/06_toa_b_e_indoor.sql.
Chạy: python Models_3D/scripts/07_import_lod3_b_e.py
"""
from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import mapping, shape
from shapely.geometry.polygon import orient

_spec = importlib.util.spec_from_file_location('align', Path(__file__).with_name('04_align_gis_to_model.py'))
al = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(al)

ROOT = al.ROOT
SRC = ROOT / 'Models_3D' / 'Model_LOD3'
CODES = ('B', 'E')
ALL_CODES = ('A', 'B', 'C', 'E')
MAX_FIT_ERR_M = 0.5  # sai số trung vị cho phép giữa đỉnh phòng GeoJSON và đỉnh khối GLB sau khi khớp
for c in ALL_CODES:
    al.NODE_CODE[f'Root_Toa_{c}_Indoor_LOD3'] = c


def glb_tris(path: Path) -> np.ndarray:
    return next(iter(al.read_glb_triangles(path).values()))


def umeyama(P, Q):
    """Phép đồng dạng 2D (s, R, t) cực tiểu |s R P + t - Q|²."""
    mp, mq = P.mean(0), Q.mean(0)
    X, Y = P - mp, Q - mq
    U, S, Vt = np.linalg.svd(Y.T @ X / len(P))
    D = np.eye(2)
    if np.linalg.det(U @ Vt) < 0:
        D[1, 1] = -1
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / X.var(0).sum()
    return s, R, mq - s * R @ mp


def nearest(X, Q):
    d = np.linalg.norm(X[:, None, :] - Q[None, :, :], axis=2)
    i = d.argmin(1)
    return d[np.arange(len(X)), i], i


def fit_similarity(P, Q):
    """ICP đồng dạng, thử góc khởi đầu mỗi 15°; trả về (sai số trung vị, s, R, t)."""
    best = None
    for a in range(0, 360, 15):
        th = math.radians(a)
        R = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])
        s = np.ptp(Q, 0).max() / np.ptp(P, 0).max()
        t = Q.mean(0) - s * R @ P.mean(0)
        for _ in range(80):
            d, i = nearest((s * (R @ P.T)).T + t, Q)
            keep = d <= np.percentile(d, 90)  # bỏ 10% cặp xa nhất (đỉnh không có cặp tương ứng)
            s, R, t = umeyama(P[keep], Q[i[keep]])
        err = float(np.median(nearest((s * (R @ P.T)).T + t, Q)[0]))
        if best is None or err < best[0]:
            best = (err, s, R, t)
    return best


# ---- Bố trí phòng theo sơ đồ tầng (sơ đồ do trường cung cấp, hình dạng lấy từ mặt cắt model) ----
# Tòa B: vòng cung, tâm B_CENTER (ENU, m). Hàng ngoài = phòng học, hàng trong = WC/thang, giữa là hành lang.
# Trên sơ đồ, trái = đầu tây (góc lớn); các tầng trên lùi dần về phía tây.
B_CENTER = (2.0, -73.16)
B_RINGS = {'inner': (15.0, 29.8), 'corridor': (29.8, 33.0), 'outer': (33.0, 60.0)}  # theo vách trong model
_B14 = ['WC', 'TM', 'WC', '01', 'TM', 'TM', 'WC', 'CT', 'WC']
B_PLAN = {  # tầng: (số phòng hàng ngoài, hàng trong từ tây sang đông)
    1: (11, _B14), 2: (11, _B14), 3: (11, _B14), 4: (11, _B14),
    5: (7, ['WC', 'TM', 'WC', '01', 'TM', 'TM', 'WC']),
    6: (6, ['WC', 'TM', 'WC', '01', 'TM', 'CT']),
    7: (4, ['WC', 'TM', 'WC', '01', 'TM']),
    8: (4, ['WC', 'TM', 'WC']),
    9: (2, ['WC', 'TM']),
}
# Tòa E: lưới 7 cột từ đông (trái sơ đồ) sang tây, cột 1 là khối tròn góc đông bắc, cột 7 là thang xoắn tây.
# Biên cột lấy theo tỉ lệ pixel trên sơ đồ; hàng T (nam) / M (hành lang) / B (bắc) chia theo bề sâu từng cột.
E_COLS_PX = (38, 137, 288, 431, 530, 629, 728, 823)
E_ROWS = {'T': (0.0, 0.42), 'M': (0.42, 0.6), 'B': (0.6, 1.0)}
_E_COMMON = [('WC', (1,), 'T'), ('TM', (2,), 'T'), ('CT', (3,), 'T'), ('TH', (7,), 'TM'), ('1', (1,), 'MB')]
_E_STD = _E_COMMON + [('KHO', (4,), 'T'), ('3', (5,), 'T'), ('5', (6,), 'T'), ('HL', (2, 3, 4, 5, 6), 'M'), ('HL', (2,), 'B')]
E_PLAN = {  # tầng theo sơ đồ (floor_number = tầng + 1 vì có tầng G)
    1: _E_COMMON + [('3', (4,), 'T'), ('5', (5,), 'T'), ('7', (6,), 'T'), ('SANH', (2,), 'MB'),
                    ('HL', (3, 4, 5, 6), 'M'), ('2', (3, 4), 'B'), ('4', (5, 6), 'B')],
    **{k: _E_STD + [('2', (3, 4), 'B'), ('4', (5, 6), 'B')] for k in (2, 3, 4)},
    **{k: _E_STD + [('2', (3,), 'B'), ('4', (4,), 'B'), ('6', (5,), 'B'), ('8', (6,), 'B')] for k in range(5, 12)},
    12: _E_COMMON + [('KHO', (4,), 'T'), ('HL', (2, 3), 'M'), ('HL', (2,), 'B'), ('HT', (4, 5, 6), 'MB')],
}
# phòng không lấy thuộc tính cũ: E10.1 ghi "Hội trường nhỏ" 90 chỗ nhưng ô phòng theo sơ đồ chỉ ~24 m²
IGNORE_OLD = {'E10.1'}
SERVICE = {  # loại ô -> (room_type, tên, thiết bị)
    'WC': ('WC', 'Nhà vệ sinh', None), 'TM': ('Stairs', 'Thang máy & Cầu thang bộ', 'Thang máy + thang bộ'),
    'CT': ('Stairs', 'Cầu thang bộ', 'Thang bộ'), 'TH': ('Stairs', 'Cầu thang thoát hiểm', 'Cầu thang xoắn ngoài trời'),
    'KHO': ('Office', 'Kho', None), 'SANH': ('Office', 'Sảnh chính', 'Quầy lễ tân, bảng thông tin'),
    'HL': ('Corridor', 'Hành lang', None),
}


def section(tris: np.ndarray, T, z0: float):
    """Mặt cắt ngang khối tòa (ENU) trong khoảng [z0, z0 + 3.5]: hợp hình chiếu các tam giác cắt qua các độ cao đó."""
    lo, hi = tris[:, :, 2].min(1), tris[:, :, 2].max(1)
    parts = []
    for z in (z0 + 0.5, z0 + 1.5, z0 + 2.5, z0 + 3.3):
        u = shapely.union_all([shapely.Polygon(t[:, :2]).buffer(0.3) for t in tris[(lo <= z) & (hi >= z)]])
        parts += [shapely.Polygon(g.exterior) for g in getattr(u, 'geoms', [u]) if g.area > 20]
    return al.apply_T(T, shapely.union_all(parts).buffer(-0.3)).simplify(0.2)


def _room(code, fn, kind, num, geom, old, label):
    """Thuộc tính phòng: phòng đánh số giữ tên/loại/sức chứa từ bộ Model_LOD3 nếu có, ô dịch vụ đặt tên theo SERVICE."""
    base = round((fn - 1) * 3.8, 1)
    if kind == 'R':
        o = {} if num in IGNORE_OLD else old.get(num, {})
        props = {'room_code': num, 'room_name': o.get('room_name', f'Phòng học {num}'),
                 'room_type': o.get('room_type', 'Theory'), 'capacity': o.get('capacity'),
                 'equipment_info': o.get('equipment_info')}
    elif kind == 'HT':
        o = old.get('E12', {})
        props = {'room_code': 'E.HT', 'room_name': 'Hội trường E (HTE) - Tầng 12', 'room_type': 'Theory',
                 'capacity': o.get('capacity'), 'equipment_info': o.get('equipment_info')}
    else:
        rtype, name, equip = SERVICE[kind]
        props = {'room_code': num, 'room_name': f'{name} Tòa {code} - {label}', 'room_type': rtype,
                 'capacity': None, 'equipment_info': equip}
    top = base + (0.2 if props['room_type'] == 'Corridor' else 3.5)
    props.update(building_code=code, floor_number=fn, base_height=base, extrude_height=round(top, 1),
                 source='3d_model + floor_plan', source_ref=f'Sơ đồ tầng Tòa {code} + Models_3D/buildings/toa_{code}.glb',
                 verified=False)
    g = shapely.make_valid(geom)
    g = max(getattr(g, 'geoms', [g]), key=lambda p: p.area if p.geom_type == 'Polygon' else 0)
    # làm tròn 7 chữ số thập phân ngay tại đây (như file SQL) để polygon vẫn hợp lệ sau khi làm tròn
    return {'properties': props, 'geometry': orient(shapely.set_precision(al.enu_to_lnglat(g), 1e-7), 1.0)}


def _sector(a0, a1, r0, r1):
    cx, cy = B_CENTER
    arc = np.radians(np.linspace(a0, a1, max(2, int(abs(a1 - a0)) + 1)))
    pts = [(cx + r1 * math.cos(a), cy + r1 * math.sin(a)) for a in arc]
    pts += [(cx + r0 * math.cos(a), cy + r0 * math.sin(a)) for a in arc[::-1]]
    return shapely.Polygon(pts)


def _split(a_hi, a_lo, n):
    """Chia [a_lo, a_hi] thành n đoạn đều, đoạn đầu ở phía tây (góc lớn)."""
    e = np.linspace(a_hi, a_lo, n + 1)
    return list(zip(e[1:], e[:-1]))


def layout_rooms(code, tris, T, old):
    out = []
    for fn, plan in (B_PLAN if code == 'B' else {k + 1: v for k, v in E_PLAN.items()}).items():
        sec = section(tris, T, (fn - 1) * 3.8)
        cells = []  # (kind, mã, hình)
        if code == 'B':
            c = shapely.get_coordinates(sec) - B_CENTER
            ang = np.degrees(np.arctan2(c[:, 1], c[:, 0]))
            a_lo, a_hi = ang.min(), ang.max()
            n_out, inner = plan
            for i, (a, b) in enumerate(_split(a_hi, a_lo, n_out)):
                cells.append(('R', f'B{fn}.{2 * (n_out - i):02d}', _sector(a, b, *B_RINGS['outer'])))
            seen = {}
            for (a, b), k in zip(_split(a_hi, a_lo, len(inner)), inner):
                if k == '01':
                    cells.append(('R', f'B{fn}.01', _sector(a, b, *B_RINGS['inner'])))
                    continue
                seen[k] = seen.get(k, 0) + 1
                cells.append((k, f'B.{k}{seen[k]}-{fn}', _sector(a, b, *B_RINGS['inner'])))
            cells.append(('HL', f'B.HL{fn}', _sector(a_hi, a_lo, *B_RINGS['corridor'])))
            label = f'Tầng {fn}'
        else:
            x0, _, x1, _ = sec.bounds
            px = np.array(E_COLS_PX, float)
            edges = x1 - (px - px[0]) / (px[-1] - px[0]) * (x1 - x0)  # cột 1 ở đầu đông
            k = fn - 1
            merged = {}
            for kind, cols, rows in plan:
                parts = []
                for col in cols:
                    strip = sec.intersection(shapely.box(edges[col], -1e4, edges[col - 1], 1e4))
                    _, ya, _, yb = strip.bounds
                    for r in rows:
                        f0, f1 = E_ROWS[r]
                        parts.append(strip.intersection(shapely.box(edges[col], ya + f0 * (yb - ya),
                                                                    edges[col - 1], ya + f1 * (yb - ya))))
                if kind.isdigit():
                    key = ('R', f'E{k}.{kind}')
                elif kind == 'HL':
                    key = ('HL', f'E.HL{fn}')
                else:
                    key = (kind, f'E.{kind}-{fn}')
                merged.setdefault(key, []).extend(parts)
            cells = [(kind, num, shapely.union_all(p).buffer(0.01).buffer(-0.01)) for (kind, num), p in merged.items()]
            label = f'Tầng {k}'
        for kind, num, g in cells:
            g = g.intersection(sec)
            if g.area >= 1.0:
                out.append(_room(code, fn, kind, num, g, old, label))
    return out


def main() -> None:
    rooms = json.loads((SRC / 'geojson' / 'rooms_ABCE_lod3.geojson').read_text(encoding='utf-8'))['features']
    floors = json.loads((SRC / 'geojson' / 'floors_ABCE_lod3.geojson').read_text(encoding='utf-8'))['features']
    rep = json.loads(al.REPORT.read_text(encoding='utf-8'))['T']
    T = (rep['scale'], rep['theta_rad'], rep['tx'], rep['ty'])
    campus = al.read_glb_triangles(al.GLB)
    footprints = {f['properties']['building_code']: shape(f['geometry'])
                  for f in json.loads((ROOT / 'dataset' / 'buildings.geojson').read_text(encoding='utf-8'))['features']}

    # Cả bộ GeoJSON lệch khỏi model theo cùng một phép đồng dạng: khớp một lần trên tầng 1 của cả 4 tòa
    # (vòng cung Tòa B tự đối xứng xoay nên khớp riêng dễ trượt vài độ)
    P, Q = [], []
    for code in ALL_CODES:
        indoor = glb_tris(SRC / f'toa_{code}_indoor_lod3.glb')
        shell = glb_tris(ROOT / 'Models_3D' / 'buildings' / f'toa_{code}.glb')
        offset = campus[f'Root_Toa_{code}'].reshape(-1, 3)[:, :2].min(0) - shell.reshape(-1, 3)[:, :2].min(0)
        ground = indoor[indoor[:, :, 2].min(axis=1) < 3.4]
        Q.append(np.unique(ground.reshape(-1, 3)[:, :2].round(2), axis=0) + offset)
        P.append(np.unique(np.array([c for f in rooms if f['properties']['building_code'] == code
                                     and f['properties']['floor_number'] == 1
                                     for c in al.lnglat_to_enu(shape(f['geometry'])).exterior.coords]).round(2), axis=0))
    err, s, R, t = fit_similarity(np.concatenate(P), np.concatenate(Q))
    assert err < MAX_FIT_ERR_M, err
    print(f'Khớp GeoJSON->model: sai số trung vị {err:.3f} m, tỉ lệ {s:.4f}, '
          f'xoay {math.degrees(math.atan2(R[1, 0], R[0, 0])):.2f}°')

    def to_project(geom):
        model = shapely.transform(al.lnglat_to_enu(geom), lambda c: (s * (R @ c.T)).T + t)
        return orient(al.enu_to_lnglat(al.apply_T(T, model)), 1.0)

    old = {f['properties']['room_code']: f['properties'] for f in rooms}
    out_rooms, out_floors = [], []
    for code in CODES:
        # tầng G Tòa E giữ nguyên số hóa gốc; các tầng còn lại dựng lại theo sơ đồ tầng
        own = [{'properties': f['properties'], 'geometry': to_project(shape(f['geometry']))} for f in rooms
               if f['properties']['building_code'] == code and code == 'E' and f['properties']['floor_number'] == 1]
        own += layout_rooms(code, campus[f'Root_Toa_{code}'], T, old)
        union = []
        for f in own:
            g = f['geometry']
            assert g.is_valid and g.geom_type == 'Polygon', f['properties']['room_code']
            union.append(g)
            out_rooms.append({'type': 'Feature', 'properties': f['properties'], 'geometry': mapping(g)})
        for f in floors:
            if f['properties']['building_code'] == code:
                out_floors.append({'type': 'Feature', 'properties': f['properties'],
                                   'geometry': mapping(to_project(shape(f['geometry'])))})
        u = shapely.union_all(union)
        inside = u.intersection(footprints[code]).area / u.area
        print(f'  {len(own)} phòng, {inside:.1%} diện tích nằm trong footprint tòa')
        assert inside > 0.95, (code, inside)

    for name, feats in (('rooms_b_e', out_rooms), ('floors_b_e', out_floors)):
        fc = {'type': 'FeatureCollection', 'name': name, 'features': feats}
        (ROOT / 'dataset' / f'{name}.geojson').write_bytes(
            json.dumps(json.loads(json.dumps(fc), parse_float=lambda v: round(float(v), 7)),
                       indent=1, ensure_ascii=False).encode('utf-8'))
    (ROOT / 'database' / '06_toa_b_e_indoor.sql').write_text(sql(out_rooms, out_floors), encoding='utf-8')
    print(f'Đã ghi {len(out_rooms)} phòng, {len(out_floors)} sàn tầng')


def _q(v) -> str:
    return 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"


def _wkt(g: dict) -> str:
    return 'POLYGON(' + ', '.join('(' + ', '.join(f'{round(x, 7)!r} {round(y, 7)!r}' for x, y in ring) + ')'
                                  for ring in g['coordinates']) + ')'


def sql(rooms, floors) -> str:
    bid = "(SELECT id FROM buildings WHERE building_code = '{}')"
    lines = ['-- Nội thất LOD 3 Tòa B và Tòa E (sinh bởi Models_3D/scripts/07_import_lod3_b_e.py, nạp sau 01-05)',
             '-- Dữ liệu số hóa từ model 3D + danh bạ phòng công khai, chưa kiểm chứng thực địa (verified = false)',
             'BEGIN;']
    for c in CODES:
        lines.append(f'DELETE FROM rooms WHERE building_id = {bid.format(c)};')
        lines.append(f'DELETE FROM floors WHERE building_id = {bid.format(c)};')
    for f in floors:
        p = f['properties']
        lines.append('INSERT INTO floors (building_id, floor_number, base_height, ceiling_height, geom) VALUES '
                     f"({bid.format(p['building_code'])}, {p['floor_number']}, {p['base_height']}, {p['ceiling_height']}, "
                     f"ST_GeomFromText('{_wkt(f['geometry'])}', 4326));")
    for f in rooms:
        p = f['properties']
        cap = 'NULL' if p['capacity'] is None else int(p['capacity'])
        lines.append('INSERT INTO rooms (room_code, room_name, room_type, building_id, floor_number, capacity, '
                     'base_height, extrude_height, equipment_info, geom) VALUES '
                     f"({_q(p['room_code'])}, {_q(p['room_name'])}, {_q(p['room_type'])}, {bid.format(p['building_code'])}, "
                     f"{p['floor_number']}, {cap}, {p['base_height']}, {p['extrude_height']}, {_q(p['equipment_info'])}, "
                     f"ST_GeomFromText('{_wkt(f['geometry'])}', 4326));")
    lines.append('COMMIT;')
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    main()
