#!/usr/bin/env python3
"""Sinh mô hình vỏ 3D (.glb) cho Tòa A từ footprint GeoJSON."""

import json
import math
import os
import sys
import numpy as np
import trimesh
from shapely.geometry import Polygon

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GEOJSON_PATH = os.path.join(ROOT_DIR, "dataset", "processed", "uit_buildings_draft.geojson")
OUT_GLB_PATH = os.path.join(ROOT_DIR, "frontend", "models", "building_a.glb")

FLOOR_COUNT = 3
FLOOR_HEIGHT = 3.8
BODY_HEIGHT = FLOOR_COUNT * FLOOR_HEIGHT  # 11.4 m
PARAPET_HEIGHT = 1.0
ROOF_THICKNESS = 0.1
WALL_INSET = 0.3


def hex_to_rgba(hex_color: str) -> list[int]:
    h = hex_color.lstrip("#")
    return [int(h[i : i + 2], 16) for i in (0, 2, 4)] + [255]


def make_extruded_part(poly: Polygon, height: float, z_base: float, hex_color: str) -> trimesh.Trimesh:
    mesh = trimesh.creation.extrude_polygon(poly, height=height)
    if z_base:
        mesh.apply_translation([0.0, 0.0, z_base])
    rgba = hex_to_rgba(hex_color)
    mesh.visual.face_colors = rgba
    # Đặt cả vertex_colors để xuất glTF trực tiếp không phụ thuộc scipy
    mesh.visual.vertex_colors = rgba
    return mesh


def load_building_a_footprint() -> Polygon:
    with open(GEOJSON_PATH, "r", encoding="utf-8") as f:
        features = json.load(f).get("features", [])
    feat = next((ft for ft in features if ft.get("properties", {}).get("building_code") == "A"), None)
    if feat is None:
        raise ValueError("Không tìm thấy Tòa A (building_code == 'A') trong GeoJSON")

    outer = feat["geometry"]["coordinates"][0]
    lng0 = min(pt[0] for pt in outer)
    lat0 = min(pt[1] for pt in outer)
    cos_lat0 = math.cos(math.radians(lat0))

    # shortcut: xấp xỉ phẳng EPSG:4326 -> mét (sai số < 0.1 m ở quy mô 100 m), nâng cấp dùng pyproj nếu mở rộng toàn khu
    local_pts = [
        ((lng - lng0) * 111320.0 * cos_lat0, (lat - lat0) * 110574.0)
        for lng, lat in outer
    ]
    return Polygon(local_pts)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    footprint = load_building_a_footprint()
    inset = footprint.buffer(-WALL_INSET)
    parapet = footprint - inset

    body = make_extruded_part(footprint, BODY_HEIGHT, 0.0, "#E8D5B7")
    parapet_mesh = make_extruded_part(parapet, PARAPET_HEIGHT, BODY_HEIGHT, "#B45309")
    roof = make_extruded_part(inset, ROOF_THICKNESS, BODY_HEIGHT, "#9CA3AF")

    combined = trimesh.util.concatenate([body, parapet_mesh, roof])

    # Đổi hệ trục z-up -> glTF y-up: (x, y, z) -> (x, z, -y) (x Đông, y lên, z Nam)
    z_up_to_gltf = np.array([
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, -1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ])
    combined.apply_transform(z_up_to_gltf)

    extents = combined.extents
    assert 12.3 <= extents[1] <= 12.5, f"Chiều cao trục y bất thường: {extents[1]:.3f}"
    assert 50.0 <= extents[0] <= 100.0 and 50.0 <= extents[2] <= 100.0, (
        f"Kích thước ngang (x, z) ngoài [50, 100] m: {extents[0]:.2f}, {extents[2]:.2f}"
    )

    os.makedirs(os.path.dirname(OUT_GLB_PATH), exist_ok=True)
    combined.export(OUT_GLB_PATH)
    size_kb = os.path.getsize(OUT_GLB_PATH) / 1024.0
    print(f"BBox (x, y, z) m: {[round(float(v), 2) for v in extents]}")
    print(f"Dung lượng file: {size_kb:.1f} KB ({OUT_GLB_PATH})")


if __name__ == "__main__":
    main()
