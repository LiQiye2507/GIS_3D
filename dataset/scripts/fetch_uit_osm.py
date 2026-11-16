#!/usr/bin/env python3
"""Thu thập dữ liệu không gian OpenStreetMap quanh khuôn viên UIT (Overpass API).

Lấy đồng thời 4 nhóm lớp Vector chuẩn EPSG:4326:
1. Ranh giới khuôn viên (campus_boundary_osm.geojson)
2. Footprint tòa nhà - bao gồm cả way và relation multipolygon (buildings_osm.geojson, buildings_osm.csv)
3. Mạng lưới đường đi & lối đi bộ (paths_osm.geojson, paths_osm.csv)
4. Tiện ích POI, cổng, sân thể thao (poi_osm.geojson, poi_osm.csv)

Dữ liệu (c) OpenStreetMap contributors (ODbL).
"""
import argparse
import csv
import json
import math
import os
import urllib.parse
import urllib.request

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
POI_AMENITIES = (
    "atm|bank|canteen|cafe|restaurant|fast_food|food_court|"
    "parking|bicycle_parking|motorcycle_parking|drinking_water|toilets|library|clinic"
)


def run_query(query: str) -> list[dict]:
    data = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for url in OVERPASS_ENDPOINTS:
        try:
            req = urllib.request.Request(
                url, data=data, headers={"User-Agent": "uit-campus-gis3d/1.0"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp).get("elements", [])
        except Exception as exc:
            last_err = exc
    raise last_err


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def linestring_length_m(coords: list[list[float]]) -> float:
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        total += haversine_m(lat1, lon1, lat2, lon2)
    return total


def area_m2(pts: list[tuple[float, float]]) -> float:
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


def bbox_center(pts: list[tuple[float, float]]) -> tuple[float, float]:
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    return (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2


def close_ring(ring: list[list[float]]) -> list[list[float]]:
    if ring and ring[0] != ring[-1]:
        return ring + [ring[0]]
    return ring


def stitch_way_segments(segments: list[list[list[float]]]) -> list[list[list[float]]]:
    """Nối các đoạn way thành các ring đóng cho relation multipolygon."""
    pool = [list(seg) for seg in segments if len(seg) >= 2]
    rings = []
    while pool:
        cur = pool.pop(0)
        changed = True
        while changed and cur[0] != cur[-1]:
            changed = False
            for idx, seg in enumerate(pool):
                if cur[-1] == seg[0]:
                    cur.extend(seg[1:])
                    pool.pop(idx)
                    changed = True
                    break
                if cur[-1] == seg[-1]:
                    cur.extend(list(reversed(seg))[1:])
                    pool.pop(idx)
                    changed = True
                    break
                if cur[0] == seg[-1]:
                    cur = seg[:-1] + cur
                    pool.pop(idx)
                    changed = True
                    break
                if cur[0] == seg[0]:
                    cur = list(reversed(seg))[:-1] + cur
                    pool.pop(idx)
                    changed = True
                    break
        if len(cur) >= 3:
            rings.append(close_ring(cur))
    return rings


def element_to_polygon_coords(el: dict) -> tuple[list[list[list[float]]], list[tuple[float, float]]]:
    """Trả về (polygon_rings_lonlat, outer_pts_latlon)."""
    if el["type"] == "way":
        geom = el.get("geometry", [])
        if len(geom) < 3:
            return [], []
        pts = [(p["lat"], p["lon"]) for p in geom]
        ring = close_ring([[p["lon"], p["lat"]] for p in geom])
        return [ring], pts
    if el["type"] == "relation":
        outer_segs, inner_segs = [], []
        for m in el.get("members", []):
            if m.get("type") != "way" or not m.get("geometry"):
                continue
            seg = [[p["lon"], p["lat"]] for p in m["geometry"]]
            if m.get("role") == "inner":
                inner_segs.append(seg)
            else:
                outer_segs.append(seg)
        outers = stitch_way_segments(outer_segs)
        inners = stitch_way_segments(inner_segs)
        if not outers:
            return [], []
        pts = [(c[1], c[0]) for c in outers[0]]
        return outers + inners, pts
    return [], []


def write_csv(path: str, rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not rows:
        print(f"Khong co du lieu de ghi: {path}")
        return
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"Da ghi {len(rows)} dong -> {path}")


def write_geojson(path: str, features: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fc = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)
    print(f"Da ghi {len(features)} features -> {path}")


def fetch_campus_boundary(lat: float, lon: float, radius: int, out_dir: str) -> None:
    q = (
        "[out:json][timeout:90];"
        f'(way["amenity"="university"](around:{radius},{lat},{lon});'
        f'relation["amenity"="university"](around:{radius},{lat},{lon}););'
        "out tags geom;"
    )
    feats = []
    for el in run_query(q):
        coords, pts = element_to_polygon_coords(el)
        if not coords:
            continue
        tags = el.get("tags", {})
        feats.append({
            "type": "Feature",
            "properties": dict(tags, osm_type=el["type"], osm_id=el["id"], area_m2=round(area_m2(pts), 1)),
            "geometry": {"type": "Polygon", "coordinates": coords},
        })
    write_geojson(os.path.join(out_dir, "campus_boundary_osm.geojson"), feats)


def fetch_buildings(lat: float, lon: float, radius: int, out_dir: str) -> None:
    q = (
        "[out:json][timeout:90];"
        f'(way["building"](around:{radius},{lat},{lon});'
        f'relation["building"](around:{radius},{lat},{lon}););'
        "out tags geom;"
    )
    rows, feats = [], []
    for el in run_query(q):
        coords, pts = element_to_polygon_coords(el)
        if not coords or not pts:
            continue
        tags = el.get("tags", {})
        clat, clon = bbox_center(pts)
        area = round(area_m2(pts), 1)
        dist = round(haversine_m(lat, lon, clat, clon), 1)
        rows.append({
            "osm_type": el["type"],
            "osm_id": el["id"],
            "name": tags.get("name", ""),
            "short_name": tags.get("short_name", tags.get("ref", "")),
            "building": tags.get("building", ""),
            "building_levels": tags.get("building:levels", ""),
            "height_m": tags.get("height", ""),
            "lat_center": round(clat, 7),
            "lon_center": round(clon, 7),
            "area_m2": area,
            "dist_from_center_m": dist,
        })
        feats.append({
            "type": "Feature",
            "properties": dict(
                tags,
                osm_type=el["type"],
                osm_id=el["id"],
                lat_center=round(clat, 7),
                lon_center=round(clon, 7),
                area_m2=area,
                dist_from_center_m=dist,
            ),
            "geometry": {"type": "Polygon", "coordinates": coords},
        })
    rows.sort(key=lambda r: r["dist_from_center_m"])
    write_csv(os.path.join(out_dir, "buildings_osm.csv"), rows)
    write_geojson(os.path.join(out_dir, "buildings_osm.geojson"), feats)


def fetch_paths(bbox: tuple[float, float, float, float], out_dir: str) -> None:
    s, w, n, e = bbox
    q = (
        f"[out:json][timeout:60][bbox:{s},{w},{n},{e}];"
        'way["highway"];'
        "out tags geom;"
    )
    rows, feats = [], []
    for el in run_query(q):
        geom = el.get("geometry", [])
        if len(geom) < 2:
            continue
        tags = el.get("tags", {})
        coords = [[p["lon"], p["lat"]] for p in geom]
        length = round(linestring_length_m(coords), 1)
        rows.append({
            "osm_id": el["id"],
            "highway": tags.get("highway", ""),
            "name": tags.get("name", ""),
            "foot": tags.get("foot", ""),
            "surface": tags.get("surface", ""),
            "length_m": length,
            "node_count": len(coords),
        })
        feats.append({
            "type": "Feature",
            "properties": dict(tags, osm_id=el["id"], length_m=length),
            "geometry": {"type": "LineString", "coordinates": coords},
        })
    write_csv(os.path.join(out_dir, "paths_osm.csv"), rows)
    write_geojson(os.path.join(out_dir, "paths_osm.geojson"), feats)


def fetch_pois(bbox: tuple[float, float, float, float], lat: float, lon: float, out_dir: str) -> None:
    s, w, n, e = bbox
    q = (
        f"[out:json][timeout:60][bbox:{s},{w},{n},{e}];"
        "("
        f'node["amenity"~"^({POI_AMENITIES})$"];'
        f'way["amenity"~"^({POI_AMENITIES})$"];'
        'node["barrier"="gate"];way["barrier"="gate"];'
        'node["entrance"];'
        'node["leisure"~"^(pitch|sports_centre|stadium)$"];'
        'way["leisure"~"^(pitch|sports_centre|stadium)$"];'
        ");"
        "out tags geom;"
    )
    rows, feats = [], []
    seen = set()
    for el in run_query(q):
        key = (el["type"], el["id"])
        if key in seen:
            continue
        seen.add(key)
        if el["type"] == "node":
            pts = [(el["lat"], el["lon"])]
        else:
            pts = [(p["lat"], p["lon"]) for p in el.get("geometry", [])]
        if not pts:
            continue
        tags = el.get("tags", {})
        clat, clon = bbox_center(pts)
        category = (
            tags.get("amenity")
            or tags.get("leisure")
            or tags.get("barrier")
            or ("entrance" if "entrance" in tags else "")
        )
        dist = round(haversine_m(lat, lon, clat, clon), 1)
        rows.append({
            "osm_type": el["type"],
            "osm_id": el["id"],
            "category": category,
            "name": tags.get("name", ""),
            "operator": tags.get("operator", ""),
            "lat": round(clat, 7),
            "lon": round(clon, 7),
            "dist_from_center_m": dist,
        })
        feats.append({
            "type": "Feature",
            "properties": dict(tags, osm_type=el["type"], osm_id=el["id"], category=category, dist_from_center_m=dist),
            "geometry": {"type": "Point", "coordinates": [round(clon, 7), round(clat, 7)]},
        })
    rows.sort(key=lambda r: r["dist_from_center_m"])
    write_csv(os.path.join(out_dir, "poi_osm.csv"), rows)
    write_geojson(os.path.join(out_dir, "poi_osm.geojson"), feats)


def main() -> None:
    ap = argparse.ArgumentParser(description="Fetch OSM layers around UIT")
    ap.add_argument("--lat", type=float, default=10.8700)
    ap.add_argument("--lon", type=float, default=106.8030)
    ap.add_argument("--radius", type=int, default=450)
    ap.add_argument("--only-poi-paths", action="store_true")
    ap.add_argument("--base", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    args = ap.parse_args()

    # Bbox rộng hơn ranh giới UIT ~100m mỗi phía
    bbox = (10.8675, 106.8008, 10.8725, 106.8060)
    if not args.only_poi_paths:
        fetch_campus_boundary(args.lat, args.lon, max(args.radius, 600), os.path.join(args.base, "02_buildings", "osm_raw"))
        fetch_buildings(args.lat, args.lon, args.radius, os.path.join(args.base, "02_buildings", "osm_raw"))
    fetch_pois(bbox, args.lat, args.lon, os.path.join(args.base, "04_poi", "osm_raw"))
    fetch_paths(bbox, os.path.join(args.base, "05_paths", "osm_raw"))


if __name__ == "__main__":
    main()
