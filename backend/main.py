"""Điểm vào FastAPI: tạo app, gắn middleware, xử lý lỗi và router."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
register_error_handlers(app)
app.include_router(router)
