"""Nạp nội thất LOD 3 Tòa A, B, E từ Models_3D/Model_LOD3 vào bộ dữ liệu dự án (Tòa C giữ dữ liệu hiện có).

GeoJSON trong Model_LOD3 (rooms/floors_ABCE_lod3.geojson) có thuộc tính phòng đầy đủ nhưng tọa độ
lệch khỏi hệ đã nắn của dự án (tỉ lệ ~1.13, xoay ~4.5°). Các file toa_X_indoor_lod3.glb của Tòa A, B, C thì
khớp 1:1 với vỏ tòa Models_3D/buildings/toa_X.glb, và vỏ đó chỉ là node Root_Toa_X của model khuôn viên dời về gốc.
Vì vậy:
  1. GLB nội thất cục bộ -> model khuôn viên: cộng độ lệch giữa khung bao Root_Toa_X và khung bao vỏ;
  2. khớp đồng dạng (ICP + Umeyama) đỉnh polygon phòng tầng 1 -> đỉnh khối nội thất tầng 1 của Tòa A, B, C;
  3. model -> ENU -> WGS84 bằng phép T của 04_align_gis_to_model.py (align_report.json).
Tòa A, E: lấy nguyên hình học + mã phòng của bộ Model_LOD3. Riêng Tòa E, khối nội thất bị co và xoay so với vỏ tòa
nên bù thêm phép E_FIX.
Tòa B: phòng dựng lại theo sơ đồ tầng (B_PLAN) trên mặt cắt khối tòa trong model, đánh số từ đông sang tây và
mã ô dịch vụ dạng B.WC1-1; phòng học lấy tên/loại/sức chứa của bộ Model_LOD3 theo mã.

Ghi: dataset/rooms.geojson + floors.geojson (phần Tòa A), database/03_toa_a_indoor.sql,
     dataset/rooms_b_e.geojson + floors_b_e.geojson, database/06_toa_b_e_indoor.sql.
Chạy: python Models_3D/scripts/07_import_lod3.py
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
FIT_CODES = ('A', 'B', 'C')  # GLB nội thất khớp vỏ tòa; Tòa E thì không (xem E_FIX)
MAX_FIT_ERR_M = 0.5  # sai số trung vị cho phép giữa đỉnh phòng GeoJSON và đỉnh khối GLB sau khi khớp
# Bù cho Tòa E sau phép chung (ENU dự án, mét): x' = s R(θ) x + t. Khớp tâm 114 phòng trùng mã giữa bộ
# Model_LOD3 và layout cắt từ vỏ Root_Toa_E (bản trước), sai số trung vị 0.81 m; kiểm tra lại bằng assert footprint.
E_FIX = (0.88114, math.radians(3.959), -18.939, -5.201)
for c in ('A', 'B', 'C', 'E'):
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


# ---- Tòa B: bố trí phòng theo sơ đồ tầng (sơ đồ do trường cung cấp, hình dạng lấy từ mặt cắt model) ----
# Vòng cung, tâm B_CENTER (ENU, m). Hàng ngoài = phòng học, hàng trong = WC/thang, giữa là hành lang.
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
SERVICE = {  # loại ô -> (room_type, tên, thiết bị)
    'WC': ('WC', 'Nhà vệ sinh', None), 'TM': ('Stairs', 'Thang máy & Cầu thang bộ', 'Thang máy + thang bộ'),
    'CT': ('Stairs', 'Cầu thang bộ', 'Thang bộ'), 'HL': ('Corridor', 'Hành lang', None),
}


def section(tris: np.ndarray, T, z0: float):
    """Mặt cắt ngang khối tòa (ENU) trong khoảng [z0, z0 + 3.5]: hợp hình chiếu các tam giác cắt qua các độ cao đó."""
    lo, hi = tris[:, :, 2].min(1), tris[:, :, 2].max(1)
    parts = []
    for z in (z0 + 0.5, z0 + 1.5, z0 + 2.5, z0 + 3.3):
        u = shapely.union_all([shapely.Polygon(t[:, :2]).buffer(0.3) for t in tris[(lo <= z) & (hi >= z)]])
        parts += [shapely.Polygon(g.exterior) for g in getattr(u, 'geoms', [u]) if g.area > 20]
    return al.apply_T(T, shapely.union_all(parts).buffer(-0.3)).simplify(0.2)


def _clean(g):
    """Polygon lớn nhất, làm tròn 7 chữ số thập phân ngay tại đây (như file SQL) để vẫn hợp lệ sau khi làm tròn."""
    g = shapely.make_valid(shapely.set_precision(g, 1e-7))
    g = max(getattr(g, 'geoms', [g]), key=lambda p: p.area if p.geom_type == 'Polygon' else 0)
    return orient(g, 1.0)


def _room(fn, kind, num, geom, old, label):
    """Thuộc tính phòng Tòa B: phòng học lấy tên/loại/sức chứa từ bộ Model_LOD3 theo mã, ô dịch vụ đặt tên theo SERVICE."""
    base = round((fn - 1) * 3.8, 1)
    if kind == 'R':
        o = old.get(num, {})
        props = {'room_code': num, 'room_name': o.get('room_name', f'Phòng học {num}'),
                 'room_type': o.get('room_type', 'Theory'), 'capacity': o.get('capacity'),
                 'equipment_info': o.get('equipment_info')}
    else:
        rtype, name, equip = SERVICE[kind]
        props = {'room_code': num, 'room_name': f'{name} Tòa B - {label}', 'room_type': rtype,
                 'capacity': None, 'equipment_info': equip}
    top = base + (0.2 if props['room_type'] == 'Corridor' else 3.5)
    props.update(building_code='B', floor_number=fn, base_height=base, extrude_height=round(top, 1),
                 source='3d_model + floor_plan', source_ref='Sơ đồ tầng Tòa B + Models_3D/buildings/toa_B.glb',
                 verified=False)
    return {'properties': props, 'geometry': _clean(al.enu_to_lnglat(geom))}


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


def layout_b(tris, T, old):
    out = []
    for fn, (n_out, inner) in B_PLAN.items():
        sec = section(tris, T, (fn - 1) * 3.8)
        c = shapely.get_coordinates(sec) - B_CENTER
        ang = np.degrees(np.arctan2(c[:, 1], c[:, 0]))
        a_lo, a_hi = ang.min(), ang.max()
        cells = []  # (kind, mã, hình); phòng học đánh số chẵn từ đông (B.02) sang tây
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
        for kind, num, g in cells:
            g = g.intersection(sec)
            if g.area >= 1.0:
                out.append(_room(fn, kind, num, g, old, f'Tầng {fn}'))
    return out


def main() -> None:
    rooms = json.loads((SRC / 'geojson' / 'rooms_ABCE_lod3.geojson').read_text(encoding='utf-8'))['features']
    floors = json.loads((SRC / 'geojson' / 'floors_ABCE_lod3.geojson').read_text(encoding='utf-8'))['features']
    rep = json.loads(al.REPORT.read_text(encoding='utf-8'))['T']
    T = (rep['scale'], rep['theta_rad'], rep['tx'], rep['ty'])
    campus = al.read_glb_triangles(al.GLB)
    footprints = {f['properties']['building_code']: shape(f['geometry'])
                  for f in json.loads((ROOT / 'dataset' / 'buildings.geojson').read_text(encoding='utf-8'))['features']}

    # Cả bộ GeoJSON lệch khỏi model theo cùng một phép đồng dạng: khớp một lần trên tầng 1 của các tòa có GLB khớp vỏ
    # (vòng cung Tòa B tự đối xứng xoay nên khớp riêng dễ trượt vài độ)
    P, Q = [], []
    for code in FIT_CODES:
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

    es, eth, etx, ety = E_FIX
    RE = np.array([[math.cos(eth), -math.sin(eth)], [math.sin(eth), math.cos(eth)]])

    def to_project(geom, code):
        enu = al.apply_T(T, shapely.transform(al.lnglat_to_enu(geom), lambda c: (s * (R @ c.T)).T + t))
        if code == 'E':
            enu = shapely.transform(enu, lambda c: (es * (RE @ c.T)).T + (etx, ety))
        return _clean(al.enu_to_lnglat(enu))

    old = {f['properties']['room_code']: f['properties'] for f in rooms}
    out = {}  # mã tòa -> (phòng, sàn tầng)
    for code in ('A', 'B', 'E'):
        if code == 'B':
            own = layout_b(campus['Root_Toa_B'], T, old)
        else:
            own = [{'properties': f['properties'], 'geometry': to_project(shape(f['geometry']), code)}
                   for f in rooms if f['properties']['building_code'] == code]
        for f in own:
            assert f['geometry'].is_valid and f['geometry'].geom_type == 'Polygon', f['properties']['room_code']
        fl = [{'properties': f['properties'], 'geometry': to_project(shape(f['geometry']), code)}
              for f in floors if f['properties']['building_code'] == code]
        u = shapely.union_all([f['geometry'] for f in own])
        inside = u.intersection(footprints[code]).area / u.area
        print(f'  Tòa {code}: {len(own)} phòng, {len(fl)} sàn, {inside:.1%} diện tích nằm trong footprint tòa')
        assert inside > 0.95, (code, inside)
        out[code] = ([_feature(f) for f in own], [_feature(f) for f in fl])

    # Tòa A: thay phần A trong dataset/rooms.geojson, floors.geojson (giữ Tòa C), ghi lại 03_toa_a_indoor.sql
    for name, i in (('rooms', 0), ('floors', 1)):
        path = ROOT / 'dataset' / f'{name}.geojson'
        fc = json.loads(path.read_text(encoding='utf-8'))
        fc['features'] = out['A'][i] + [f for f in fc['features'] if f['properties']['building_code'] != 'A']
        path.write_bytes(al.dump_fc(_round(fc)))
    (ROOT / 'database' / '03_toa_a_indoor.sql').write_text(sql(
        ('A',), out['A'][0], out['A'][1], '-- Nội thất LOD 3 Tòa A (sinh bởi Models_3D/scripts/07_import_lod3.py, nạp sau 02)'),
        encoding='utf-8')

    be_rooms, be_floors = out['B'][0] + out['E'][0], out['B'][1] + out['E'][1]
    for name, feats in (('rooms_b_e', be_rooms), ('floors_b_e', be_floors)):
        fc = {'type': 'FeatureCollection', 'name': name, 'features': feats}
        (ROOT / 'dataset' / f'{name}.geojson').write_bytes(
            json.dumps(_round(fc), indent=1, ensure_ascii=False).encode('utf-8'))
    (ROOT / 'database' / '06_toa_b_e_indoor.sql').write_text(sql(
        ('B', 'E'), be_rooms, be_floors,
        '-- Nội thất LOD 3 Tòa B và Tòa E (sinh bởi Models_3D/scripts/07_import_lod3.py, nạp sau 01-05)'),
        encoding='utf-8')
    print(f'Đã ghi Tòa A {len(out["A"][0])} phòng; Tòa B, E {len(be_rooms)} phòng, {len(be_floors)} sàn tầng')


def _feature(f) -> dict:
    return {'type': 'Feature', 'properties': f['properties'], 'geometry': mapping(f['geometry'])}


def _round(fc) -> dict:
    return json.loads(json.dumps(fc), parse_float=lambda v: round(float(v), 7))


def _q(v) -> str:
    return 'NULL' if v is None else "'" + str(v).replace("'", "''") + "'"


def _wkt(g: dict) -> str:
    return 'POLYGON(' + ', '.join('(' + ', '.join(f'{round(x, 7)!r} {round(y, 7)!r}' for x, y in ring) + ')'
                                  for ring in g['coordinates']) + ')'


def sql(codes, rooms, floors, header) -> str:
    bid = "(SELECT id FROM buildings WHERE building_code = '{}')"
    lines = [header,
             '-- Dữ liệu số hóa từ model 3D + sơ đồ tầng/danh bạ phòng công khai, cần kiểm chứng thực địa',
             'BEGIN;']
    for c in codes:
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
