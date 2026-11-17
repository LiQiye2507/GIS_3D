"""Xử lý lỗi CSDL tập trung: trả JSON {detail} tiếng Việt thay vì lỗi 500 mặc định."""
import logging

import psycopg2
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = logging.getLogger("uvicorn.error")


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(psycopg2.OperationalError)
    async def db_unavailable(_: Request, exc: psycopg2.OperationalError):
        log.error("Không kết nối được CSDL: %s", exc)
        return JSONResponse(status_code=503, content={"detail": "Không kết nối được cơ sở dữ liệu"})

    @app.exception_handler(psycopg2.Error)
    async def db_error(_: Request, exc: psycopg2.Error):
        log.error("Lỗi truy vấn CSDL: %s", exc)
        return JSONResponse(status_code=500, content={"detail": "Lỗi truy vấn cơ sở dữ liệu"})
