#!/usr/bin/env python3
"""Gộp mọi nguồn dữ liệu UIT thành một bộ chuẩn duy nhất: dataset/processed/final/.

Chỉ đọc dữ liệu gốc, chạy lại bao nhiêu lần cũng cho cùng kết quả.
Thứ tự ưu tiên nguồn (docs/data-audit.md):
  - Hình học: khảo sát thực địa > OSM > bản nháp provisional
  - Số tầng: xác nhận khảo sát > tài liệu trường > OSM
  - Danh sách/tên phòng: khảo sát (survey_floorplans_template.csv) > tên đọc từ ảnh sơ đồ
Thiếu dữ liệu thì để null và ghi vào merge_report.md, không tự điền.

Chạy: python dataset/scripts/merge_dataset.py
Cần trước đó: python dataset/scripts/model_outline_toa_a.py (đã sinh sẵn processed/toa_A_model_outline.geojson)
"""
import csv
import json
import math
import os
import shutil
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DS = os.path.join(ROOT, "dataset")
OUT = os.path.join(DS, "processed", "final")
FLOOR_H, ROOM_H, CORRIDOR_H = 3.8, 3.5, 0.2
PLAN_HALF = 25.4  # nửa cạnh khối chính trong toa_A_layout_digitized.csv (mét)
UIT_BBOX = (106.800, 10.866, 106.808, 10.874)
ROOM_TYPES = {"Theory", "Lab", "Library", "Office", "Corridor", "Stairs", "WC"}
AMENITY_CATS = {"Canteen", "ATM", "Water", "Parking", "Medical", "FireSafety"}
REQUIRED = {
    "buildings": ["building_code", "name", "total_floors", "height_m"],
    "floors": ["id", "building_code", "floor_number", "base_height", "ceiling_height"],
    "rooms": ["room_code", "building_code", "floor_number", "room_type", "base_height", "extrude_height"],
    "amenities": ["id", "name", "category", "floor_number", "elevation_z"],
    "paths": ["id", "path_type", "floor_from", "floor_to", "length_m"],
    "campus_boundary": ["id", "name"],
}
ID_FIELD = {"buildings": "building_code", "floors": "id", "rooms": "room_code", "amenities": "id",
            "paths": "id", "campus_boundary": "id"}
issues = []  # (lớp, đối tượng, vấn đề) - đưa vào merge_report.md


def p(*parts):
    return os.path.join(DS, *parts)


def read_geojson(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["features"]


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def blank(v):
    return v is None or str(v).strip() == ""


def num(v, cast=float):
    try:
        return None if blank(v) else cast(float(v))
    except ValueError:
        return None


def feature(props, geom):
    return {"type": "Feature", "properties": props, "geometry": geom}


def src(source, ref, verified=False):
    return {"source": source, "source_ref": ref, "verified": verified}


# ---------- Tòa nhà ----------
def build_buildings():
    draft = read_geojson(p("processed", "uit_buildings_draft.geojson"))
    confirmed = {r["building_id"]: r for r in read_csv(p("field_survey", "building_floors_confirmed.csv"))}
    survey = {r["building_id"]: r for r in read_csv(p("field_survey", "survey_buildings_template.csv"))}
    docs = {r["building_id"]: r for r in read_csv(p("02_buildings", "buildings_attributes.csv"))}
    out = []
    for f in draft:
        q = f["properties"]
        code = q["building_code"]
        candidates = [
            (num(confirmed.get(code, {}).get("total_floors"), int), "field_survey/building_floors_confirmed.csv"),
            (num(survey.get(code, {}).get("verified_total_floors"), int), "field_survey/survey_buildings_template.csv"),
            (num(docs.get(code, {}).get("levels_total"), int), "02_buildings/buildings_attributes.csv"),
            (num(survey.get(code, {}).get("osm_levels"), int), f"OSM way {q.get('osm_id')} building:levels"),
        ]
        floors, floors_src = next(((v, s) for v, s in candidates if v), (None, None))
        if floors is None:
            issues.append(("buildings", code, "không có nguồn nào cho số tầng -> total_floors = null"))
        geom_src = "osm" if q.get("osm_id") else "provisional"
        if geom_src == "provisional":
            issues.append(("buildings", code, "footprint tạm (không có trên OSM) - cần số hóa lại trên ảnh vệ tinh"))
        out.append(feature({
            "building_code": code,
            "name": q.get("name_vi") or q.get("name"),
            "total_floors": floors,
            "height_m": round(floors * FLOOR_H, 2) if floors else None,
            "base_elevation": 0.0,
            "description": q.get("notes"),
            "osm_id": q.get("osm_id"),
            "floors_source": floors_src,
            **src(geom_src, f"OSM way {q['osm_id']}" if q.get("osm_id") else "processed/uit_buildings_draft.geojson",
                  verified=code in confirmed),
        }, f["geometry"]))
    return out


# ---------- Tòa A: đặt sơ đồ khảo sát vào khung khối chính lấy từ mô hình ----------
def toa_a_frame():
    outline = {f["properties"]["part"]: f for f in read_geojson(p("processed", "toa_A_model_outline.geojson"))}
    m = outline["main"]["properties"]
    (clng, clat), t = m["fit_center"], math.radians(m["fit_angle_deg"])
    sx, sy = m["fit_half_x_m"] / PLAN_HALF, m["fit_half_y_m"] / PLAN_HALF
    m_lat, m_lng = 110574.0, 111320.0 * math.cos(math.radians(clat))

    def to_lnglat(x, y):
        x, y = x * sx, y * sy
        e, n = x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t)
        return [round(clng + e / m_lng, 8), round(clat + n / m_lat, 8)]
    return outline, to_lnglat


def parse_rings(text, to_lnglat):
    rings = []
    for part in text.split("|"):
        ring = [to_lnglat(*map(float, xy.split())) for xy in part.split(",")]
        rings.append(ring + [ring[0]])
    return rings


def build_floors_and_rooms_a(outline, to_lnglat):
    floors = []
    for n in (1, 2, 3):
        part = "all" if n <= 2 else "main"  # cánh Thư viện chỉ có tầng 1-2
        floors.append(feature({
            "id": f"A-{n}", "building_code": "A", "floor_number": n,
            "base_height": round((n - 1) * FLOOR_H, 2), "ceiling_height": round((n - 1) * FLOOR_H + ROOM_H, 2),
            **src("campus.glb outline", f"processed/toa_A_model_outline.geojson part={part}"),
        }, outline[part]["geometry"]))

    survey = [r for r in read_csv(p("field_survey", "survey_floorplans_template.csv")) if r["building_id"] == "A"]
    by_code = {r["room_code"]: r for r in survey}
    layout = read_csv(p("field_survey", "toa_A_layout_digitized.csv"))
    rooms, used = [], set()
    for r in layout:
        s = by_code.get(r["room_code"]) or by_code.get(r["survey_code"])
        if s:
            used.add(s["room_code"])
            if r["survey_code"]:
                issues.append(("rooms", r["room_code"], f"survey ghi '{r['survey_code']}', ảnh danh sách phòng ghi '{r['room_code']}' -> dùng mã theo ảnh"))
        name = (s and s["room_name"].strip()) or r["room_name_photo"] or None
        rtype = (s and s["room_type"].strip()) or r["room_type"]
        if s and not s["room_name"].strip() and r["room_name_photo"]:
            issues.append(("rooms", r["room_code"], "survey chưa có tên -> lấy tên từ ảnh danh sách phòng"))
        rooms.append(room_feature("A", int(r["floor_number"]), r["room_code"], name, rtype,
                                  num(s and s["capacity"], int), None,
                                  {"type": "Polygon", "coordinates": parse_rings(r["plan_xy"], to_lnglat)},
                                  src("field_survey floorplan (số hóa gần đúng)", f"field_survey/raw/{r['notes'].split(';')[0]}")))
    for code, n in (("A.TV", 1), ("A.TV2", 2)):
        s = by_code[code]
        used.add(code)
        rooms.append(room_feature("A", n, code, s["room_name"], s["room_type"], num(s["capacity"], int), None,
                                  outline["library"]["geometry"],
                                  src("campus.glb outline", "processed/toa_A_model_outline.geojson part=library")))
    for code in sorted(set(by_code) - used):
        issues.append(("rooms", code, "có trong survey nhưng chưa có vị trí trên sơ đồ -> bỏ qua"))
    return floors, rooms


def room_feature(b_code, floor, code, name, rtype, capacity, equipment, geom, source):
    base = round((floor - 1) * FLOOR_H, 2)
    if rtype not in ROOM_TYPES:
        issues.append(("rooms", code, f"room_type '{rtype}' không hợp lệ"))
    return feature({
        "room_code": code, "room_name": name, "room_type": rtype, "building_code": b_code,
        "floor_number": floor, "capacity": capacity, "equipment_info": equipment or None,
        "base_height": base, "extrude_height": round(base + (CORRIDOR_H if rtype == "Corridor" else ROOM_H), 2),
        **source,
    }, geom)


def build_c():
    floors = [feature({
        "id": f"C-{f['properties']['floor_number']}", "building_code": "C",
        "floor_number": f["properties"]["floor_number"],
        "base_height": round((f["properties"]["floor_number"] - 1) * FLOOR_H, 2),
        "ceiling_height": round((f["properties"]["floor_number"] - 1) * FLOOR_H + ROOM_H, 2),
        **src("generated", "processed/floors_C_3d.geojson"),
    }, f["geometry"]) for f in read_geojson(p("processed", "floors_C_3d.geojson"))]
    rooms = []
    for f in read_geojson(p("processed", "rooms_C_3d.geojson")):
        q = f["properties"]
        if q.get("element_type") == "Kho" and q["room_type"] == "WC":
            issues.append(("rooms", q["room_code"], "Kho đang gán room_type 'WC' (enum không có loại Kho)"))
        rooms.append(room_feature("C", q["floor_number"], q["room_code"], q["room_name"], q["room_type"],
                                  q.get("capacity") or None, q.get("special_label"), f["geometry"],
                                  src("generated", "processed/rooms_C_3d.geojson (lưới floorplan_toa_C_layout.csv, footprint C tạm)")))
    return floors, rooms


# ---------- Tiện ích ----------
def build_amenities():
    out = []
    for r in read_csv(p("field_survey", "survey_poi_and_gcp_template.csv")):
        rid = r["id"]
        if r["record_type"] != "POI":
            continue
        if r["category"] not in AMENITY_CATS:
            issues.append(("amenities", rid, f"loại '{r['category']}' ngoài enum amenities -> không đưa vào ({r['name']})"))
            continue
        lat, lon = num(r["lat"]), num(r["lon"])
        if lat is None or lon is None:
            issues.append(("amenities", rid, f"chưa có tọa độ -> không đưa vào ({r['name']})"))
            continue
        floor = num(r["floor_number"], int)
        b_code = r["building_id"].strip() or None
        # Tòa E đánh số tầng G = 0, các tòa khác tầng 1 = mặt đất
        level = floor if b_code == "E" else max((floor or 1) - 1, 0)
        z = round(level * FLOOR_H + 1.0, 2)
        out.append(feature({
            "id": rid, "name": r["name"], "category": r["category"], "building_code": b_code,
            "floor_number": floor, "elevation_z": z, "open_hours": r["open_hours"].strip() or None,
            **src("field_survey", r["coord_source"]),
        }, {"type": "Point", "coordinates": [lon, lat, z]}))
    return out


# ---------- Lối đi & ranh giới ----------
def build_paths():
    out = []
    for f in read_geojson(p("processed", "uit_paths_osm_filtered.geojson")):
        q = f["properties"]
        coords = [[x, y, 0.0] for x, y, *_ in f["geometry"]["coordinates"]]
        out.append(feature({
            "id": f"osm_{q['osm_id']}", "path_type": "Stairs" if q.get("highway") == "steps" else "Walkway",
            "floor_from": 1, "floor_to": 1, "length_m": q.get("length_m"), "highway": q.get("highway"),
            "name": q.get("name"), **src("osm", f"OSM way {q['osm_id']}"),
        }, {"type": "LineString", "coordinates": coords}))
    return out


def build_boundary():
    f = read_geojson(p("processed", "uit_campus_boundary.geojson"))[0]
    q = f["properties"]
    return [feature({"id": "UIT", "name": q["name"], "osm_id": q["osm_id"], **src("osm", f"OSM way {q['osm_id']}")},
                    f["geometry"])]


# ---------- Kiểm tra ----------
def seg_cross(a, b, c, d):
    def o(p1, p2, p3):
        return (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0])
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0


def ring_problems(ring):
    if len(ring) < 4:
        return "vòng < 4 điểm"
    if ring[0][:2] != ring[-1][:2]:
        return "vòng không khép kín"
    segs = list(zip(ring[:-1], ring[1:]))
    for i in range(len(segs)):
        for j in range(i + 2, len(segs)):
            if i == 0 and j == len(segs) - 1:
                continue
            if seg_cross(*segs[i], *segs[j]):
                return f"tự cắt (cạnh {i} và {j})"
    return None


def check(layer, feats):
    errors = []
    ids = Counter(f["properties"].get(ID_FIELD[layer]) for f in feats)
    errors += [f"trùng id {k} ({v} lần)" for k, v in ids.items() if v > 1]
    for f in feats:
        q, g = f["properties"], f["geometry"]
        fid = q.get(ID_FIELD[layer])
        miss = [k for k in REQUIRED[layer] if q.get(k) is None]
        if miss:
            # thiếu dữ liệu thật thì giữ null và báo lại (không coi là lỗi chặn)
            issues.append((layer, fid, "thiếu " + ", ".join(miss)))
        if not g:
            errors.append(f"{fid}: không có hình học")
            continue
        pts = []
        if g["type"] == "Polygon":
            for ring in g["coordinates"]:
                prob = ring_problems(ring)
                if prob:
                    errors.append(f"{fid}: {prob}")
                pts += ring
        elif g["type"] == "LineString":
            pts = g["coordinates"]
            if len(pts) < 2:
                errors.append(f"{fid}: đường < 2 điểm")
        else:
            pts = [g["coordinates"]]
        if any(not (UIT_BBOX[0] <= x[0] <= UIT_BBOX[2] and UIT_BBOX[1] <= x[1] <= UIT_BBOX[3]) for x in pts):
            errors.append(f"{fid}: tọa độ ngoài vùng UIT (sai CRS hoặc đảo lng/lat?)")
    return errors


def main():
    os.makedirs(OUT, exist_ok=True)
    outline, to_lnglat = toa_a_frame()
    a_floors, a_rooms = build_floors_and_rooms_a(outline, to_lnglat)
    c_floors, c_rooms = build_c()
    layers = {
        "buildings": build_buildings(),
        "floors": a_floors + c_floors,
        "rooms": a_rooms + c_rooms,
        "amenities": build_amenities(),
        "paths": build_paths(),
        "campus_boundary": build_boundary(),
    }
    before = {
        "buildings": "6 (processed/uit_buildings_draft.geojson)",
        "floors": "3 C (floors_C_3d) + 3 A (sinh trong 03_toa_a_indoor.sql)",
        "rooms": "67 C (rooms_C_3d) + 59 A trong survey (65 phần tử sinh trong 03_toa_a_indoor.sql)",
        "amenities": "12 POI + 4 GCP (survey_poi_and_gcp_template.csv)",
        "paths": "33 (processed/uit_paths_osm_filtered.geojson)",
        "campus_boundary": "1 (processed/uit_campus_boundary.geojson)",
    }
    report = ["# Báo cáo gộp dữ liệu", "", "Sinh tự động bởi `dataset/scripts/merge_dataset.py`. Không sửa tay.", "",
              "## Số lượng", "", "| Lớp | Đầu vào | Đầu ra |", "|---|---|---|"]
    all_errors = []
    for name, feats in layers.items():
        with open(os.path.join(OUT, f"{name}.geojson"), "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "name": name,
                       "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
                       "features": feats}, f, ensure_ascii=False, indent=1)
        report.append(f"| {name} | {before[name]} | {len(feats)} |")
        all_errors += [f"{name}: {e}" for e in check(name, feats)]
    by_floor = Counter((f["properties"]["building_code"], f["properties"]["floor_number"]) for f in layers["rooms"])
    report += ["", "Phòng theo tầng: " + ", ".join(f"{b}{n}={c}" for (b, n), c in sorted(by_floor.items())), "",
               "## Kiểm tra tự động", "",
               "- ID duy nhất, hình học hợp lệ (vòng khép kín, >= 4 điểm, không tự cắt), tọa độ trong vùng UIT: "
               + ("**ĐẠT**" if not all_errors else f"**{len(all_errors)} LỖI**")]
    report += [f"  - {e}" for e in all_errors]
    report += ["", "## Vấn đề còn lại (để null / cần kiểm chứng)", "", "| Lớp | Đối tượng | Vấn đề |", "|---|---|---|"]
    report += [f"| {a} | {b} | {c} |" for a, b, c in issues]
    with open(os.path.join(OUT, "merge_report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(report) + "\n")
    # frontend đọc ranh giới khuôn viên trực tiếp (LOD 1)
    shutil.copyfile(os.path.join(OUT, "campus_boundary.geojson"), os.path.join(ROOT, "frontend", "data", "campus_boundary.geojson"))
    print("\n".join(report[4:12]))
    print(f"Loi: {len(all_errors)} | Van de: {len(issues)}")
    if all_errors:
        raise SystemExit("\n".join(all_errors))


if __name__ == "__main__":
    main()
