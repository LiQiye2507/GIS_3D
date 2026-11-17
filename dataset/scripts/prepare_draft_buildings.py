#!/usr/bin/env python3
"""Gắn thuộc tính UIT vào footprint OSM đã lọc và tạo footprint tạm cho Tòa C dựa trên 3 điểm cửa OSM.

Lưu ý: Tòa C trong file draft này mới dựng tạm quanh 3 điểm `entrance` của OSM
để chạy thử pipeline và mở chỉnh sửa trên ảnh vệ tinh trong QGIS.
"""
import json
import math
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OSM_TO_UIT = {
    259211695: ("A", "Tòa A - Giảng đường, Thư viện & Hành chính", 3, "Đã có trên OSM; cần kiểm chứng số tầng Tòa A"),
    327427158: ("B", "Tòa B - Giảng đường", 9, "Khớp 9 tầng giữa OSM và sơ đồ UIT"),
    693343290: ("D", "Tòa D", 1, "Cần khảo sát thực tế số tầng Tòa D (tạm để 1)"),
    693343289: ("E", "Tòa E - Trung tâm Thực hành & Nghiên cứu", 13, "OSM ghi 12 tầng; tính cả tầng G là 13 mức sàn"),
    722732584: ("NHA_PVSV", "Nhà PVSV - Căng tin UIT", 2, "OSM ghi 2 tầng; cần kiểm chứng thực địa"),
}


def make_provisional_c_polygon() -> dict:
    """Dựng hình chữ nhật tạm cho Tòa C dọc theo 3 điểm cửa OSM (4828780142, 13381089612, 13381089626)."""
    p_west = (106.8028653, 10.8695961)
    p_east = (106.8036695, 10.8695208)
    lat0 = (p_west[1] + p_east[1]) / 2.0
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110540.0

    # Vector trục dọc (Tây -> Đông) theo mét
    dx = (p_east[0] - p_west[0]) * kx
    dy = (p_east[1] - p_west[1]) * ky
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    # Vector pháp tuyến hướng Bắc (về phía Tòa B/A)
    nx, ny = -uy, ux

    # Điểm cửa OSM nằm ở mép Nam của Tòa C; kéo dài nhẹ hai đầu ~12m, bề rộng ~22m về phía Bắc
    ext_w, ext_e = -12.0, L + 12.0
    w_s, w_n = -2.0, 20.0

    def pt(u: float, v: float) -> list[float]:
        x = u * ux + v * nx
        y = u * uy + v * ny
        return [round(p_west[0] + x / kx, 7), round(p_west[1] + y / ky, 7)]

    ring = [pt(ext_w, w_s), pt(ext_e, w_s), pt(ext_e, w_n), pt(ext_w, w_n), pt(ext_w, w_s)]
    return {
        "type": "Feature",
        "properties": {
            "building_code": "C",
            "name_vi": "Tòa C - Giảng đường & Phòng máy (Trọng điểm LOD 3)",
            "total_floors": 3,
            "height_m": 11.4,
            "status": "PROVISIONAL_FROM_OSM_ENTRANCES_NEEDS_QGIS_VERIFY",
            "notes": "Footprint tam dung theo 3 diem entrance OSM; can nan lai tren anh ve tinh QGIS.",
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }


def main() -> None:
    proc = os.path.join(BASE_DIR, "interim")
    b_fc = json.load(open(os.path.join(proc, "uit_buildings_osm_filtered.geojson"), encoding="utf-8"))

    out_feats = []
    for f in b_fc["features"]:
        oid = f["properties"].get("osm_id")
        if oid not in OSM_TO_UIT:
            continue
        code, name_vi, floors, note = OSM_TO_UIT[oid]
        props = dict(f["properties"])
        props.update({
            "building_code": code,
            "name_vi": name_vi,
            "total_floors": floors,
            "height_m": round(floors * 3.8, 2),
            "status": "OSM_NEEDS_FIELD_VERIFY",
            "notes": note,
        })
        out_feats.append({
            "type": "Feature",
            "properties": props,
            "geometry": f["geometry"],
        })

    out_feats.append(make_provisional_c_polygon())

    out_path = os.path.join(proc, "uit_buildings_draft.geojson")
    with open(out_path, "w", encoding="utf-8") as fp:
        json.dump({"type": "FeatureCollection", "features": out_feats}, fp, ensure_ascii=False, indent=2)
    print(f"Saved {len(out_feats)} UIT draft buildings -> {out_path}")


if __name__ == "__main__":
    main()

