"""Dời dữ liệu GIS (đang nắn theo model 3D ở 04_align_gis_to_model.py) về vị trí thật trên ảnh vệ tinh Esri World Imagery.

Mỗi tòa: xoay quanh PIVOT (nếu có góc) rồi dịch (mét Đông, mét Bắc); số liệu trùng SAT_ALIGN trong
frontend/js/campus/geo.js (frontend dời ngược lại khi xem ở sơ đồ model). Đối tượng có building_code hoặc nằm trong
footprint một tòa (nới 1 m) đi theo tòa đó; điểm ngoài tòa (lối đi, cổng, sân) dịch theo nội suy IDW độ dời các tòa.
D và Cafe Voi đã ở vị trí vệ tinh (SHIFT_M của script 04) nên giữ nguyên. Ranh giới khuôn viên không đổi.

Chỉ chạy một lần trên dữ liệu đã nắn theo model: file 02_seed được đánh dấu MARK, chạy lại sẽ dừng.
Chạy: python Models_3D/scripts/08_align_to_satellite.py          (ghi đè dataset/ và database/)
      python Models_3D/scripts/08_align_to_satellite.py --check  (chỉ tự kiểm tra, không ghi)
"""
from __future__ import annotations

import importlib.util
import json
import math
import re
import sys
from pathlib import Path

from shapely.geometry import Point, shape

_spec = importlib.util.spec_from_file_location('align', Path(__file__).with_name('04_align_gis_to_model.py'))
al = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(al)

ROOT = al.ROOT
# (mét Đông, mét Bắc, độ xoay theo chiều kim đồng hồ) – trùng SAT_ALIGN trong frontend/js/campus/geo.js
SAT = {'A': (-3.6, -8.6, 0), 'B': (3.7, -3.1, -3), 'C': (4.7, 18.8, 0), 'E': (3.9, 1.3, 0), 'NHA_PVSV': (2.6, -8.6, 0)}
PIVOT = {'B': (106.8037311, 10.8700535)}  # tâm khung bao footprint Tòa B (hệ model)
IDW_FADE_M = al.IDW_FADE_M
MARK = '-- Hình học đã dời về vị trí ảnh vệ tinh bằng Models_3D/scripts/08_align_to_satellite.py'
GEOJSON = ['buildings', 'floors', 'rooms', 'amenities', 'paths', 'sports_fields', 'rooms_b_e', 'floors_b_e']
SQL = ['02_seed_uit_data.sql', '03_toa_a_indoor.sql', '04_campus_graph.sql', '05_sports_fields.sql',
       '06_toa_b_e_indoor.sql', 'checks.sql']
GATE_A = '106.802094, 10.8704303'  # tọa độ Cổng A viết thẳng trong 04_campus_graph.sql, checks.sql


def enu(lng, lat):
    return (lng - al.O[0]) * al.MLNG, (lat - al.O[1]) * al.MLAT


def rigid(code, x, y):
    de, dn, deg = SAT[code]
    if deg:
        cx, cy = enu(*PIVOT[code])
        t = math.radians(-deg)  # độ theo chiều kim đồng hồ -> rad ngược chiều
        x, y = (cx + math.cos(t) * (x - cx) - math.sin(t) * (y - cy),
                cy + math.sin(t) * (x - cx) + math.cos(t) * (y - cy))
    return x + de, y + dn


def make_mover():
    fps = {f['properties']['building_code']: al.lnglat_to_enu(shape(f['geometry']))
           for f in json.loads((ROOT / 'dataset' / 'buildings.geojson').read_text(encoding='utf-8'))['features']}
    near = {k: g.buffer(1.0) for k, g in fps.items()}

    def move(lng, lat, code=None):
        x, y = enu(lng, lat)
        if code is None:
            code = next((k for k, g in near.items() if g.contains(Point(x, y))), None)
        if code in SAT:
            x, y = rigid(code, x, y)
        elif code not in fps:  # ngoài mọi tòa: IDW, D/Cafe Voi góp độ dời 0
            w = {k: 1 / max(g.distance(Point(x, y)), 5.0) ** 2 for k, g in fps.items()}
            tot = sum(w.values()) + 1 / IDW_FADE_M ** 2
            x += sum(w[k] * SAT[k][0] for k in w if k in SAT) / tot
            y += sum(w[k] * SAT[k][1] for k in w if k in SAT) / tot
        return round(al.O[0] + x / al.MLNG, 7), round(al.O[1] + y / al.MLAT, 7)

    return move, fps


def convert_geojson(name, move):
    path = ROOT / 'dataset' / f'{name}.geojson'
    src = path.read_bytes()
    fc = json.loads(src.decode('utf-8'))
    assert al.dump_fc(fc) == src, f'{name}: định dạng ghi khác bản gốc'
    for f in fc['features']:
        f['geometry']['coordinates'] = al._move_coords(f['geometry']['coordinates'], move, f['properties'].get('building_code'))
    return path, al.dump_fc(fc)


def convert_sql(name, move):
    path = ROOT / 'database' / name
    src = path.read_bytes().decode('utf-8')
    gx, gy = move(*map(float, GATE_A.split(', ')))
    out = []
    for line in src.split('\n'):
        m = al.INSERT_RE.match(line)
        if m:
            bc = (re.search(r"VALUES \('([^']+)'", line) if m.group(1) == 'buildings'
                  else re.search(r"building_code = '(\w+)'", line))
            code = bc.group(1) if bc else None
            line = al.WKT_RE.sub(lambda w: "ST_GeomFromText('" + al.PAIR_RE.sub(
                lambda p: '{0!r} {1!r}'.format(*move(float(p.group(1)), float(p.group(2)), code)), w.group(1)) + "'", line)
        out.append(line.replace(GATE_A, f'{gx!r}, {gy!r}'))
    if name == '02_seed_uit_data.sql':
        assert MARK not in src, 'Dữ liệu đã được dời trước đó, không chạy lại'
        cr = '\r' if out[0].endswith('\r') else ''
        out.insert(0, MARK + cr)
    return path, '\n'.join(out).encode('utf-8')


def self_check(move, fps):
    # trong tòa: dịch đúng độ dời, xoay giữ khoảng cách; ngoài xa: gần như đứng yên
    c = fps['C'].representative_point()  # tâm hình học của C rơi vào sân trong
    lng, lat = al.O[0] + c.x / al.MLNG, al.O[1] + c.y / al.MLAT
    x, y = enu(*move(lng, lat))
    assert abs(x - c.x - 4.7) < 0.02 and abs(y - c.y - 18.8) < 0.02, (x - c.x, y - c.y)
    b = fps['B'].exterior.coords
    p, q = [enu(*move(al.O[0] + e / al.MLNG, al.O[1] + n / al.MLAT, 'B')) for e, n in (b[0], b[3])]
    assert abs(math.dist(p, q) - math.dist(b[0], b[3])) < 0.02
    far = move(al.O[0] + 600 / al.MLNG, al.O[1])
    assert math.dist(enu(*far), (600, 0)) < 0.5, far
    print('CHECK OK')


def main():
    move, fps = make_mover()
    self_check(move, fps)
    if '--check' in sys.argv:
        return
    outs = [convert_geojson(n, move) for n in GEOJSON] + [convert_sql(n, move) for n in SQL]
    for path, data in outs:  # chỉ ghi khi mọi file đã chuyển xong không lỗi
        path.write_bytes(data)
    print(f'Đã ghi {len(GEOJSON)} GeoJSON + {len(SQL)} SQL; Cổng A -> {move(*map(float, GATE_A.split(", ")))}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
