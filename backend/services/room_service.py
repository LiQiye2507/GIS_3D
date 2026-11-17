"""Nghiệp vụ phòng: liệt kê theo tòa/tầng, tìm kiếm theo mã hoặc tên."""
from utils.db import fetch_all
from utils.text import escape_like


def list_rooms(building_code: str, floor_number: int | None = None) -> list[dict]:
    sql = """
        SELECT r.room_code, r.room_name, r.room_type, b.building_code,
               r.floor_number, r.capacity, r.base_height, r.extrude_height,
               r.equipment_info, ST_AsGeoJSON(r.geom)::json AS geometry
        FROM rooms r
        JOIN buildings b ON b.id = r.building_id
        WHERE b.building_code = %s
    """
    params: list = [building_code]
    if floor_number is not None:
        sql += " AND r.floor_number = %s"
        params.append(floor_number)
    sql += " ORDER BY r.floor_number, r.room_code"
    return fetch_all(sql, tuple(params))


def search_rooms(q: str) -> list[dict]:
    code_pat = f"%{escape_like(q.replace('.', ''))}%"
    name_pat = f"%{escape_like(q)}%"
    return fetch_all(
        r"""
        SELECT r.room_code, r.room_name, b.building_code, r.floor_number, r.base_height,
               ST_X(ST_Centroid(r.geom)) AS lng,
               ST_Y(ST_Centroid(r.geom)) AS lat
        FROM rooms r
        JOIN buildings b ON b.id = r.building_id
        WHERE r.room_type <> 'Corridor'
          AND (replace(r.room_code, '.', '') ILIKE %s ESCAPE '\' OR r.room_name ILIKE %s ESCAPE '\')
        ORDER BY r.room_code
        LIMIT 20
        """,
        (code_pat, name_pat),
    )


def find_room_code(code: str) -> str | None:
    """Mã phòng chuẩn trong CSDL; chấp nhận gõ có/không dấu chấm, hoa/thường (A305 = a.305)."""
    rows = fetch_all(
        "SELECT room_code FROM rooms WHERE upper(replace(room_code, '.', '')) = upper(replace(%s, '.', '')) LIMIT 1",
        (code,),
    )
    return rows[0]["room_code"] if rows else None
