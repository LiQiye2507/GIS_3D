"""Step 1: Preprocess UIT campus GeoJSON files with GeoPandas + PyProj + Shapely.

Reads all GeoJSON layers from dataset/, validates geometries, transforms from
EPSG:4326 to EPSG:32648 (UTM Zone 48N, meters), computes scene-local and
building-SW-anchor-local coordinates, writes:
  - Models_3D/gis_processed_metrics.json
  - Models_3D/update_buildings_glb.sql
  - Models_3D/gis_2d_preview.png
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import geopandas as gpd
import matplotlib.pyplot as plt
import pandas as pd
from pyproj import Transformer
from shapely.geometry import Polygon, MultiPolygon
from shapely.validation import make_valid


ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = ROOT / "dataset"
OUT_DIR = ROOT / "Models_3D"

TARGET_CRS = "EPSG:32648"
SOURCE_CRS = "EPSG:4326"


def load_geojson(name: str) -> gpd.GeoDataFrame:
    path = DATASET_DIR / name
    raw = json.loads(path.read_text(encoding="utf-8"))
    gdf = gpd.GeoDataFrame.from_features(raw["features"], crs=SOURCE_CRS)

    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        gdf.loc[invalid_mask, "geometry"] = gdf.loc[invalid_mask, "geometry"].apply(make_valid)
    return gdf


def polygon_rings_xy(geom, ox: float, oy: float) -> tuple[list[list[float]], list[list[list[float]]]]:
    """Return exterior ring and list of hole rings shifted by (ox, oy)."""
    if isinstance(geom, MultiPolygon):
        geom = max(geom.geoms, key=lambda g: g.area)
    if not isinstance(geom, Polygon):
        raise TypeError(f"Expected Polygon, got {type(geom).__name__}")
    ext = [[round(x - ox, 4), round(y - oy, 4)] for x, y in list(geom.exterior.coords)[:-1]]
    holes = [
        [[round(x - ox, 4), round(y - oy, 4)] for x, y in list(interior.coords)[:-1]]
        for interior in geom.interiors
    ]
    return ext, holes


def dominant_edge_angle_deg(geom) -> float:
    """Angle in degrees [-90, 90] of the longest edge of the minimum rotated rectangle."""
    if isinstance(geom, MultiPolygon):
        geom = max(geom.geoms, key=lambda g: g.area)
    mrr = geom.minimum_rotated_rectangle
    coords = list(mrr.exterior.coords)
    best_len = -1.0
    best_dx, best_dy = 1.0, 0.0
    for a, b in zip(coords[:-1], coords[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        seg_len = math.hypot(dx, dy)
        if seg_len > best_len:
            best_len = seg_len
            best_dx, best_dy = dx, dy
    angle = math.degrees(math.atan2(best_dy, best_dx))
    while angle > 90.0:
        angle -= 180.0
    while angle <= -90.0:
        angle += 180.0
    return round(angle, 4)


def linestring_coords_xyz(geom, ox: float, oy: float) -> list[list[float]]:
    coords = []
    for pt in geom.coords:
        x = round(pt[0] - ox, 4)
        y = round(pt[1] - oy, 4)
        z = round(pt[2], 4) if len(pt) >= 3 else 0.0
        coords.append([x, y, z])
    return coords


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    boundary_4326 = load_geojson("campus_boundary.geojson")
    buildings_4326 = load_geojson("buildings.geojson")
    floors_4326 = load_geojson("floors.geojson")
    rooms_4326 = load_geojson("rooms.geojson")
    paths_4326 = load_geojson("paths.geojson")
    amenities_4326 = load_geojson("amenities.geojson")

    boundary_utm = boundary_4326.to_crs(TARGET_CRS)
    buildings_utm = buildings_4326.to_crs(TARGET_CRS)
    floors_utm = floors_4326.to_crs(TARGET_CRS)
    rooms_utm = rooms_4326.to_crs(TARGET_CRS)
    paths_utm = paths_4326.to_crs(TARGET_CRS)
    amenities_utm = amenities_4326.to_crs(TARGET_CRS)

    # Campus scene origin = centroid of campus boundary in UTM meters
    campus_poly = boundary_utm.geometry.iloc[0]
    campus_centroid = campus_poly.centroid
    origin_utm_x = float(campus_centroid.x)
    origin_utm_y = float(campus_centroid.y)

    to_4326 = Transformer.from_crs(TARGET_CRS, SOURCE_CRS, always_xy=True)
    origin_lng, origin_lat = to_4326.transform(origin_utm_x, origin_utm_y)

    boundary_ext, boundary_holes = polygon_rings_xy(campus_poly, origin_utm_x, origin_utm_y)
    b_minx, b_miny, b_maxx, b_maxy = campus_poly.bounds

    # Map building_code -> glb filename matching Models_3D/buildings/*.glb
    glb_name_map = {
        "A": "buildings/toa_A.glb",
        "B": "buildings/toa_B.glb",
        "C": "buildings/toa_C.glb",
        "D": "buildings/toa_D.glb",
        "E": "buildings/toa_E.glb",
        "NHA_PVSV": "buildings/nha_pvsv.glb",
    }

    buildings_data = []
    sql_lines = [
        "-- Cập nhật đường dẫn model GLB và điểm neo (góc Tây-Nam) cho bảng buildings",
        "-- Khớp với schema trong database/01_schema.sql (model_rotation = 0.0 vì mesh GLB đã theo hướng Bắc chuẩn UTM)",
        "",
    ]

    for _, row in buildings_utm.iterrows():
        code = str(row["building_code"])
        geom = row.geometry
        minx, miny, maxx, maxy = geom.bounds
        # Southwest anchor corner per database/01_schema.sql
        anchor_lng, anchor_lat = to_4326.transform(minx, miny)
        anchor_cx = round(minx - origin_utm_x, 4)
        anchor_cy = round(miny - origin_utm_y, 4)

        campus_ext, campus_holes = polygon_rings_xy(geom, origin_utm_x, origin_utm_y)
        local_ext, local_holes = polygon_rings_xy(geom, minx, miny)
        centroid = geom.centroid

        dominant_angle = dominant_edge_angle_deg(geom)
        glb_rel = glb_name_map.get(code, f"buildings/{code.lower()}.glb")

        buildings_data.append(
            {
                "building_code": code,
                "name": row["name"],
                "total_floors": int(row["total_floors"]),
                "height_m": float(row["height_m"]),
                "base_elevation": float(row["base_elevation"]),
                "area_m2": round(float(geom.area), 2),
                "perimeter_m": round(float(geom.length), 2),
                "width_m": round(float(maxx - minx), 2),
                "depth_m": round(float(maxy - miny), 2),
                "dominant_angle_deg": dominant_angle,
                "glb_model_url": glb_rel,
                "model_rotation": 0.0,
                "anchor_lng": round(anchor_lng, 8),
                "anchor_lat": round(anchor_lat, 8),
                "anchor_utm": [round(minx, 4), round(miny, 4)],
                "anchor_campus_xy": [anchor_cx, anchor_cy],
                "centroid_campus_xy": [
                    round(float(centroid.x) - origin_utm_x, 4),
                    round(float(centroid.y) - origin_utm_y, 4),
                ],
                "campus_exterior": campus_ext,
                "campus_holes": campus_holes,
                "local_exterior": local_ext,
                "local_holes": local_holes,
            }
        )

        sql_lines.append(
            f"UPDATE buildings SET glb_model_url = '{glb_rel}', "
            f"anchor_lng = {anchor_lng:.8f}, anchor_lat = {anchor_lat:.8f}, "
            f"model_rotation = 0.0 WHERE building_code = '{code}';"
        )

    building_anchor_lookup = {b["building_code"]: b["anchor_utm"] for b in buildings_data}

    floors_data = []
    for _, row in floors_utm.iterrows():
        b_code = str(row["building_code"])
        geom = row.geometry
        campus_ext, campus_holes = polygon_rings_xy(geom, origin_utm_x, origin_utm_y)
        ax, ay = building_anchor_lookup.get(b_code, [origin_utm_x, origin_utm_y])
        local_ext, local_holes = polygon_rings_xy(geom, ax, ay)
        floors_data.append(
            {
                "id": str(row["id"]),
                "building_code": b_code,
                "floor_number": int(row["floor_number"]),
                "base_height": float(row["base_height"]),
                "ceiling_height": float(row["ceiling_height"]),
                "campus_exterior": campus_ext,
                "campus_holes": campus_holes,
                "local_exterior": local_ext,
                "local_holes": local_holes,
            }
        )

    rooms_data = []
    for _, row in rooms_utm.iterrows():
        b_code = str(row["building_code"])
        geom = row.geometry
        campus_ext, campus_holes = polygon_rings_xy(geom, origin_utm_x, origin_utm_y)
        ax, ay = building_anchor_lookup.get(b_code, [origin_utm_x, origin_utm_y])
        local_ext, local_holes = polygon_rings_xy(geom, ax, ay)
        rooms_data.append(
            {
                "room_code": str(row["room_code"]),
                "room_name": str(row["room_name"]),
                "room_type": str(row["room_type"]),
                "building_code": b_code,
                "floor_number": int(row["floor_number"]),
                "base_height": float(row["base_height"]),
                "extrude_height": float(row["extrude_height"]),
                "campus_exterior": campus_ext,
                "local_exterior": local_ext,
            }
        )

    paths_data = []
    for _, row in paths_utm.iterrows():
        geom = row.geometry
        if geom.geom_type == "MultiLineString":
            lines = list(geom.geoms)
        else:
            lines = [geom]
        for ln in lines:
            hw_val = row.get("highway")
            nm_val = row.get("name")
            len_val = row.get("length_m")
            paths_data.append(
                {
                    "id": str(row["id"]),
                    "path_type": str(row["path_type"]),
                    "highway": None if pd.isna(hw_val) else str(hw_val),
                    "name": None if pd.isna(nm_val) else str(nm_val),
                    "floor_from": int(row["floor_from"]),
                    "floor_to": int(row["floor_to"]),
                    "length_m": float(len_val) if not pd.isna(len_val) else round(float(ln.length), 2),
                    "campus_coords": linestring_coords_xyz(ln, origin_utm_x, origin_utm_y),
                }
            )

    amenities_data = []
    for _, row in amenities_utm.iterrows():
        pt = row.geometry
        bcode_val = row.get("building_code")
        amenities_data.append(
            {
                "id": str(row["id"]),
                "name": str(row["name"]),
                "category": str(row["category"]),
                "building_code": None if pd.isna(bcode_val) else str(bcode_val),
                "floor_number": int(row["floor_number"]),
                "elevation_z": float(row["elevation_z"]),
                "campus_xyz": [
                    round(float(pt.x) - origin_utm_x, 4),
                    round(float(pt.y) - origin_utm_y, 4),
                    round(float(row["elevation_z"]), 4),
                ],
            }
        )

    payload = {
        "crs_source": SOURCE_CRS,
        "crs_projected": TARGET_CRS,
        "origin": {
            "lng": round(origin_lng, 8),
            "lat": round(origin_lat, 8),
            "utm_x": round(origin_utm_x, 4),
            "utm_y": round(origin_utm_y, 4),
        },
        "validation": {
            "boundary_valid": bool(boundary_utm.is_valid.all()),
            "buildings_valid": bool(buildings_utm.is_valid.all()),
            "floors_valid": bool(floors_utm.is_valid.all()),
            "rooms_valid": bool(rooms_utm.is_valid.all()),
            "paths_valid": bool(paths_utm.is_valid.all()),
            "amenities_valid": bool(amenities_utm.is_valid.all()),
        },
        "campus_boundary": {
            "id": str(boundary_utm["id"].iloc[0]),
            "name": str(boundary_utm["name"].iloc[0]),
            "area_m2": round(float(campus_poly.area), 2),
            "bounds_campus_xy": [
                round(b_minx - origin_utm_x, 4),
                round(b_miny - origin_utm_y, 4),
                round(b_maxx - origin_utm_x, 4),
                round(b_maxy - origin_utm_y, 4),
            ],
            "campus_exterior": boundary_ext,
            "campus_holes": boundary_holes,
        },
        "buildings": buildings_data,
        "floors": floors_data,
        "rooms": rooms_data,
        "paths": paths_data,
        "amenities": amenities_data,
    }

    metrics_path = OUT_DIR / "gis_processed_metrics.json"
    metrics_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    sql_path = OUT_DIR / "update_buildings_glb.sql"
    sql_path.write_text("\n".join(sql_lines) + "\n", encoding="utf-8")

    # Render a 2D GIS verification plot
    fig, ax = plt.subplots(figsize=(10, 10))
    boundary_utm.plot(ax=ax, color="#dbe7c9", edgecolor="#3b5228", linewidth=2.0, zorder=1)
    paths_utm.plot(ax=ax, color="#555555", linewidth=1.6, alpha=0.8, zorder=2)
    buildings_utm.plot(ax=ax, color="#4a90b8", edgecolor="#16384d", linewidth=1.2, alpha=0.9, zorder=3)
    amenities_utm.plot(ax=ax, color="#e65100", markersize=35, zorder=4)

    for b in buildings_data:
        cx = origin_utm_x + b["centroid_campus_xy"][0]
        cy = origin_utm_y + b["centroid_campus_xy"][1]
        ax.text(
            cx,
            cy,
            f"{b['building_code']}\n({b['total_floors']}F / {b['height_m']}m)",
            ha="center",
            va="center",
            fontsize=8,
            fontweight="bold",
            color="#0d1b2a",
            bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="#16384d", alpha=0.85),
            zorder=5,
        )
        ax.scatter(b["anchor_utm"][0], b["anchor_utm"][1], marker="*", s=60, color="#d32f2f", zorder=6)

    ax.set_title("UIT Campus GIS Footprints (EPSG:32648 - UTM 48N)", fontsize=12, fontweight="bold")
    ax.set_xlabel("Easting (m)")
    ax.set_ylabel("Northing (m)")
    ax.set_aspect("equal")
    ax.grid(True, linestyle="--", alpha=0.4)
    fig.tight_layout()
    preview_path = OUT_DIR / "gis_2d_preview.png"
    fig.savefig(preview_path, dpi=140)
    plt.close(fig)

    print(
        json.dumps(
            {
                "status": "ok",
                "metrics_file": str(metrics_path),
                "sql_file": str(sql_path),
                "preview_png": str(preview_path),
                "buildings": [
                    {
                        "code": b["building_code"],
                        "area_m2": b["area_m2"],
                        "size_m": [b["width_m"], b["depth_m"], b["height_m"]],
                        "anchor_campus_xy": b["anchor_campus_xy"],
                        "dominant_angle_deg": b["dominant_angle_deg"],
                    }
                    for b in buildings_data
                ],
                "counts": {
                    "floors": len(floors_data),
                    "rooms": len(rooms_data),
                    "paths": len(paths_data),
                    "amenities": len(amenities_data),
                },
                "validation": payload["validation"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
