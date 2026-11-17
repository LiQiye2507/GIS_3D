"""Cấu hình ứng dụng đọc từ biến môi trường (file backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "")
CORS_ORIGINS = ["http://localhost:5500", "http://127.0.0.1:5500"]
