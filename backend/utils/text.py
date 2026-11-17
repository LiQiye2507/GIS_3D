"""Hàm xử lý chuỗi dùng chung."""


def escape_like(text: str) -> str:
    """Thoát ký tự đặc biệt của LIKE/ILIKE (dùng kèm ESCAPE '\')."""
    return text.replace("\\", "\\\\").replace("%", "\%").replace("_", "\_")
