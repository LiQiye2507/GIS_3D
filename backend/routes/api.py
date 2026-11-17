"""Khai báo endpoint: URL nào gọi hàm controller nào."""
from fastapi import APIRouter

from controllers import amenity_controller, building_controller, room_controller, route_controller, sports_controller

router = APIRouter(prefix="/api")

router.add_api_route("/buildings", building_controller.get_buildings, methods=["GET"])
router.add_api_route("/rooms", room_controller.get_rooms, methods=["GET"])
router.add_api_route("/search", room_controller.search_rooms, methods=["GET"])
router.add_api_route("/amenities/nearby", amenity_controller.amenities_nearby, methods=["GET"])
router.add_api_route("/route", route_controller.route_to_room, methods=["GET"])
router.add_api_route("/sports-fields", sports_controller.get_sports_fields, methods=["GET"])
