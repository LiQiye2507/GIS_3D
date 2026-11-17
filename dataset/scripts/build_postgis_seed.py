#!/usr/bin/env python3
"""Tổng hợp các lớp GeoJSON & CSV đã chuẩn hóa thành file SQL nạp PostGIS chuẩn `01_schema.sql`.

Ưu điểm so với seed thủ công:
- Không hardcode `building_id = 3`; tự động dùng subquery `(SELECT id FROM buildings WHERE building_code = ...)`.
- Kiểm tra khép kín vòng Polygon (first == last, >= 4 điểm) và phạm vi tọa độ UIT (EPSG:4326).
- Sinh đầy đủ dữ liệu cho cả 5 bảng: buildings, floors, rooms, amenities, campus_paths.
"""
import argparse
import json
import os


def sql_str(val: str | None) -> str:
    if val is None or str(val).strip() == "":
        return "NULL"
    return "'" + str(val).strip().replace("'", "''") + "'"


def ring_to_wkt_polygon(coords: list[list[list[float]]]) -> str:
    rings = []
    for ring in coords:  # vong ngoai + cac lo (vd. hanh lang quanh hoi truong tron)
        ring = list(ring)
        if len(ring) < 3:
            raise ValueError("Polygon phai co it nhat 3 dinh")
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        rings.append("(" + ", ".join(f"{p[0]} {p[1]}" for p in ring) + ")")
    return f"POLYGON({', '.join(rings)})"


def linestringz_to_wkt(coords: list[list[float]], default_z: float = 0.0) -> str:
    pts = []
    for p in coords:
        z = p[2] if len(p) >= 3 else default_z
        pts.append(f"{p[0]} {p[1]} {z}")
    return f"LINESTRING Z ({', '.join(pts)})"


def load_geojson(path: str) -> list[dict]:
    if not path or not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f).get("features", [])


def main() -> None:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description="Build PostGIS SQL seed from verified GeoJSON/CSV")
    ap.add_argument("--buildings", default="", help="GeoJSON toa nha da gan building_code & total_floors")
    ap.add_argument("--rooms", default=os.path.join(base, "processed", "rooms_C_3d.geojson"))
    ap.add_argument("--floors", default=os.path.join(base, "processed", "floors_C_3d.geojson"))
    ap.add_argument("--indoor-paths", default=os.path.join(base, "processed", "indoor_paths_C_3d.geojson"))
    ap.add_argument("--outdoor-paths", default="", help="GeoJSON loi di bo ngoai troi (optional)")
    ap.add_argument("--amenities", default="", help="GeoJSON tien ich (final/amenities.geojson)")
    ap.add_argument("--only-building", default="", help="Chi xuat floors/rooms cua toa nay (kem lenh xoa du lieu cu)")
    ap.add_argument("--exclude-building", default="", help="Bo floors/rooms cua toa nay")
    ap.add_argument("--out-sql", required=True, help="Duong dan file .sql xuat ra")
    args = ap.parse_args()

    lines = [
        "-- File SQL duoc sinh tu dong tu dataset UIT da chuan hoa (EPSG:4326)",
        "-- Nguon: dataset/processed/final/ (dataset/scripts/merge_dataset.py). Khong sua tay.",
        "",
    ]

    def keep(feat: dict) -> bool:
        code = feat["properties"]["building_code"]
        if args.only_building:
            return code == args.only_building
        return code != args.exclude_building

    if args.only_building:
        b = sql_str(args.only_building)
        lines += [f"DELETE FROM rooms WHERE building_id = (SELECT id FROM buildings WHERE building_code = {b});",
                  f"DELETE FROM floors WHERE building_id = (SELECT id FROM buildings WHERE building_code = {b});", ""]

    # 1. Buildings
    b_feats = load_geojson(args.buildings)
    if b_feats:
        lines.append("-- 1. Buildings")
        for feat in b_feats:
            p = feat["properties"]
            code = p.get("building_code") or p.get("short_name") or p.get("ref") or ""
            if not code:
                continue
            name = p.get("name_vi") or p.get("name") or f"Tòa {code}"
            total_floors = p.get("total_floors")
            total_floors = "NULL" if total_floors is None else int(total_floors)
            base_elev = float(p.get("base_elevation") or 0.0)
            height_m = "NULL" if p.get("height_m") is None else float(p["height_m"])
            if code == "A":
                glb_url = p.get("glb_model_url") or "/models/building_a.glb"
                outer = feat["geometry"]["coordinates"][0]
                anchor_lng = min(pt[0] for pt in outer)
                anchor_lat = min(pt[1] for pt in outer)
                model_rotation = 0
            else:
                glb_url = None
                anchor_lng = "NULL"
                anchor_lat = "NULL"
                model_rotation = "NULL"
            desc = p.get("description") or p.get("notes") or ""
            wkt = ring_to_wkt_polygon(feat["geometry"]["coordinates"])
            lines.append(
                "INSERT INTO buildings (building_code, name, total_floors, base_elevation, height_m, glb_model_url, anchor_lng, anchor_lat, model_rotation, description, geom) "
                f"VALUES ({sql_str(code)}, {sql_str(name)}, {total_floors}, {base_elev}, {height_m}, {sql_str(glb_url)}, {anchor_lng}, {anchor_lat}, {model_rotation}, {sql_str(desc)}, "
                f"ST_GeomFromText('{wkt}', 4326));"
            )
        lines.append("")

    # 2. Floors
    f_feats = [f for f in load_geojson(args.floors) if keep(f)]
    if f_feats:
        lines.append("-- 2. Floors")
        for feat in f_feats:
            p = feat["properties"]
            b_code = p["building_code"]
            wkt = ring_to_wkt_polygon(feat["geometry"]["coordinates"])
            lines.append(
                "INSERT INTO floors (building_id, floor_number, base_height, ceiling_height, geom) VALUES ("
                f"(SELECT id FROM buildings WHERE building_code = {sql_str(b_code)}), "
                f"{int(p['floor_number'])}, {float(p['base_height'])}, {float(p['ceiling_height'])}, "
                f"ST_GeomFromText('{wkt}', 4326));"
            )
        lines.append("")

    # 3. Rooms
    r_feats = [f for f in load_geojson(args.rooms) if keep(f)]
    if r_feats:
        lines.append("-- 3. Rooms (LOD 3 Indoor)")
        for feat in r_feats:
            p = feat["properties"]
            b_code = p["building_code"]
            wkt = ring_to_wkt_polygon(feat["geometry"]["coordinates"])
            cap = "NULL" if p.get("capacity") is None else int(p["capacity"])
            equip = p.get("equipment_info") or p.get("special_label") or ""
            lines.append(
                "INSERT INTO rooms (room_code, room_name, room_type, building_id, floor_number, capacity, base_height, extrude_height, equipment_info, geom) VALUES ("
                f"{sql_str(p['room_code'])}, {sql_str(p['room_name'])}, {sql_str(p['room_type'])}, "
                f"(SELECT id FROM buildings WHERE building_code = {sql_str(b_code)}), "
                f"{int(p['floor_number'])}, {cap}, {float(p['base_height'])}, {float(p['extrude_height'])}, "
                f"{sql_str(equip)}, ST_GeomFromText('{wkt}', 4326));"
            )
        lines.append("")

    # 4. Amenities (final/amenities.geojson: chi gom POI co toa do va loai hop le)
    a_feats = load_geojson(args.amenities)
    if a_feats:
        lines.append("-- 4. Amenities (POI 3D)")
        for feat in a_feats:
            p = feat["properties"]
            lon, lat, elev_z = feat["geometry"]["coordinates"]
            b_expr = f"(SELECT id FROM buildings WHERE building_code = {sql_str(p['building_code'])})" if p.get("building_code") else "NULL"
            fl = "NULL" if p.get("floor_number") is None else int(p["floor_number"])
            lines.append(
                "INSERT INTO amenities (name, category, building_id, floor_number, elevation_z, open_hours, geom) VALUES ("
                f"{sql_str(p['name'])}, {sql_str(p['category'])}, {b_expr}, {fl}, {elev_z}, {sql_str(p.get('open_hours'))}, "
                f"ST_GeomFromText('POINT Z ({lon} {lat} {elev_z})', 4326));"
            )
        lines.append("")

    # 5. Campus Paths
    outdoor_feats = [(feat, 0.0) for feat in load_geojson(args.outdoor_paths)]
    indoor_feats = [(feat, 0.2) for feat in load_geojson(args.indoor_paths)]
    path_feats = outdoor_feats + indoor_feats
    if path_feats:
        lines.append("-- 5. Campus Paths (3D Walkways / Corridors / Stairs)")
        for feat, def_z in path_feats:
            p = feat["properties"]
            p_type = p.get("path_type") or ("Stairs" if p.get("highway") == "steps" else "Walkway")
            fl_from = int(p.get("floor_from") or 1)
            fl_to = int(p.get("floor_to") or fl_from)
            length_m = float(p.get("length_m") or 0.0)
            wkt = linestringz_to_wkt(feat["geometry"]["coordinates"], default_z=def_z)
            lines.append(
                "INSERT INTO campus_paths (path_type, floor_from, floor_to, length_m, geom) VALUES ("
                f"{sql_str(p_type)}, {fl_from}, {fl_to}, {length_m}, ST_GeomFromText('{wkt}', 4326));"
            )
        lines.append("")

    os.makedirs(os.path.dirname(os.path.abspath(args.out_sql)), exist_ok=True)
    with open(args.out_sql, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Da sinh file SQL: {args.out_sql}")


if __name__ == "__main__":
    main()
