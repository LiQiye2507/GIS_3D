"""Nạp nội thất LOD 3 Tòa B và Tòa E từ Models_3D/Model_LOD3 vào bộ dữ liệu dự án.

GeoJSON trong Model_LOD3 (rooms/floors_ABCE_lod3.geojson) có thuộc tính phòng đầy đủ nhưng tọa độ
lệch khỏi hệ đã nắn của dự án (tỉ lệ ~1.13, xoay ~3-5°). Các file toa_X_indoor_lod3.glb thì khớp 1:1
với vỏ tòa Models_3D/buildings/toa_X.glb, và vỏ đó chỉ là node Root_Toa_X của model khuôn viên dời về gốc.
Vì vậy:
  1. GLB nội thất cục bộ -> model khuôn viên: cộng độ lệch giữa khung bao Root_Toa_X và khung bao vỏ;
  2. khớp đồng dạng (ICP + Umeyama) đỉnh polygon phòng tầng 1 -> đỉnh khối nội thất tầng 1, gộp 4 tòa;
  3. model -> ENU -> WGS84 bằng phép T của 04_align_gis_to_model.py (align_report.json).

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

    out_rooms, out_floors = [], []
    for code in CODES:
        own = [f for f in rooms if f['properties']['building_code'] == code]
        union = []
        for f in own:
            g = to_project(shape(f['geometry']))
            assert g.is_valid, f['properties']['room_code']
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
