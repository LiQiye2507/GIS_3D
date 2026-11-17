"""Truy vấn PostgreSQL/PostGIS, trả về list[dict]."""
import psycopg2
from psycopg2.extras import RealDictCursor

from config.settings import DATABASE_URL


def fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    # shortcut: mở kết nối mới cho mỗi request (đủ cho demo), nâng cấp sang pool khi có tải đồng thời
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()
