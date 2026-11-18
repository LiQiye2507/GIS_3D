"""Truy vấn PostgreSQL/PostGIS, trả về list[dict]."""
import threading

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

from config import settings

_pool: ThreadedConnectionPool | None = None
_lock = threading.Lock()


def _get_pool() -> ThreadedConnectionPool:
    # Tạo pool ở request đầu tiên: CSDL tắt lúc khởi động thì request nhận 503 thay vì app không chạy.
    # Pool chỉ giữ lại minconn kết nối rảnh, phần dư bị đóng sau khi dùng.
    # shortcut: tối đa 20 kết nối, vượt quá thì request lỗi 500 (PoolError); tăng maxconn nếu tải lớn hơn demo.
    global _pool
    with _lock:
        if _pool is None:
            _pool = ThreadedConnectionPool(4, 20, settings.DATABASE_URL)
        return _pool


def _get_live_conn(pool: ThreadedConnectionPool):
    # Kết nối rảnh có thể đã chết (CSDL khởi động lại): ping, hỏng thì bỏ và lấy cái khác.
    # Hết kết nối rảnh thì pool mở kết nối mới; CSDL tắt thì lỗi OperationalError (503) thoát vòng lặp.
    while True:
        conn = pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            return conn
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            pool.putconn(conn, close=True)


def fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    pool = _get_pool()
    conn = _get_live_conn(pool)
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                return [dict(row) for row in cur.fetchall()]
    finally:
        # kết nối hỏng (CSDL khởi động lại) thì đóng hẳn, lần sau pool mở kết nối mới
        pool.putconn(conn, close=bool(conn.closed))
