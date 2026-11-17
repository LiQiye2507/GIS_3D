"""Step 3: Export .blend, full-campus GLB, standalone building GLBs, and render verification views.

Can be invoked automatically by 02_build_uit_models.py inside the live Blender GUI
or run standalone via:
    blender Models_3D/uit_campus_full.blend --background --python Models_3D/scripts/03_render_and_verify.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

MODELS_DIR = Path(__file__).resolve().parents[1]
BUILDINGS_DIR = MODELS_DIR / "buildings"
RENDERS_DIR = MODELS_DIR / "renders"
REPORT_PATH = MODELS_DIR / "build_report.json"


def select_hierarchy(root_obj: bpy.types.Object) -> int:
    bpy.ops.object.select_all(action="DESELECT")
    stack = [root_obj]
    count = 0
    while stack:
        ob = stack.pop()
        stack.extend(list(ob.children))
        ob.hide_set(False)
        ob.select_set(True)
        count += 1
    bpy.context.view_layer.objects.active = root_obj
    return count


def export_root_glb(root_name: str, out_path: Path, collection_name: str | None = None) -> dict:
    root_obj = bpy.data.objects[root_name]
    col = bpy.data.collections.get(collection_name) if collection_name else None
    was_hidden = col.hide_viewport if col else False
    if col and was_hidden:
        col.hide_viewport = False

    saved_loc = root_obj.location.copy()
    root_obj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()

    node_count = select_hierarchy(root_obj)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )

    root_obj.location = saved_loc
    if col and was_hidden:
        col.hide_viewport = True
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.update()

    return {
        "file": str(out_path),
        "bytes": out_path.stat().st_size,
        "nodes": node_count,
    }


def export_full_campus_glb(out_path: Path) -> dict:
    bpy.ops.object.select_all(action="DESELECT")
    target_cols = [
        "01_Campus_Base",
        "02_Building_A",
        "03_Building_B",
        "04_Building_C",
        "05_Building_E",
        "06_Other_Buildings",
        "07_Landscape_Props",
    ]
    count = 0
    for cname in target_cols:
        col = bpy.data.collections.get(cname)
        if not col:
            continue
        for ob in col.objects:
            ob.hide_set(False)
            ob.select_set(True)
            count += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    bpy.ops.object.select_all(action="DESELECT")
    return {
        "file": str(out_path),
        "bytes": out_path.stat().st_size,
        "nodes": count,
    }


def render_verification_views() -> list[dict]:
    scene = bpy.context.scene
    RENDERS_DIR.mkdir(parents=True, exist_ok=True)

    prev_engine = scene.render.engine
    prev_cam = scene.camera
    prev_rx, prev_ry = scene.render.resolution_x, scene.render.resolution_y

    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 16
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 840
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"

    cam_data = bpy.data.cameras.new("_VerifyCam")
    cam_data.clip_start = 0.5
    cam_data.clip_end = 5000.0
    cam_ob = bpy.data.objects.new("_VerifyCam", cam_data)
    scene.collection.objects.link(cam_ob)
    scene.camera = cam_ob

    # All coordinates match SCENE_SCALE = 28.0 world space
    views = [
        ("00_top_down_90_deg.png", (-42.0, -28.0, 560.0), None, 35.0, (0.0, 0.0, math.radians(180.0))),
        ("01_toan_canh_ngay.png", (-195.0, 175.0, 210.0), (-45.0, -35.0, 5.0), 34.0, None),
        ("04_toa_E.png", (-185.0, -45.0, 48.0), (-118.0, -88.0, 22.0), 38.0, None),
        ("04b_toa_E_cau_thang_xoan.png", (-178.0, -108.0, 28.0), (-118.0, -95.0, 16.0), 42.0, None),
        ("05_toa_A.png", (-165.0, 38.0, 55.0), (-88.0, -4.0, 8.0), 35.0, None),
        ("06_toa_B.png", (-35.0, -105.0, 42.0), (-8.0, -52.0, 14.0), 36.0, None),
        ("07_toa_C.png", (-78.0, -210.0, 48.0), (-78.0, -134.0, 8.0), 35.0, None),
        ("08_nha_an.png", (142.0, -115.0, 42.0), (78.0, -60.0, 8.0), 36.0, None),
        ("09_cafe_voi.png", (52.0, -182.0, 30.0), (8.0, -132.0, 4.0), 40.0, None),
        ("10_toa_D.png", (-64.0, -245.0, 24.0), (-27.0, -202.0, 3.0), 42.0, None),
    ]

    rendered = []
    for fname, loc, tgt, lens, fixed_euler in views:
        cam_data.lens = lens
        cam_ob.location = Vector(loc)
        if fixed_euler is not None:
            cam_ob.rotation_euler = fixed_euler
        else:
            cam_ob.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        out_png = RENDERS_DIR / fname
        scene.render.filepath = str(out_png)
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
        rendered.append({"file": str(out_png), "bytes": out_png.stat().st_size})

    scene.camera = prev_cam
    scene.render.engine = prev_engine
    scene.render.resolution_x, scene.render.resolution_y = prev_rx, prev_ry
    bpy.data.objects.remove(cam_ob, do_unlink=True)
    bpy.data.cameras.remove(cam_data)
    return rendered


def export_all_and_verify() -> dict:
    blend_path = MODELS_DIR / "uit_campus_full.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)

    standalone_specs = [
        ("Root_Toa_A", "toa_A.glb", "02_Building_A"),
        ("Root_Toa_B", "toa_B.glb", "03_Building_B"),
        ("Root_Toa_C", "toa_C.glb", "04_Building_C"),
        ("Root_Toa_D", "toa_D.glb", "06_Other_Buildings"),
        ("Root_Toa_E", "toa_E.glb", "05_Building_E"),
        ("Root_Nha_PVSV", "nha_pvsv.glb", "06_Other_Buildings"),
        ("Root_Cafe_Voi", "cafe_voi.glb", "06_Other_Buildings"),
        ("Root_Toa_A_Indoor_LOD3", "toa_A_indoor_lod3.glb", "08_Indoor_LOD3"),
        ("Root_Toa_C_Indoor_LOD3", "toa_C_indoor_lod3.glb", "08_Indoor_LOD3"),
    ]
    building_exports = {}
    for root_name, fname, col_name in standalone_specs:
        if root_name in bpy.data.objects:
            building_exports[fname] = export_root_glb(root_name, BUILDINGS_DIR / fname, col_name)

    full_glb = export_full_campus_glb(MODELS_DIR / "uit_campus_full.glb")
    renders = render_verification_views()

    report = {
        "status": "ok",
        "blend_file": {"file": str(blend_path), "bytes": blend_path.stat().st_size},
        "full_glb": full_glb,
        "buildings_glb": building_exports,
        "renders": renders,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


if __name__ == "__main__":
    export_all_and_verify()
