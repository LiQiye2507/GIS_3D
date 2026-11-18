"""Nghiệp vụ tiện ích: tìm trong bán kính (mét, ::geography), sắp theo khoảng cách."""
from models.enums import ROOM_BASED_CATEGORIES
from utils.db import fetch_all


def nearby(lng: float, lat: float, radius_m: float, category: str | None = None) -> list[dict]:
    # WC và Thư viện được lưu là phòng (rooms.room_type) nên lấy tâm phòng làm điểm tiện ích.
    # Phòng Y tế (A103) và hội trường (A.HT, HTE) mang room_type Office/Theory nên nhận diện theo tên phòng.
    sql = """
        WITH items AS (
            SELECT a.name, a.category, b.building_code, a.floor_number, a.elevation_z,
                   a.open_hours, a.status, NULL::text AS room_code, a.geom
            FROM amenities a
            LEFT JOIN buildings b ON b.id = a.building_id
            UNION ALL
            SELECT r.room_name,
                   CASE WHEN r.room_type = ANY(%s) THEN r.room_type
                        WHEN r.room_name ILIKE 'Hội trường%%' THEN 'Hall' ELSE 'Medical' END,
                   b.building_code, r.floor_number, r.base_height,
                   NULL, NULL, r.room_code, ST_Centroid(r.geom)
            FROM rooms r
            JOIN buildings b ON b.id = r.building_id
            WHERE r.room_type = ANY(%s) OR r.room_name ILIKE 'Phòng Y tế%%' OR r.room_name ILIKE 'Hội trường%%'
        )
        SELECT i.name, i.category, i.building_code, i.floor_number, i.elevation_z,
               i.open_hours, i.status, i.room_code,
               round(ST_Distance(i.geom::geography, p.pt::geography)::numeric, 1)::double precision AS distance_m,
               ST_AsGeoJSON(i.geom)::json AS geometry
        FROM items i
        CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint(%s, %s), 4326) AS pt) p
        WHERE ST_DWithin(i.geom::geography, p.pt::geography, %s)
    """
    params: list = [list(ROOM_BASED_CATEGORIES), list(ROOM_BASED_CATEGORIES), lng, lat, radius_m]
    if category is not None:
        sql += " AND i.category = %s"
        params.append(category)
    # cùng khoảng cách (WC xếp chồng các tầng) thì ưu tiên tầng thấp, đi bộ tới gần hơn
    sql += " ORDER BY distance_m, i.floor_number"
    return fetch_all(sql, tuple(params))
