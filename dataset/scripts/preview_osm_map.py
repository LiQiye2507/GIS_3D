#!/usr/bin/env python3
"""Vẽ ảnh đối chiếu ranh giới, tòa nhà, lối đi và POI UIT từ OpenStreetMap."""
import json
import os
from PIL import Image, ImageDraw

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> None:
    proc_dir = os.path.join(BASE_DIR, "processed")
    c_fc = json.load(open(os.path.join(proc_dir, "uit_campus_boundary.geojson"), encoding="utf-8"))
    b_fc = json.load(open(os.path.join(proc_dir, "uit_buildings_osm_filtered.geojson"), encoding="utf-8"))
    uit = c_fc["features"][0]

    ring = uit["geometry"]["coordinates"][0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    min_lon, max_lon = min(lons) - 0.00025, max(lons) + 0.00025
    min_lat, max_lat = min(lats) - 0.00025, max(lats) + 0.00025

    W, H = 1200, 1100

    def proj(lon: float, lat: float) -> tuple[float, float]:
        x = (lon - min_lon) / (max_lon - min_lon) * (W - 80) + 40
        y = H - ((lat - min_lat) / (max_lat - min_lat) * (H - 80) + 40)
        return x, y

    im = Image.new("RGB", (W, H), (248, 250, 252))
    draw = ImageDraw.Draw(im)

    # 1. Ranh UIT
    draw.polygon([proj(p[0], p[1]) for p in ring], outline=(22, 163, 74), fill=(240, 253, 244), width=3)

    # 2. Lối đi trong/sát UIT
    paths_path = os.path.join(proc_dir, "uit_paths_osm_filtered.geojson")
    if os.path.exists(paths_path):
        w_fc = json.load(open(paths_path, encoding="utf-8"))
        for f in w_fc["features"]:
            hw = f["properties"].get("highway", "")
            col = (59, 130, 246) if hw == "footway" else (100, 116, 139)
            pts = [proj(pt[0], pt[1]) for pt in f["geometry"]["coordinates"]]
            draw.line(pts, fill=col, width=2 if hw == "footway" else 3)

    # 3. Tòa nhà UIT
    for f in b_fc["features"]:
        p = f["properties"]
        b_xy = [proj(pt[0], pt[1]) for pt in f["geometry"]["coordinates"][0]]
        name = p.get("name") or ""
        lbl = f"{name or p['osm_id']} (L={p.get('building:levels','') or '?'})"
        color = (191, 219, 254) if name else (254, 215, 170)
        draw.polygon(b_xy, outline=(30, 64, 175), fill=color, width=2)
        cx, cy = proj(p["lon_center"], p["lat_center"])
        draw.text((cx - 35, cy - 6), lbl, fill=(15, 23, 42))

    # 4. POI, cổng, lối vào, sân thể thao
    poi_path = os.path.join(proc_dir, "uit_poi_osm_filtered.geojson")
    if os.path.exists(poi_path):
        p_fc = json.load(open(poi_path, encoding="utf-8"))
        for f in p_fc["features"]:
            p = f["properties"]
            lon, lat = f["geometry"]["coordinates"]
            x, y = proj(lon, lat)
            cat = p.get("category", "")
            if cat == "entrance":
                col = (220, 38, 38)
                r = 5
            elif cat == "gate":
                col = (147, 51, 234)
                r = 7
            elif cat == "pitch":
                col = (16, 185, 129)
                r = 7
            else:
                col = (234, 88, 12)
                r = 6
            draw.ellipse((x - r, y - r, x + r, y + r), fill=col, outline=(255, 255, 255))
            lbl = p.get("name") or cat
            draw.text((x + 7, y - 6), str(lbl), fill=col)

    out_png = os.path.join(proc_dir, "osm_uit_preview.png")
    im.save(out_png)
    print(f"Saved preview -> {out_png}")


if __name__ == "__main__":
    main()
