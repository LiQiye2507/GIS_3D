"""Hot-reload listener running inside live GUI Blender via bpy.app.timers (0.5s).

Launch directly via:
    blender --python Models_3D/scripts/live_hot_reload.py

Sets up Material Preview + AgX + campus-scale clip_end once on startup, then
watches Models_3D/scripts/02_build_uit_models.py every 0.5 seconds without ever
resetting the user's 3D viewport camera orientation/zoom.
"""
from __future__ import annotations

import importlib.util
import json
import math
import time
import traceback
from pathlib import Path

import bpy
from mathutils import Euler, Vector

SCRIPTS_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPTS_DIR.parent
BUILD_SCRIPT = SCRIPTS_DIR / "02_build_uit_models.py"
STATUS_FILE = MODELS_DIR / "hot_reload_status.json"

_STATE = {
    "last_mtime_ns": -1,
    "reload_count": 0,
    "view_initialized": False,
}


def write_status(payload: dict) -> None:
    payload["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    payload["reload_count"] = _STATE["reload_count"]
    STATUS_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def setup_initial_scene_and_viewport() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    # Clear factory startup Cube / Light / Camera so we start cleanly
    for obj in list(bpy.data.objects):
        if not obj.get("managed"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    # Color management matching AgX lookdev
    vs = scene.view_settings
    vs.view_transform = "AgX"
    try:
        vs.look = "AgX - Punchy"
    except Exception:
        pass
    vs.exposure = 0.0

    # World sky / clean dark studio slate matching screenshots
    world = bpy.data.worlds.get("UIT_World") or bpy.data.worlds.new("UIT_World")
    scene.world = world
    if world.node_tree is None:
        world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.045, 0.055, 0.075, 1.0)
        bg.inputs["Strength"].default_value = 0.9

    # Ensure lighting collection
    light_col = bpy.data.collections.get("00_Lighting")
    if light_col is None:
        light_col = bpy.data.collections.new("00_Lighting")
        scene.collection.children.link(light_col)

    def ensure_sun(name: str, energy: float, color: tuple, rot_deg: tuple, angle_rad: float):
        if bpy.data.objects.get(name):
            return
        ld = bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.color = color
        ld.angle = angle_rad
        ob = bpy.data.objects.new(name, ld)
        ob["managed"] = True
        ob.rotation_euler = [math.radians(a) for a in rot_deg]
        light_col.objects.link(ob)

    # Warm sunlight from South-West/South matching shadows in screenshots
    ensure_sun("UIT_Sun_Key", 4.5, (1.0, 0.96, 0.90), (48.0, 12.0, -35.0), 0.025)
    ensure_sun("UIT_Sun_Fill", 0.85, (0.68, 0.80, 1.0), (-55.0, 0.0, 145.0), 0.35)

    # Configure viewport once (never reset on subsequent hot-reloads!)
    configure_viewport_once()


def configure_viewport_once() -> None:
    if _STATE["view_initialized"]:
        return
    wm = getattr(bpy.context, "window_manager", None)
    if not wm:
        return
    for win in wm.windows:
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.clip_start = 0.2
                space.clip_end = 5000.0
                space.shading.type = "MATERIAL"
                space.shading.use_scene_lights = True
                space.shading.use_scene_world = True
                rv3d = space.region_3d
                if rv3d is not None:
                    rv3d.view_perspective = "PERSP"
                    rv3d.view_location = Vector((0.0, 0.0, 8.0))
                    rv3d.view_distance = 420.0
                    # Elevated panoramic angle similar to 01_toan_canh_ngay.jpg
                    rv3d.view_rotation = Euler(
                        (math.radians(52.0), 0.0, math.radians(-18.0)), "XYZ"
                    ).to_quaternion()
                _STATE["view_initialized"] = True


def redraw_all_3d_views() -> None:
    wm = getattr(bpy.context, "window_manager", None)
    if not wm:
        return
    for win in wm.windows:
        for area in win.screen.areas:
            if area.type == "VIEW_3D":
                area.tag_redraw()


def run_build_script(mtime_ns: int) -> None:
    spec = importlib.util.spec_from_file_location("uit_build_stage", str(BUILD_SCRIPT))
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    details = mod.build_stage()
    _STATE["reload_count"] += 1
    _STATE["last_mtime_ns"] = mtime_ns
    redraw_all_3d_views()
    write_status(
        {
            "status": "ok",
            "mtime_ns": mtime_ns,
            "stage": details.get("stage") if isinstance(details, dict) else None,
            "objects_count": len(bpy.data.objects),
            "meshes_count": len(bpy.data.meshes),
            "collections": [c.name for c in bpy.data.collections],
            "details": details,
        }
    )


def poll_and_reload() -> float:
    try:
        if not _STATE["view_initialized"]:
            configure_viewport_once()
        if BUILD_SCRIPT.exists():
            stat = BUILD_SCRIPT.stat()
            if stat.st_mtime_ns != _STATE["last_mtime_ns"]:
                run_build_script(stat.st_mtime_ns)
    except Exception as exc:
        # Update last_mtime_ns so we don't spin infinitely on the same error; wait for next edit
        if BUILD_SCRIPT.exists():
            _STATE["last_mtime_ns"] = BUILD_SCRIPT.stat().st_mtime_ns
        write_status(
            {
                "status": "error",
                "error": str(exc),
                "traceback": traceback.format_exc(),
                "mtime_ns": _STATE["last_mtime_ns"],
            }
        )
    return 0.5


def main() -> None:
    setup_initial_scene_and_viewport()
    write_status({"status": "ready", "stage": 0, "message": "Hot-reload listener started (0.5s interval)"})
    if not bpy.app.timers.is_registered(poll_and_reload):
        bpy.app.timers.register(poll_and_reload, first_interval=0.5, persistent=True)


if __name__ == "__main__":
    main()
