#!/usr/bin/env python3
"""Lọc toàn bộ các lớp OSM (buildings, paths, poi) nằm trong hoặc sát ranh khuôn viên UIT."""
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UIT_CAMPUS_OSM_ID = 1303838982


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-18) + x1):
            inside = not inside
    return inside


def expand_ring(ring: list[list[float]], margin_deg: float = 0.00018) -> list[list[float]]:
    """Mở rộng nhẹ theo tâm để giữ cả các cổng/đường sát ranh trường (~20m)."""
    cx = sum(p[0] for p in ring[:-1]) / max(len(ring) - 1, 1)
    cy = sum(p[1] for p in ring[:-1]) / max(len(ring) - 1, 1)
    out = []
    for x, y in ring:
        dx, dy = x - cx, y - cy
        d = (dx * dx + dy * dy) ** 0.5 or 1.0
        out.append([x + dx / d * margin_deg, y + dy / d * margin_deg])
    return out


def save_fc(path: str, features: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, indent=2)


def main() -> None:
    osm_b_dir = os.path.join(BASE_DIR, "raw", "osm")
    c_fc = json.load(open(os.path.join(osm_b_dir, "campus_boundary_osm.geojson"), encoding="utf-8"))
    uit = [f for f in c_fc["features"] if f["properties"].get("osm_id") == UIT_CAMPUS_OSM_ID][0]
    poly = uit["geometry"]["coordinates"][0]
    poly_buf = expand_ring(poly, 0.00018)
    out_dir = os.path.join(BASE_DIR, "interim")

    # 1. Campus boundary
    save_fc(os.path.join(out_dir, "uit_campus_boundary.geojson"), [uit])

    # 2. Buildings inside UIT
    b_fc = json.load(open(os.path.join(osm_b_dir, "buildings_osm.geojson"), encoding="utf-8"))
    b_in = [f for f in b_fc["features"] if point_in_ring(f["properties"]["lon_center"], f["properties"]["lat_center"], poly)]
    save_fc(os.path.join(out_dir, "uit_buildings_osm_filtered.geojson"), b_in)

    # 3. Paths intersecting UIT (loại trunk/motorway ngoài xa lộ)
    paths_path = os.path.join(osm_b_dir, "paths_osm.geojson")
    w_in = []
    if os.path.exists(paths_path):
        w_fc = json.load(open(paths_path, encoding="utf-8"))
        for f in w_fc["features"]:
            hw = f["properties"].get("highway", "")
            if hw in ("trunk", "trunk_link", "motorway", "primary", "secondary"):
                continue
            coords = f["geometry"]["coordinates"]
            in_cnt = sum(1 for pt in coords if point_in_ring(pt[0], pt[1], poly_buf))
            if in_cnt >= max(2, len(coords) * 0.5):
                w_in.append(f)
        save_fc(os.path.join(out_dir, "uit_paths_osm_filtered.geojson"), w_in)

    print(f"Filtered UIT OSM -> buildings={len(b_in)}, paths={len(w_in)}")


if __name__ == "__main__":
    main()
