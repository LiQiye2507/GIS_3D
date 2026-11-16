#!/usr/bin/env python3
"""Chuẩn hóa danh sách phòng học & sơ đồ tầng từ bộ dữ liệu thô UIT.

Đọc:
- dataset/03_floorplans/rooms_by_floor.csv
- dataset/03_floorplans/floorplan_toa_C_layout.csv

Xuất:
- dataset/processed/rooms_normalized.csv (đủ room_type, base_height, extrude_height, capacity)
- dataset/processed/toa_C_indoor_grid.csv (kết hợp vị trí lưới với thuộc tính phòng cho Tòa C)
- dataset/processed/data_quality_report.md (báo cáo kiểm tra tự động các điểm cần xác minh)
"""
import csv
import os
from collections import Counter


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOOR_HEIGHT_M = 3.8
ROOM_CEILING_OFFSET_M = 3.5


def infer_room_type(element_type: str, label_func: str, special_label: str, room_code: str) -> str:
    """Ánh xạ về 4 loại chuẩn của 01_schema.sql: Theory | Lab | Office | WC."""
    text = " ".join([element_type, label_func, special_label, room_code]).lower()
    if any(k in text for k in ["wc", "vệ sinh", "cầu thang", "kho", "hồ nước", "bảo vệ", "bãi để xe", "sinh hoạt"]):
        return "WC"
    if any(k in text for k in ["phòng máy", "thí nghiệm", "thực hành", "lab", "vi mạch", "an toàn thông tin"]):
        return "Lab"
    if any(k in text for k in ["văn phòng", "ban quản lý", "khoa ", "giảng viên", "công ty", "trung tâm", "phòng ăn", "phòng nghỉ", "họp", "lv"]):
        return "Office"
    return "Theory"


def calc_heights(floor_number: int | None, has_ground_g: bool = False) -> tuple[float, float] | tuple[str, str]:
    if floor_number is None:
        return "", ""
    idx = floor_number if has_ground_g else max(floor_number - 1, 0)
    base_h = round(idx * FLOOR_HEIGHT_M, 2)
    ext_h = round(base_h + ROOM_CEILING_OFFSET_M, 2)
    return base_h, ext_h


def read_csv(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: str, rows: list[dict], fieldnames: list[str]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    rooms_raw = read_csv(os.path.join(BASE_DIR, "03_floorplans", "rooms_by_floor.csv"))
    c_layout_raw = read_csv(os.path.join(BASE_DIR, "03_floorplans", "floorplan_toa_C_layout.csv"))

    # Tra cứu nhanh thông tin chi tiết từ rooms_by_floor theo (building_id, room_code)
    room_meta = {}
    for r in rooms_raw:
        code = r["room_code"].strip()
        if code:
            room_meta[(r["building_id"].strip(), code)] = r

    normalized_rows = []
    issues = []

    for r in rooms_raw:
        b_id = r["building_id"].strip()
        is_room = r["is_room"].strip() == "1"
        if not is_room:
            continue

        # Sơ đồ Tầng 1-3 Tòa A không có giảng đường A.GĐ1-3
        code = r["room_code"].strip()
        if code.startswith("A.GĐ"):
            issues.append(f"- `A` / `{code}`: không có trong sơ đồ Tầng 1–3 Tòa A, loại khỏi LOD 3 (TODO: kiểm chứng thực địa).")
            continue

        floor_str = r["floor"].strip()
        floor_num = int(floor_str) if floor_str.isdigit() else None
        if floor_num is None:
            issues.append(f"- `{b_id}` / `{r['room_code']}`: thiếu số tầng (`floor` trống).")

        base_h, ext_h = calc_heights(floor_num, has_ground_g=(b_id == "E"))
        code = r["room_code"].strip()
        elem_type = r["element_type"].strip()
        label_func = r["label_function"].strip()
        seats_str = r["seats_tonghop"].strip()
        capacity = int(seats_str) if seats_str.isdigit() else ""

        # Kết hợp thêm special_label nếu là Tòa C
        special_label = ""
        for cl in c_layout_raw:
            if cl["room_code"].strip() == code:
                special_label = cl["special_label"].strip()
                break

        room_type = infer_room_type(elem_type, label_func, special_label, code)
        room_name = f"{elem_type} {code}".strip()
        if label_func:
            room_name = f"{code} - {label_func}"
        elif special_label:
            room_name = f"{code} ({special_label})"

        if b_id == "C" and r["in_floor_diagram"].strip() == "Không":
            issues.append(f"- Tòa C / `{code}` (tầng {floor_str}): có trong danh sách Excel nhưng KHÔNG có trong sơ đồ tầng.")

        normalized_rows.append({
            "building_code": b_id,
            "floor_number": floor_str,
            "room_code": code,
            "room_name": room_name,
            "room_type": room_type,
            "capacity": capacity,
            "base_height": base_h,
            "extrude_height": ext_h,
            "in_floor_diagram": r["in_floor_diagram"].strip(),
            "diagram_row": r["diagram_row"].strip(),
            "diagram_col": r["diagram_col"].strip(),
            "note": r["note"].strip(),
        })

    # Chuẩn hóa bảng lưới Tòa C (bao gồm cả WC, Cầu thang, Kho, Hồ nước)
    c_grid_rows = []
    wc_counter = Counter()
    for cl in c_layout_raw:
        floor_num = int(cl["floor"].strip())
        base_h, ext_h = calc_heights(floor_num, has_ground_g=False)
        elem_type = cl["element_type"].strip()
        code = cl["room_code"].strip()
        special = cl["special_label"].strip()

        if code:
            meta = room_meta.get(("C", code), {})
            seats_str = meta.get("seats_tonghop", "").strip()
            capacity = int(seats_str) if seats_str.isdigit() else ""
            room_type = infer_room_type(elem_type, "", special, code)
            room_name = f"Phòng {code}" + (f" ({special})" if special else "")
            final_code = code
        else:
            wc_counter[(floor_num, elem_type)] += 1
            idx = wc_counter[(floor_num, elem_type)]
            prefix_map = {"WC": "WC", "Cầu thang": "STAIR", "Kho": "STORE", "Hồ nước": "POOL"}
            prefix = prefix_map.get(elem_type, "UTIL")
            final_code = f"C{floor_num}-{prefix}{idx}"
            room_type = "WC"
            room_name = f"{cl['element_name'].strip()} Tầng {floor_num}"
            capacity = ""

        c_grid_rows.append({
            "building_code": "C",
            "floor_number": floor_num,
            "row_group": cl["row_group"].strip(),
            "col_index": int(cl["col_index"].strip()),
            "col_letter": cl["col_letter"].strip(),
            "element_type": elem_type,
            "room_code": final_code,
            "room_name": room_name,
            "room_type": room_type,
            "capacity": capacity,
            "base_height": base_h,
            "extrude_height": ext_h,
            "special_label": special,
        })

    out_dir = os.path.join(BASE_DIR, "processed")
    write_csv(
        os.path.join(out_dir, "rooms_normalized.csv"),
        normalized_rows,
        list(normalized_rows[0].keys()),
    )
    write_csv(
        os.path.join(out_dir, "toa_C_indoor_grid.csv"),
        c_grid_rows,
        list(c_grid_rows[0].keys()),
    )

    by_bldg = Counter(r["building_code"] for r in normalized_rows)
    by_type = Counter(r["room_type"] for r in normalized_rows)
    report_lines = [
        "# Báo cáo Chuẩn hóa Dữ liệu Phòng học UIT",
        "",
        "## 1. Thống kê tổng hợp",
        f"- Tổng số phòng chuẩn hóa từ `rooms_by_floor.csv`: **{len(normalized_rows)}** phòng.",
        f"- Phân bố theo tòa: " + ", ".join(f"**{k}** ({v})" for k, v in sorted(by_bldg.items())),
        f"- Phân bố theo `room_type` (`01_schema.sql`): " + ", ".join(f"`{k}` ({v})" for k, v in sorted(by_type.items())),
        f"- Tổng số khối lưới Tòa C (gồm cả WC, Cầu thang, Kho, Hồ nước): **{len(c_grid_rows)}** khối trên 3 tầng.",
        "",
        "## 2. Các điểm cần xác minh thực địa (Phát hiện tự động)",
        *issues,
        "- Tòa C có nhãn `Phòng WB` và `Phòng LV` chưa rõ tên đầy đủ (hiện tạm gán `WB -> Theory`, `LV -> Office`).",
        "- Tòa E (`E4.1`): danh sách ghi Phòng thí nghiệm, sheet ẩn ghi Phòng học 54 chỗ.",
        "- Tòa E (`E11.5`): có trên sơ đồ, không có trong danh sách phòng.",
    ]
    with open(os.path.join(out_dir, "data_quality_report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines) + "\n")
    print(f"Da xuat: {out_dir}")


if __name__ == "__main__":
    main()

