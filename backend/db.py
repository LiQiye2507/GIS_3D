import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

load_dotenv(Path(__file__).with_name(".env"))


def fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    # shortcut: mở kết nối mới cho mỗi request (đủ cho demo), nâng cấp sang pool khi có tải đồng thời
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()
