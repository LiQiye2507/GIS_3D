"""Tách các sân thể thao từ model 3D uit_campus_full.glb -> dataset/sports_fields.geojson.

Sân không có vật liệu riêng: mặt sân dùng chung texture bảng màu với tường. Cách nhận diện:
  - tam giác nằm ngang (pháp tuyến gần trục z), thấp hơn 3 m;
  - màu texture tại tâm UV có độ bão hòa > 0.25, không phải màu cỏ (hue 0.15-0.45);
  - gộp các tam giác, đóng khe 0.3 m, giữ vùng 100-500 m² gần như chữ nhật (lấp đầy >= 90%
    hình chữ nhật bao nhỏ nhất). Vỉa hè/bãi xe cùng màu bị loại vì quá lớn hoặc không chữ nhật.
Tọa độ quy đổi bằng phép T đã fit ở 04_align_gis_to_model.py (đọc Models_3D/align_report.json,
chạy `04_align_gis_to_model.py --check` trước). Loại sân chưa xác định nên để null.
"""
from __future__ import annotations

import colorsys
import importlib.util
import io
import json
import struct
import sys
from pathlib import Path

import numpy as np
import shapely
from PIL import Image
from shapely.geometry import mapping, shape
from shapely.geometry.polygon import orient

_spec = importlib.util.spec_from_file_location('align', Path(__file__).with_name('04_align_gis_to_model.py'))
al = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(al)

OUT = al.ROOT / 'dataset' / 'sports_fields.geojson'
_NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def colored_triangles(path: Path):
    """Mọi tam giác của model (hệ mét Blender) kèm màu base color tại tâm UV."""
    raw = path.read_bytes()
    jlen = struct.unpack_from('<I', raw, 12)[0]
    g = json.loads(raw[20:20 + jlen])
    bin0 = 20 + jlen + 8

    def accessor(i):
        a = g['accessors'][i]
        v = g['bufferViews'][a['bufferView']]
        nc, dt = _NCOMP[a['type']], np.dtype(al._CT[a['componentType']])
        off = bin0 + v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.ndarray((a['count'], nc), dt, raw, off, (v.get('byteStride') or dt.itemsize * nc, dt.itemsize)).astype(float)

    images = {}

    def image(tex):
        src = tex.get('source', tex.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
        if src not in images:
            bv = g['bufferViews'][g['images'][src]['bufferView']]
            off = bin0 + bv.get('byteOffset', 0)
            images[src] = np.asarray(Image.open(io.BytesIO(raw[off:off + bv['byteLength']])).convert('RGB')) / 255
        return images[src]

    tris, cols = [], []

    def walk(i, parent):
        n = g['nodes'][i]
        world = parent @ al._node_matrix(n)
        for p in g['meshes'][n['mesh']]['primitives'] if 'mesh' in n else []:
            pbr = g['materials'][p.get('material', 0)].get('pbrMetallicRoughness', {})
            factor = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3])
            pos = accessor(p['attributes']['POSITION'])
            idx = accessor(p['indices']).astype(int).reshape(-1, 3)
            t = (np.c_[pos, np.ones(len(pos))] @ world.T)[idx, :3]
            tris.append(np.stack([t[..., 0], -t[..., 2], t[..., 1]], axis=-1))
            tex = pbr.get('baseColorTexture')
            if tex is None:
                cols.append(np.tile(factor, (len(idx), 1)))
                continue
            img = image(g['textures'][tex['index']])
            uv = accessor(p['attributes'][f"TEXCOORD_{tex.get('texCoord', 0)}"])[idx].mean(axis=1) % 1
            h, w, _ = img.shape
            cols.append(img[(uv[:, 1] * (h - 1)).astype(int), (uv[:, 0] * (w - 1)).astype(int)] * factor)
        for c in n.get('children', []):
            walk(c, world)

    for i in g['scenes'][g.get('scene', 0)]['nodes']:
        walk(i, np.eye(4))
    return np.concatenate(tris), np.concatenate(cols)


def court_polygons(tris, cols):
    a, b = tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]
    nrm = np.cross(a, b)
    area2 = np.linalg.norm(nrm, axis=1)
    hsv = np.array([colorsys.rgb_to_hsv(*c) for c in np.clip(cols, 0, 1)])
    keep = ((area2 > 1e-5) & (np.abs(nrm[:, 2]) > 0.9 * area2) & (tris[:, :, 2].max(axis=1) < 3)
            & (hsv[:, 1] > 0.25) & (hsv[:, 2] > 0.3) & ~((hsv[:, 0] > 0.15) & (hsv[:, 0] < 0.45)))
    xy = tris[keep][:, :, :2]
    union = shapely.union_all(shapely.polygons(np.concatenate([xy, xy[:, :1]], axis=1))).buffer(0.3).buffer(-0.3)
    courts = [p for p in getattr(union, 'geoms', [union])
              if 100 <= p.area <= 500 and p.area >= 0.9 * p.minimum_rotated_rectangle.area]
    return sorted((orient(shapely.Polygon(p.exterior).simplify(0.2), 1.0) for p in courts),
                  key=lambda p: (-round(p.centroid.y), p.centroid.x))


def main():
    t = json.loads(al.REPORT.read_text(encoding='utf-8'))['T']
    T = (t['scale'], t['theta_rad'], t['tx'], t['ty'])
    courts = court_polygons(*colored_triangles(al.GLB))
    feats = []
    for i, p in enumerate(courts, 1):
        geo = al.enu_to_lnglat(al.apply_T(T, p))
        feats.append({'type': 'Feature', 'properties': {
            'id': f'SF{i:02d}', 'name': f'Sân thể thao {i}', 'sport_type': None,
            'area_m2': round(al.apply_T(T, p).area, 1), 'source': 'model',
            'source_ref': 'Models_3D/uit_campus_full.glb (mặt sân)', 'verified': False,
            'provisional': True,  # TODO: kiểm chứng thực địa loại sân và vị trí
        }, 'geometry': {'type': 'Polygon', 'coordinates': al._round_coords(json.loads(json.dumps(mapping(geo)))['coordinates'])}})
    fc = {'type': 'FeatureCollection', 'name': 'sports_fields',
          'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'}}, 'features': feats}

    # tự kiểm tra: polygon hợp lệ, không chồng lên tòa nhà nào
    buildings = [shape(f['geometry']) for f in json.loads((al.ROOT / 'dataset/buildings.geojson').read_text(encoding='utf-8'))['features']]
    for f in feats:
        g = shape(f['geometry'])
        assert g.is_valid and g.exterior.is_ccw, f['properties']['id']
        assert not any(g.intersects(b) for b in buildings), f['properties']['id']
    OUT.write_bytes(al.dump_fc(fc))
    for f in feats:
        print(f['properties']['id'], f['properties']['area_m2'], 'm2', shape(f['geometry']).centroid.coords[0])


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
