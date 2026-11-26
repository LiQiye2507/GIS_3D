"""Công cụ cập nhật mạng lối đi (Walkway). Chỉ dùng thư viện chuẩn Python.

    python database/paths_tool.py apply    # sau khi Lưu ở web (?edit=paths): lấy paths.geojson mới nhất trong Downloads
                                           # rồi chạy luôn sync + reload + issues
    python database/paths_tool.py sync     # dataset/paths.geojson -> khối INSERT campus_paths trong 02_seed_uit_data.sql
    python database/paths_tool.py reload   # nạp lại toàn bộ CSDL trong Docker (load_all.sql) và in kết quả checks.sql
    python database/paths_tool.py issues   # xuất dataset/path_issues.geojson: đầu cụt, cụm rời, chỗ phải đi vòng

Hướng dẫn: docs/EDIT_PATHS.md
"""
import json
import math
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / 'dataset' / 'paths.geojson'
SEED = ROOT / 'database' / '02_seed_uit_data.sql'
ISSUES = ROOT / 'dataset' / 'path_issues.geojson'
# Lối nối tự động (gapfix_*) mà người dùng đã xóa trên web: fix không tự nối lại cặp nút đó nữa
NOLINK = ROOT / 'dataset' / 'paths_nolink.json'
DOWNLOADS = Path.home() / 'Downloads'
PSQL = ['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'uit_campus']

SEED_HEADER = [
    '-- 5. Campus Paths (3D Walkways / Corridors / Stairs)',
    '-- Sinh tự động từ dataset/paths.geojson bằng: python database/paths_tool.py sync (đừng sửa tay khối này).',
]


def haversine_m(a, b):
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla, dlo = la2 - la1, math.radians(b[0] - a[0])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(h))


def sync():
    data = json.loads(GEOJSON.read_text(encoding='utf-8'))
    out, used = [], set()
    for f in data['features']:
        g = f.get('geometry')
        if not g:
            continue
        parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates'] if g['type'] == 'MultiLineString' else []
        if not parts:
            print(f"  bỏ qua đối tượng không phải đường: {g['type']}")
            continue
        for part in parts:
            coords = [[round(c[0], 7), round(c[1], 7), 0.0] for c in part]
            coords = [c for i, c in enumerate(coords) if i == 0 or c != coords[i - 1]]
            if len(coords) < 2:
                continue
            props = {k: v for k, v in (f.get('properties') or {}).items() if k != 'fid'}
            pid = props.get('id')
            if not pid or pid in used:
                n = 1
                while f'qgis_{n:03d}' in used:
                    n += 1
                pid = f'qgis_{n:03d}'
            used.add(pid)
            length = sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))
            props.update({
                'id': pid,
                'path_type': 'Walkway', 'floor_from': 1, 'floor_to': 1,
                'length_m': round(length, 1),
                'source': props.get('source') or 'manual',
                'verified': bool(props.get('verified', False)),
            })
            out.append({'type': 'Feature', 'properties': props, 'geometry': {'type': 'LineString', 'coordinates': coords}})
    data = {'type': 'FeatureCollection', 'name': data.get('name', 'paths'),
            'crs': data.get('crs', {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'}}),
            'features': out}
    with GEOJSON.open('w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write('\n')

    lines = SEED.read_text(encoding='utf-8').split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('-- 5. Campus Paths'))
    end = max(i for i, l in enumerate(lines) if l.startswith(('INSERT INTO campus_paths', 'INSERT INTO path_entrances')))
    inserts = []
    for f in out:
        wkt = ', '.join(f'{c[0]} {c[1]} 0.0' for c in f['geometry']['coordinates'])
        inserts.append(
            "INSERT INTO campus_paths (path_type, floor_from, floor_to, length_m, geom) VALUES "
            f"('Walkway', 1, 1, {f['properties']['length_m']}, ST_GeomFromText('LINESTRING Z ({wkt})', 4326));"
        )
    ents = _entrances()
    inserts += [f"INSERT INTO path_entrances (building_code, geom) VALUES ('{e['building_code']}', "
                f"ST_SetSRID(ST_MakePoint({e['lng']}, {e['lat']}), 4326));" for e in ents]
    SEED.write_text('\n'.join(lines[:start] + SEED_HEADER + inserts + lines[end + 1:]), encoding='utf-8', newline='\n')
    total = sum(f['properties']['length_m'] for f in out)
    print(f'sync: {len(out)} lối đi, tổng {total:.0f} m, {len(ents)} lối vào tòa -> {SEED.relative_to(ROOT)}')


def _entrances():
    """Lối vào tòa người dùng vẽ (đầu lối cụt chạm tòa, đo trên sa bàn) bằng database/paths_entrances.mjs."""
    with tempfile.TemporaryDirectory() as tmp:
        dst = Path(tmp) / 'ent.json'
        res = subprocess.run(['node', str(ROOT / 'database' / 'paths_entrances.mjs'), str(GEOJSON), str(dst)],
                             cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
        if res.returncode:
            sys.exit('paths_entrances.mjs lỗi (cần Node >= 22 và backend đang chạy):\n' + res.stderr)
        return json.loads(dst.read_text())


def reload():
    subprocess.run(['docker', 'compose', 'exec', '-T', 'db', 'rm', '-rf', '/tmp/dbload'], cwd=ROOT, check=True)
    subprocess.run(['docker', 'compose', 'cp', 'database', 'db:/tmp/dbload'], cwd=ROOT, check=True)
    res = subprocess.run(PSQL + ['-q', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/dbload/load_all.sql'],
                         cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    print('\n'.join(l for l in res.stdout.splitlines() if l.strip()))
    err = [l for l in res.stderr.splitlines() if 'NOTICE' not in l and l.strip()]
    if res.returncode:
        print('\n'.join(err))
        sys.exit('reload: lỗi khi nạp CSDL (xem thông báo ở trên)')
    print('reload: xong. Cần: a=0, b=0, d=1, e=1, f=0')


ISSUES_SQL = r"""
-- pgr_dijkstraCost chạy câu SQL con riêng nên không thấy CTE: các cặp điểm để vào bảng tạm
CREATE TEMP TABLE pairs AS
WITH w AS (SELECT * FROM campus_paths WHERE path_type = 'Walkway'),
nodes AS (
    SELECT DISTINCT ON (n) n, p FROM (
        SELECT source_node n, ST_StartPoint(geom) p FROM w UNION ALL SELECT target_node, ST_EndPoint(geom) FROM w
    ) s ORDER BY n
)
SELECT a.n s, b.n t, ST_Distance(a.p::geography, b.p::geography) d, ST_MakeLine(a.p, b.p) g
FROM nodes a JOIN nodes b ON a.n < b.n AND ST_DWithin(a.p::geography, b.p::geography, 40)
WHERE ST_Distance(a.p::geography, b.p::geography) > 1.5
  AND NOT EXISTS (SELECT 1 FROM buildings bl WHERE ST_Intersects(ST_Buffer(bl.geom::geography, -1)::geometry, ST_MakeLine(a.p, b.p)));

WITH w AS (SELECT * FROM campus_paths WHERE path_type = 'Walkway'),
nodes AS (
    SELECT DISTINCT ON (n) n, p FROM (
        SELECT source_node n, ST_StartPoint(geom) p FROM w UNION ALL SELECT target_node, ST_EndPoint(geom) FROM w
    ) s ORDER BY n
),
deg AS (
    SELECT n, count(*) c FROM (SELECT source_node n FROM campus_paths UNION ALL SELECT target_node FROM campus_paths) x GROUP BY n
),
net AS (
    SELECT start_vid s, end_vid t, agg_cost FROM pgr_dijkstraCost(
        'SELECT id, source_node source, target_node target, cost, reverse_cost FROM campus_paths WHERE path_type = ''Walkway''',
        'SELECT s AS source, t AS target FROM pairs', directed := false)
),
gaps AS (
    SELECT p.g, 'detour' AS kind, round(p.d::numeric, 1) AS d_m, round(n.agg_cost::numeric, 1) AS net_m,
           format('Cách %s m nhưng phải đi vòng %s m: thiếu lối nối?', round(p.d::numeric, 1), round(n.agg_cost::numeric)) AS note
    FROM pairs p JOIN net n USING (s, t)
    WHERE n.agg_cost > 2.5 * p.d AND n.agg_cost - p.d > 40
),
dangling AS (
    SELECT nodes.p AS g,
           CASE WHEN EXISTS (SELECT 1 FROM buildings b WHERE ST_DWithin(b.geom::geography, nodes.p::geography, 3))
                THEN 'entrance' ELSE 'dead_end' END AS kind,
           NULL::numeric AS d_m, NULL::numeric AS net_m,
           CASE WHEN EXISTS (SELECT 1 FROM buildings b WHERE ST_DWithin(b.geom::geography, nodes.p::geography, 3))
                THEN 'Đầu cụt sát tòa nhà (lối vào tòa, thường là đúng)'
                ELSE 'Đầu cụt: lối đi dừng giữa chừng, có phải chưa nối tới lối khác?' END AS note
    FROM nodes JOIN deg USING (n) WHERE deg.c = 1
),
islands AS (
    SELECT ST_Collect(w.geom) AS g, 'island' AS kind, NULL::numeric, NULL::numeric,
           'Cụm lối đi tách rời, không nối được vào mạng chính' AS note
    FROM w JOIN pgr_connectedComponents(
        'SELECT id, source_node source, target_node target, cost, reverse_cost FROM campus_paths') c ON c.node = w.source_node
    GROUP BY c.component
    HAVING c.component <> (
        SELECT component FROM pgr_connectedComponents(
            'SELECT id, source_node source, target_node target, cost, reverse_cost FROM campus_paths')
        GROUP BY component ORDER BY count(*) DESC LIMIT 1)
)
SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(json_build_object(
    'type', 'Feature',
    'properties', json_build_object('kind', kind, 'note', note, 'd_m', d_m, 'net_m', net_m),
    'geometry', ST_AsGeoJSON(ST_Force2D(g), 7)::json)), '[]'::json))
FROM (SELECT * FROM gaps UNION ALL SELECT * FROM dangling UNION ALL SELECT * FROM islands) x;
"""


def _vec(a, b):
    return ((b[0] - a[0]) * 111320 * math.cos(math.radians(a[1])), (b[1] - a[1]) * 110574)


def _angle(u, v):
    n = math.hypot(*u) * math.hypot(*v)
    return math.degrees(math.acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / n)))) if n else 180.0


def _frame(points, direction):
    """Đổi điểm giữa CSDL và sa bàn bằng frontend/js/frame.js (database/paths_view.mjs). direction: 'to-view' | 'to-db'."""
    if not points:
        return []
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / 'in.json', Path(tmp) / 'out.json'
        src.write_text(json.dumps([[c[0], c[1]] for c in points]))
        res = subprocess.run(['node', str(ROOT / 'database' / 'paths_view.mjs'), direction, str(src), str(dst)],
                             cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
        if res.returncode:
            sys.exit('paths_view.mjs lỗi (cần Node >= 22 và backend đang chạy):\n' + res.stderr)
        return json.loads(dst.read_text())


def _view_features(features):
    """Bản sao các lối đi ở tọa độ SA BÀN (nơi người dùng vẽ / nhìn) + bảng tra ngược về tọa độ CSDL gốc."""
    db_pts = [c for f in features for c in f['geometry']['coordinates']]
    view_pts = _frame(db_pts, 'to-view')
    back = {}
    it = iter(view_pts)
    out = []
    for f in features:
        coords = []
        for c in f['geometry']['coordinates']:
            v = [round(x, 9) for x in next(it)] + [0.0]
            back[(v[0], v[1])] = c
            coords.append(v)
        out.append({**f, 'geometry': {'type': 'LineString', 'coordinates': coords}})
    return out, back


def _to_db_features(view_feats, back):
    """Đổi các lối (đã sửa trên sa bàn) về CSDL; đỉnh không đổi giữ nguyên tọa độ gốc để không trôi."""
    missing = [c for f in view_feats for c in f['geometry']['coordinates'] if (c[0], c[1]) not in back]
    for c, d in zip(missing, _frame(missing, 'to-db')):
        back[(c[0], c[1])] = [round(d[0], 7), round(d[1], 7), 0.0]
    return [{**f, 'geometry': {'type': 'LineString', 'coordinates': [list(back[(c[0], c[1])]) for c in f['geometry']['coordinates']]}}
            for f in view_feats]


def folds():
    """Nếp gấp, đo TRÊN SA BÀN: lối tự quay ngược (gấp > 150°), hoặc hai lối đè lên nhau ở một nút."""
    data = json.loads(GEOJSON.read_text(encoding='utf-8'))
    view_feats, back = _view_features(data['features'])
    arms, out = {}, []
    for f in view_feats:
        c = f['geometry']['coordinates']
        pid = f['properties'].get('id')
        for i in range(1, len(c) - 1):
            turn = 180 - _angle(_vec(c[i], c[i - 1]), _vec(c[i], c[i + 1]))
            if turn > 150:
                out.append((c[i], f'Lối {pid} tự quay ngược ở đỉnh này (gấp {turn:.0f}°)'))
        for i, c0 in enumerate(c):
            k = (round(c0[0], 7), round(c0[1], 7))
            for j in (i - 1, i + 1):
                if 0 <= j < len(c):
                    arms.setdefault(k, []).append((pid, c0, c[j]))
    for k, a in arms.items():
        for x in range(len(a)):
            for y in range(x + 1, len(a)):
                (px, node, ex), (py, _, ey) = a[x], a[y]
                if px == py or _angle(_vec(node, ex), _vec(node, ey)) >= 20:
                    continue
                short, long_ = (ex, ey) if _m(node, ex) < _m(node, ey) else (ey, ex)
                # ngã ba chữ Y (hai nhánh tách xa dần) thì bình thường; chỉ báo khi nhánh ngắn nằm đè lên nhánh dài
                if _m(short, _proj(short, node, long_)[0]) < 2:
                    out.append((node, f'Lối {px} và {py} chồng lên nhau ở đây: tuyến có thể phải đi tới rồi quay lại'))
    return [{'type': 'Feature', 'properties': {'kind': 'fold', 'note': n, 'd_m': None, 'net_m': None},
             'geometry': {'type': 'Point', 'coordinates': list(back.get((p[0], p[1]), p))[:2]}} for p, n in out]


def issues():
    res = subprocess.run(PSQL + ['-q', '-At', '-c', ISSUES_SQL], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if res.returncode:
        sys.exit(res.stderr)
    fc = json.loads(res.stdout)
    fc['features'] += folds()
    ISSUES.write_text(json.dumps(fc, ensure_ascii=False), encoding='utf-8')
    kinds = {}
    for f in fc['features']:
        kinds[f['properties']['kind']] = kinds.get(f['properties']['kind'], 0) + 1
    print(f'issues: {kinds or "không có"} -> {ISSUES.relative_to(ROOT)} (hiện bằng vòng hồng ở web ?edit=paths)')


def apply():
    """Lấy file Lưu từ web (Downloads/paths*.geojson mới nhất) thay cho dataset/paths.geojson rồi nạp vào CSDL."""
    found = sorted(DOWNLOADS.glob('paths*.geojson'), key=lambda p: p.stat().st_mtime, reverse=True)
    if not found:
        sys.exit(f'apply: không thấy paths*.geojson trong {DOWNLOADS}. Hãy bấm "Lưu" ở web (?edit=paths) trước.')
    src = found[0]
    age_min = (time.time() - src.stat().st_mtime) / 60
    data = json.loads(src.read_text(encoding='utf-8'))
    if data.get('type') != 'FeatureCollection' or not data.get('features'):
        sys.exit(f'apply: {src.name} không phải GeoJSON lối đi hợp lệ')
    _remember_deleted_links(json.loads(GEOJSON.read_text(encoding='utf-8')), data)
    backup = GEOJSON.with_suffix('.geojson.bak')
    shutil.copyfile(GEOJSON, backup)
    shutil.copyfile(src, GEOJSON)
    print(f'apply: dùng {src} (lưu {age_min:.0f} phút trước), bản cũ để ở {backup.relative_to(ROOT)}')
    sync()
    fix()
    issues()


# ---------- tự sửa lỗi vẽ thường gặp ----------
def _m(a, b):
    return math.hypot(*_vec(a, b))


def _turn(a, b, c):
    """Góc rẽ tại b (0 = đi thẳng, 180 = quay ngược)."""
    return 180 - _angle(_vec(b, a), _vec(b, c))


def _proj(p, a, b):
    """Điểm gần p nhất trên đoạn ab và tham số t."""
    ab, ap = _vec(a, b), _vec(a, p)
    t = max(0.0, min(1.0, (ab[0] * ap[0] + ab[1] * ap[1]) / ((ab[0] ** 2 + ab[1] ** 2) or 1)))
    return [round(a[0] + t * (b[0] - a[0]), 7), round(a[1] + t * (b[1] - a[1]), 7), 0.0], t


def _geometry_fixes(feats):
    log = []
    key = lambda c: (round(c[0], 7), round(c[1], 7))

    def users():
        u = {}
        for f in feats:
            for c in f['geometry']['coordinates']:
                u.setdefault(key(c), set()).add(f['properties']['id'])
        return u

    # 1. đầu cụt cách đỉnh của lối khác < 3 m -> dính vào
    u = users()
    for f in feats:
        c = f['geometry']['coordinates']
        for i in (0, len(c) - 1):
            if len(u.get(key(c[i]), ())) > 1:
                continue
            best = min(((_m(c[i], w), w, None, 0) for g in feats if g is not f for w in g['geometry']['coordinates']), default=(99, None, None, 0))
            if not 0.05 < best[0] < 3:
                # không có đỉnh gần: thử bám vào thân lối khác (chèn đỉnh mới vào lối đó)
                for g in feats:
                    if g is f:
                        continue
                    gc = g['geometry']['coordinates']
                    for s in range(len(gc) - 1):
                        q, t = _proj(c[i], gc[s], gc[s + 1])
                        if 0 < t < 1 and _m(c[i], q) < best[0]:
                            best = (_m(c[i], q), q, g, s)
            if 0.05 < best[0] < 3:
                if best[2] is not None:
                    best[2]['geometry']['coordinates'].insert(best[3] + 1, list(best[1]))
                log.append(f"{f['properties']['id']}: kéo đầu lối dính vào lối bên cạnh (cách {best[0]:.1f} m)")
                c[i] = list(best[1])
                u = users()

    # 2 + 3. lối tự quay ngược / mũi nhọn ở nút chung
    for f in feats:
        c = f['geometry']['coordinates']
        changed = True
        while changed:
            changed = False
            u = users()
            for i in range(1, len(c) - 1):
                t = _turn(c[i - 1], c[i], c[i + 1])
                if t <= 120:
                    continue
                shared = len(u.get(key(c[i]), ())) > 1
                # thử đổi chỗ với đỉnh kế tiếp (hai nút bị đảo thứ tự)
                if i + 2 < len(c):
                    d = c[:i] + [c[i + 1], c[i]] + c[i + 2:]
                    if max(_turn(d[k - 1], d[k], d[k + 1]) for k in range(1, len(d) - 1)) < 100:
                        c[:] = d
                        log.append(f"{f['properties']['id']}: sắp lại thứ tự 2 đỉnh bị đảo")
                        changed = True
                        break
                if not shared and t > 150:
                    del c[i]
                    log.append(f"{f['properties']['id']}: bỏ đỉnh làm lối quay ngược")
                    changed = True
                    break
                if shared and t > 120:
                    # nút chung bị kéo lệch: nắn lối này thẳng lại, các lối kia nối vào bằng đoạn ngắn
                    j, _ = _proj(c[i], c[i - 1], c[i + 1])
                    if _m(c[i], j) < 0.3:
                        continue
                    spike = c[i]
                    c[i] = j
                    for g in feats:
                        if g is f:
                            continue
                        gc = g['geometry']['coordinates']
                        if key(gc[-1]) == key(spike):
                            gc.append(list(j))
                        elif key(gc[0]) == key(spike):
                            gc.insert(0, list(j))
                    log.append(f"{f['properties']['id']}: nắn mũi nhọn {_m(spike, j):.1f} m ở nút chung")
                    changed = True
                    break

    # 4. hai lối rời một nút gần như cùng hướng (chồng nhau): dời chỗ nối về điểm tách
    u = users()
    for f in feats:
        c = f['geometry']['coordinates']
        for end, nb in ((len(c) - 1, len(c) - 2), (0, 1)):
            node = c[end]
            for g in feats:
                if g is f:
                    continue
                gc = g['geometry']['coordinates']
                for k, w in enumerate(gc):
                    if key(w) != key(node):
                        continue
                    for kn in (k - 1, k + 1):
                        if not 0 <= kn < len(gc):
                            continue
                        if (_angle(_vec(node, c[nb]), _vec(node, gc[kn])) < 20 and _m(node, gc[kn]) < min(8, _m(node, c[nb]))
                                and _proj(gc[kn], node, c[nb])[1] > 0):  # chồng một đoạn ngắn (< 8 m), điểm tách nằm trên lối f
                            c[end] = list(gc[kn])
                            log.append(f"{f['properties']['id']}: chồng lên {g['properties']['id']}, dời chỗ nối {_m(node, gc[kn]):.1f} m về điểm tách")
                            break
    return log


def _remember_deleted_links(old, new):
    """Ghi lại các lối gapfix_* có trong bản cũ nhưng người dùng đã xóa ở bản mới."""
    kept = {f['properties'].get('id') for f in new['features']}
    gone = [[c[:2] for c in f['geometry']['coordinates'][::len(f['geometry']['coordinates']) - 1]]
            for f in old['features'] if str(f['properties'].get('id', '')).startswith('gapfix_')
            and f['properties'].get('id') not in kept]
    if gone:
        saved = json.loads(NOLINK.read_text(encoding='utf-8')) if NOLINK.exists() else []
        NOLINK.write_text(json.dumps(saved + gone, indent=1) + '\n', encoding='utf-8')
        print(f'apply: {len(gone)} lối nối tự động đã bị xóa, sẽ không tự nối lại ({NOLINK.relative_to(ROOT)})')


def _blocked(link, tol=4.0):
    """Lối nối đề xuất trùng (hai đầu cách < tol m) một lối nối người dùng đã xóa."""
    if not NOLINK.exists():
        return False
    a, b = link['coords'][0], link['coords'][-1]
    return any((haversine_m(a, p) < tol and haversine_m(b, q) < tol) or (haversine_m(a, q) < tol and haversine_m(b, p) < tol)
               for p, q in json.loads(NOLINK.read_text(encoding='utf-8')))


def _gap_links():
    """Nối cặp nút cách < 25 m nhưng phải đi vòng > 2,5 lần (không có tòa chắn). Cần CSDL đã nạp dữ liệu hiện tại."""
    sql = (ROOT / 'database' / 'paths_tool_gaps.sql').read_text(encoding='utf-8')
    res = subprocess.run(PSQL + ['-q', '-At', '-c', sql], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if res.returncode:
        sys.exit(res.stderr)
    return json.loads(res.stdout or '[]')


def fix():
    data = json.loads(GEOJSON.read_text(encoding='utf-8'))
    # sửa hình dạng trên sa bàn (đúng thứ người dùng thấy), rồi đổi về CSDL
    view_feats, back = _view_features(data['features'])
    log = _geometry_fixes(view_feats)
    data['features'] = _to_db_features(view_feats, back)
    with GEOJSON.open('w', encoding='utf-8', newline='\n') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    sync()
    reload()
    links = [l for l in _gap_links() if not _blocked(l)]
    if links:
        data = json.loads(GEOJSON.read_text(encoding='utf-8'))
        used = {f['properties'].get('id') for f in data['features']}
        for l in links:
            n = 1
            while f'gapfix_{n}' in used:
                n += 1
            used.add(f'gapfix_{n}')
            data['features'].append({'type': 'Feature', 'properties': {
                'id': f'gapfix_{n}', 'path_type': 'Walkway', 'floor_from': 1, 'floor_to': 1, 'length_m': l['d'],
                'highway': 'footway', 'name': None, 'source': 'manual', 'verified': False,
                'source_ref': 'paths_tool fix: nối chỗ hở (gần nhau nhưng phải đi vòng > 2,5 lần)'},
                'geometry': {'type': 'LineString', 'coordinates': [[round(c[0], 7), round(c[1], 7), 0.0] for c in l['coords']]}})
            log.append(f"gapfix_{n}: nối chỗ hở {l['d']} m")
        with GEOJSON.open('w', encoding='utf-8', newline='\n') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
            fh.write('\n')
        sync()
        reload()
    print('fix:', 'không có gì cần sửa' if not log else '\n  ' + '\n  '.join(log))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    cmds = sys.argv[1:] or ['sync']
    for cmd in cmds:
        {'apply': apply, 'sync': sync, 'reload': reload, 'issues': issues, 'fix': fix}.get(
            cmd, lambda: sys.exit(f'lệnh không hợp lệ: {cmd}'))()
