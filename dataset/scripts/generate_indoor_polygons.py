#!/usr/bin/env python3
"""Tự động sinh Polygon phòng học 3D (LOD 3) và hành lang nội khu từ footprint tòa nhà + bảng lưới tầng.

Hỗ trợ bất kỳ tòa nhà hình chữ nhật / dải dài nào (như Tòa C) hoặc có thể mở rộng theo cánh:
1. Đọc footprint Polygon của tòa nhà từ GeoJSON (EPSG:4326).
2. Chiếu sang hệ phẳng mét cục bộ (origin = tâm footprint) và tìm trục chính (OBB - Oriented Bounding Box).
3. Chia lưới theo col_index (trục dọc tòa nhà) và row_group ('Hàng trên', 'Hàng giữa', 'Hàng dưới')
   với lề tường (margin) và hành lang ở giữa.
4. Chiếu ngược lại WGS84 (EPSG:4326) và xuất ra:
   - rooms_3d.geojson (từng phòng kèm base_height, extrude_height, room_type, capacity)
   - floors_3d.geojson (mặt sàn từng tầng)
   - indoor_paths_3d.geojson (hành lang + cầu thang nối các tầng)
"""
import argparse
import csv
import json
import math
import os


def to_local_xy(lon: float, lat: float, lon0: float, lat0: float) -> tuple[float, float]:
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    return (lon - lon0) * kx, (lat - lat0) * ky


def to_lonlat(x: float, y: float, lon0: float, lat0: float) -> list[float]:
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0
    return [round(lon0 + x / kx, 7), round(lat0 + y / ky, 7)]


def polygon_obb(ring: list[list[float]]) -> tuple[float, float, float, float, float, float]:
    """Tìm Oriented Bounding Box diện tích nhỏ nhất cho footprint tòa nhà.

    Trả về: (lon0, lat0, angle_rad, length_m, width_m, center_u, center_v)
    trong đó trục u là chiều dài tòa nhà, trục v là chiều rộng tòa nhà.
    """
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    lon0 = sum(p[0] for p in pts) / len(pts)
    lat0 = sum(p[1] for p in pts) / len(pts)
    xy = [to_local_xy(p[0], p[1], lon0, lat0) for p in pts]

    # Thu thập các góc cạnh của polygon (rotating calipers đơn giản trên tập cạnh)
    candidate_angles = []
    for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]):
        dx, dy = x2 - x1, y2 - y1
        if math.hypot(dx, dy) > 0.5:
            candidate_angles.append(math.atan2(dy, dx))
    if not candidate_angles:
        candidate_angles = [0.0]

    best = None
    for theta in candidate_angles:
        c, s = math.cos(-theta), math.sin(-theta)
        uv = [(x * c - y * s, x * s + y * c) for x, y in xy]
        us = [p[0] for p in uv]
        vs = [p[1] for p in uv]
        du = max(us) - min(us)
        dv = max(vs) - min(vs)
        area = du * dv
        if best is None or area < best[0]:
            # Đảm bảo u luôn là chiều dài (>= v)
            if du < dv:
                theta_adj = theta + math.pi / 2.0
                c2, s2 = math.cos(-theta_adj), math.sin(-theta_adj)
                uv2 = [(x * c2 - y * s2, x * s2 + y * c2) for x, y in xy]
                us2 = [p[0] for p in uv2]
                vs2 = [p[1] for p in uv2]
                best = (area, theta_adj, max(us2) - min(us2), max(vs2) - min(vs2),
                        (min(us2) + max(us2)) / 2.0, (min(vs2) + max(vs2)) / 2.0)
            else:
                best = (area, theta, du, dv, (min(us) + max(us)) / 2.0, (min(vs) + max(vs)) / 2.0)

    _, angle, length_m, width_m, cu, cv = best
    # Chuẩn hóa góc sao cho trục +u hướng về phía Tây-Bắc / Đông-Bắc nhất quán (cos >= 0 theo mặc định hoặc từ trái qua phải)
    if math.cos(angle) < 0:
        angle += math.pi
        cu, cv = -cu, -cv
    return lon0, lat0, angle, length_m, width_m, cu, cv


def uv_rect_to_lonlat_ring(
    u0: float, u1: float, v0: float, v1: float,
    lon0: float, lat0: float, angle: float,
) -> list[list[float]]:
    c, s = math.cos(angle), math.sin(angle)
    corners_uv = [(u0, v0), (u1, v0), (u1, v1), (u0, v1), (u0, v0)]
    return [to_lonlat(u * c - v * s, u * s + v * c, lon0, lat0) for u, v in corners_uv]


def uv_point_to_lonlat(u: float, v: float, lon0: float, lat0: float, angle: float) -> list[float]:
    c, s = math.cos(angle), math.sin(angle)
    return to_lonlat(u * c - v * s, u * s + v * c, lon0, lat0)


def find_building_feature(geojson_path: str, building_code: str, osm_id: int | None) -> dict:
    with open(geojson_path, "r", encoding="utf-8") as f:
        fc = json.load(f)
    feats = fc.get("features", [])
    for feat in feats:
        props = feat.get("properties", {})
        if osm_id is not None and props.get("osm_id") == osm_id:
            return feat
        code_candidates = [
            str(props.get("building_code", "")),
            str(props.get("short_name", "")),
            str(props.get("ref", "")),
            str(props.get("name", "")),
        ]
        if any(building_code.upper() == c.strip().upper() or f"TÒA {building_code.upper()}" in c.upper() for c in code_candidates):
            return feat
    raise SystemExit(f"Khong tim thay building_code={building_code} (osm_id={osm_id}) trong {geojson_path}")


def generate_for_grid(
    footprint_feat: dict,
    grid_csv_path: str,
    out_dir: str,
    flip_u: bool = False,
    flip_v: bool = False,
    wall_margin_m: float = 0.5,
    room_gap_m: float = 0.25,
    corridor_ratio: float = 0.18,
) -> None:
    ring = footprint_feat["geometry"]["coordinates"][0]
    lon0, lat0, angle, length_m, width_m, cu, cv = polygon_obb(ring)

    with open(grid_csv_path, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"File rong: {grid_csv_path}")

    b_code = rows[0]["building_code"].strip()
    max_col = max(int(r["col_index"]) for r in rows)
    floors = sorted({int(r["floor_number"]) for r in rows})

    usable_len = max(length_m - 2 * wall_margin_m, 4.0)
    usable_wid = max(width_m - 2 * wall_margin_m, 4.0)
    u_start = cu - usable_len / 2.0
    v_start = cv - usable_wid / 2.0

    corridor_w = usable_wid * corridor_ratio
    row_depth = (usable_wid - corridor_w) / 2.0
    col_step = usable_len / max_col

    # Dải V cho 3 hàng: Hàng dưới, Hàng giữa (hành lang), Hàng trên
    v_bands_normal = {
        "Hàng dưới": (v_start, v_start + row_depth - room_gap_m / 2.0),
        "Hàng giữa": (v_start + row_depth + room_gap_m / 2.0, v_start + row_depth + corridor_w - room_gap_m / 2.0),
        "Hàng trên": (v_start + row_depth + corridor_w + room_gap_m / 2.0, v_start + usable_wid),
    }

    room_features = []
    floor_features = []
    path_features = []

    for fl in floors:
        fl_rows = [r for r in rows if int(r["floor_number"]) == fl]
        base_h = float(fl_rows[0]["base_height"])
        ext_h = float(fl_rows[0]["extrude_height"])

        # Mặt sàn tầng
        floor_features.append({
            "type": "Feature",
            "properties": {
                "building_code": b_code,
                "floor_number": fl,
                "base_height": base_h,
                "ceiling_height": round(base_h + 3.8, 2),
            },
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })

        # Hành lang 3D dọc trục tòa nhà tại tầng này (cao độ mặt sàn + 0.2m)
        corridor_v = cv
        z_floor = round(base_h + 0.2, 2)
        p_left = uv_point_to_lonlat(u_start + col_step * 0.5, corridor_v, lon0, lat0, angle)
        p_right = uv_point_to_lonlat(u_start + usable_len - col_step * 0.5, corridor_v, lon0, lat0, angle)
        path_features.append({
            "type": "Feature",
            "properties": {
                "building_code": b_code,
                "path_type": "Corridor",
                "floor_from": fl,
                "floor_to": fl,
                "length_m": round(usable_len - col_step, 1),
            },
            "geometry": {"type": "LineString", "coordinates": [[p_left[0], p_left[1], z_floor], [p_right[0], p_right[1], z_floor]]},
        })

        for r in fl_rows:
            c_idx = int(r["col_index"])
            if flip_u:
                c_idx = max_col + 1 - c_idx
            u0 = u_start + (c_idx - 1) * col_step + room_gap_m / 2.0
            u1 = u_start + c_idx * col_step - room_gap_m / 2.0

            rg = r["row_group"].strip()
            if flip_v and rg in ("Hàng trên", "Hàng dưới"):
                rg_mapped = "Hàng dưới" if rg == "Hàng trên" else "Hàng trên"
            else:
                rg_mapped = rg
            v0, v1 = v_bands_normal.get(rg_mapped, v_bands_normal["Hàng giữa"])

            poly_ring = uv_rect_to_lonlat_ring(u0, u1, v0, v1, lon0, lat0, angle)
            cap = int(r["capacity"]) if r["capacity"].strip().isdigit() else 0
            room_features.append({
                "type": "Feature",
                "properties": {
                    "building_code": b_code,
                    "floor_number": fl,
                    "room_code": r["room_code"].strip(),
                    "room_name": r["room_name"].strip(),
                    "room_type": r["room_type"].strip(),
                    "capacity": cap,
                    "base_height": base_h,
                    "extrude_height": ext_h,
                    "element_type": r["element_type"].strip(),
                    "special_label": r["special_label"].strip(),
                },
                "geometry": {"type": "Polygon", "coordinates": [poly_ring]},
            })

            # Nối cầu thang giữa tầng này và tầng kế tiếp
            if fl < max(floors) and r["element_type"].strip() == "Cầu thang":
                uc = (u0 + u1) / 2.0
                vc = (v0 + v1) / 2.0
                pt = uv_point_to_lonlat(uc, vc, lon0, lat0, angle)
                z_next = round(base_h + 3.8 + 0.2, 2)
                path_features.append({
                    "type": "Feature",
                    "properties": {
                        "building_code": b_code,
                        "path_type": "Stairs",
                        "floor_from": fl,
                        "floor_to": fl + 1,
                        "length_m": 5.0,
                    },
                    "geometry": {"type": "LineString", "coordinates": [[pt[0], pt[1], z_floor], [pt[0], pt[1], z_next]]},
                })

    os.makedirs(out_dir, exist_ok=True)
    for name, feats in [
        (f"rooms_{b_code}_3d.geojson", room_features),
        (f"floors_{b_code}_3d.geojson", floor_features),
        (f"indoor_paths_{b_code}_3d.geojson", path_features),
    ]:
        out_path = os.path.join(out_dir, name)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, indent=2)
        print(f"Da sinh {len(feats)} features -> {out_path}")
    print(f"Kich thuoc OBB toa {b_code}: {length_m:.1f}m x {width_m:.1f}m (goc {math.degrees(angle):.1f} deg)")


def main() -> None:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description="Generate LOD 3 indoor polygons from building footprint")
    ap.add_argument("--buildings-geojson", required=True, help="GeoJSON chua footprint toa nha")
    ap.add_argument("--building-code", default="C", help="Ma toa nha (mac dinh C)")
    ap.add_argument("--osm-id", type=int, default=None, help="osm_id cu the neu co")
    ap.add_argument("--grid-csv", default=os.path.join(base, "processed", "toa_C_indoor_grid.csv"))
    ap.add_argument("--out-dir", default=os.path.join(base, "processed"))
    ap.add_argument("--flip-u", action="store_true", help="Dao chieu doc theo cot 1..N")
    ap.add_argument("--flip-v", action="store_true", help="Dao Hang tren <-> Hang duoi")
    args = ap.parse_args()

    feat = find_building_feature(args.buildings_geojson, args.building_code, args.osm_id)
    generate_for_grid(feat, args.grid_csv, args.out_dir, flip_u=args.flip_u, flip_v=args.flip_v)


if __name__ == "__main__":
    main()

