"""Giá trị hợp lệ của các cột phân loại (khớp CHECK trong database/01_schema.sql).

Bảng CSDL được định nghĩa bằng SQL (database/01_schema.sql), không dùng ORM.
"""
from typing import Literal

RoomType = Literal["Theory", "Lab", "Library", "Office", "Corridor", "Stairs", "WC"]

# Danh mục tiện ích: 6 loại của bảng amenities + WC/Library/Hall lấy từ bảng rooms
AmenityCategory = Literal["Canteen", "ATM", "Water", "Parking", "Medical", "FireSafety", "WC", "Library", "Hall"]
ROOM_BASED_CATEGORIES = ("WC", "Library")
