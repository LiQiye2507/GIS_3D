"""Điểm vào FastAPI: tạo app, gắn middleware, xử lý lỗi và router."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from config.settings import CORS_ORIGINS
from middlewares.errors import register_error_handlers
from routes.api import router

app = FastAPI(title="UIT 3D Smart Campus API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)  # GeoJSON phòng ~85 KB còn ~5 KB
register_error_handlers(app)
app.include_router(router)
