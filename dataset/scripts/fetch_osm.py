#!/usr/bin/env python3
"""Lấy footprint tòa nhà và POI quanh UIT từ OpenStreetMap (Overpass API).

Chỉ dùng thư viện chuẩn của Python 3. Chạy trên máy có Internet:

    python3 fetch_osm.py --lat 10.8700 --lon 106.8030 --radius 500 --out ../02_buildings

Tâm (lat, lon) mặc định chỉ là vị trí GẦN ĐÚNG của UIT, chưa được kiểm chứng.
Hãy mở kết quả trong QGIS, đối chiếu với ảnh vệ tinh rồi chỉnh --lat/--lon/--radius
hoặc lọc lại theo ranh UIT. Vùng bán kính có thể lẫn tòa nhà của trường lân cận.

Dữ liệu (c) OpenStreetMap contributors, giấy phép ODbL: bắt buộc ghi nguồn.
"""
import argparse
import csv
import json
import math
import os
import urllib.parse
import urllib.request

OVERPASS = "https://overpass-api.de/api/interpreter"
POI_AMENITIES = (
    "atm|bank|canteen|cafe|restaurant|fast_food|food_court|"
    "parking|bicycle_parking|motorcycle_parking|drinking_water"
)


def q_buildings(lat, lon, radius):
    return (
        "[out:json][timeout:90];"
        f'way["building"](around:{radius},{lat},{lon});'
        "out tags geom;"
    )


def q_poi(lat, lon, radius):
    flt = f'["amenity"~"^({POI_AMENITIES})$"](around:{radius},{lat},{lon})'
    return (
        "[out:json][timeout:90];"
        f"(node{flt};way{flt};);"
        "out tags geom;"
    )


def run_query(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(
        OVERPASS, data=data, headers={"User-Agent": "uit-campus-survey/1.0"}
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)["elements"]


def geom_points(el):
    if el["type"] == "node":
        return [(el["lat"], el["lon"])]
    return [(p["lat"], p["lon"]) for p in el.get("geometry", [])]


def bbox_center(pts):
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    return (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2


def area_m2(pts):
    """Diện tích đa giác (m2) bằng shoelace trên phép chiếu phẳng cục bộ."""
    if len(pts) < 4:
        return 0.0
    lat0 = sum(p[0] for p in pts) / len(pts)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    xy = [(lon * kx, lat * ky) for lat, lon in pts]
    s = 0.0
    for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]):
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def building_rows(elements, lat0, lon0):
    rows, feats = [], []
    for el in elements:
        pts = geom_points(el)
        if not pts:
            continue
        tags = el.get("tags", {})
        clat, clon = bbox_center(pts)
        rows.append({
            "osm_id": el["id"],
            "name": tags.get("name", ""),
            "building": tags.get("building", ""),
            "building_levels": tags.get("building:levels", ""),
            "height_m": tags.get("height", ""),
            "addr": tags.get("addr:full", tags.get("addr:street", "")),
            "lat_center": round(clat, 7),
            "lon_center": round(clon, 7),
            "area_m2": round(area_m2(pts), 1),
            "dist_from_center_m": round(haversine_m(lat0, lon0, clat, clon), 1),
        })
        ring = [[lon, lat] for lat, lon in pts]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        feats.append({
            "type": "Feature",
            "properties": dict(tags, osm_id=el["id"]),
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
    return rows, {"type": "FeatureCollection", "features": feats}


def poi_rows(elements, lat0, lon0):
    rows = []
    for el in elements:
        pts = geom_points(el)
        if not pts:
            continue
        tags = el.get("tags", {})
        clat, clon = bbox_center(pts)
        rows.append({
            "osm_type": el["type"],
            "osm_id": el["id"],
            "amenity": tags.get("amenity", ""),
            "name": tags.get("name", ""),
            "operator": tags.get("operator", ""),
            "lat": round(clat, 7),
            "lon": round(clon, 7),
            "dist_from_center_m": round(haversine_m(lat0, lon0, clat, clon), 1),
        })
    return rows


def write_csv(path, rows):
    if not rows:
        print(f"Không có dữ liệu để ghi: {path}")
        return
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Đã ghi {len(rows)} dòng -> {path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--lat", type=float, default=10.8700, help="vĩ độ tâm (gần đúng)")
    ap.add_argument("--lon", type=float, default=106.8030, help="kinh độ tâm (gần đúng)")
    ap.add_argument("--radius", type=int, default=500, help="bán kính tìm kiếm (m)")
    ap.add_argument("--out", default=".", help="thư mục xuất")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    b_rows, geojson = building_rows(run_query(q_buildings(a.lat, a.lon, a.radius)), a.lat, a.lon)
    write_csv(os.path.join(a.out, "buildings_osm.csv"), b_rows)
    with open(os.path.join(a.out, "buildings_osm.geojson"), "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    p_rows = poi_rows(run_query(q_poi(a.lat, a.lon, a.radius)), a.lat, a.lon)
    write_csv(os.path.join(a.out, "poi_osm.csv"), p_rows)


if __name__ == "__main__":
    main()
