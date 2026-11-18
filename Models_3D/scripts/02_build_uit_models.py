"""Build accurate UIT 3D Campus & Standalone Building models from reference_newmap.glb.

Matches https://cs.uitmap.site/ and screeshots_goc_90/ 1:1 in layout, proportions,
Toa E's external 12-floor spiral staircase, Toa E / Toa C separation, sports courts,
and architectural PBR materials/UVs (including Toa A rooftop UIT logos).

Hot-reloaded automatically by live_hot_reload.py (0.5s timer).
"""
from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

CURRENT_STAGE = 5
SCENE_SCALE = 28.0  # 1.7642 * 28.0 = 49.4m height for Toa E (real-world meter scale)

SCRIPTS_DIR = Path(__file__).resolve().parent
MODELS_DIR = SCRIPTS_DIR.parent
REF_GLB = MODELS_DIR / "reference_newmap.glb"
METRICS_PATH = MODELS_DIR / "gis_processed_metrics.json"

# Exact oriented hitboxes from https://cs.uitmap.site/ (uit-building-hitboxes/v1),
# converted to Blender Z-up coordinates (x_bl = x_gltf, y_bl = -z_gltf, z_bl = y_gltf).
BUILDING_DEFS = {
    "Toa_A": {
        "collection": "02_Building_A",
        "root": "Root_Toa_A",
        "glb": "buildings/toa_A.glb",
        "boxes": [
            (-3.4421, -1.1915, 2.58, 2.02, -0.3052),
            (-3.2541, 0.2433, 2.18, 1.38, -0.1406),
            (-2.8365, 1.4199, 1.84, 1.60, -0.3791),
        ],
        "keep_metal_roof_low": True,
        "keep_yellow_high": False,
        "min_z": 0.008,
    },
    "Toa_B": {
        "collection": "03_Building_B",
        "root": "Root_Toa_B",
        "glb": "buildings/toa_B.glb",
        "boxes": [
            (-0.9936, -1.8155, 1.98, 1.02, 0.6256),
            (0.3454, -1.9681, 2.06, 1.06, -0.8158),
        ],
        "keep_metal_roof_low": False,
        "keep_yellow_high": False,
        "min_z": 0.008,
    },
    "Toa_C": {
        "collection": "04_Building_C",
        "root": "Root_Toa_C",
        "glb": "buildings/toa_C.glb",
        "boxes": [
            (-2.8339, -4.8027, 4.44, 1.12, 0.0039),
        ],
        "keep_metal_roof_low": False,
        "keep_yellow_high": False,
        "min_z": 0.008,
    },
    "Toa_D": {
        "collection": "06_Other_Buildings",
        "root": "Root_Toa_D",
        "glb": "buildings/toa_D.glb",
        "boxes": [
            (-0.9724, -7.2248, 1.32, 0.74, 0.4249),
        ],
        "keep_metal_roof_low": True,
        "keep_yellow_high": False,
        "min_z": -0.055,
    },
    "Toa_E": {
        "collection": "05_Building_E",
        "root": "Root_Toa_E",
        "glb": "buildings/toa_E.glb",
        "boxes": [
            (-4.2900, -3.1000, 1.42, 0.72, 0.0749),
        ],
        "keep_metal_roof_low": False,  # walkway at z<0.25 goes to Landscape; roof trim z>1.5 stays in Toa_E
        "keep_yellow_high": False,
        "min_z": 0.008,
    },
    "Nha_PVSV": {
        "collection": "06_Other_Buildings",
        "root": "Root_Nha_PVSV",
        "glb": "buildings/nha_pvsv.glb",
        "boxes": [
            (2.5301, -1.8570, 1.88, 0.92, 0.7184),
            (2.9134, -2.7691, 1.44, 0.78, -0.2712),
            (3.2255, -2.1642, 1.32, 1.06, 0.9592),
        ],
        "keep_metal_roof_low": False,
        "keep_yellow_high": False,
        "min_z": 0.008,
    },
    "Cafe_Voi": {
        "collection": "06_Other_Buildings",
        "root": "Root_Cafe_Voi",
        "glb": "buildings/cafe_voi.glb",
        "boxes": [
            (0.3067, -4.7708, 1.08, 0.80, -1.4969),
        ],
        "keep_metal_roof_low": True,
        "keep_yellow_high": False,
        "min_z": 0.008,
    },
}

ALWAYS_BASE_MATS = {
    "UIT_Grass_Enhanced_Main",
    "UIT_Road_Enhanced_Asphalt",
    "Sree_Complexion_2.001",
    "Sree_Nails_4",
    "J05_Violet_Prism",
}

ALWAYS_LANDSCAPE_MATS = {
    "Color_E08.004",
    "Color_C08.004",
    "A06_Ruby_Spark.004",
    "_auto_1.004",
}

ALL_MANAGED_COLLECTIONS = [
    "01_Campus_Base",
    "02_Building_A",
    "03_Building_B",
    "04_Building_C",
    "05_Building_E",
    "06_Other_Buildings",
    "07_Landscape_Props",
    "08_Indoor_LOD3",
]


def in_oriented_box(x: float, y: float, cx: float, cy: float, sx: float, sy: float, rot_y: float) -> bool:
    dx = x - cx
    dz = (-y) - (-cy)
    ca, sa = math.cos(rot_y), math.sin(rot_y)
    lx = dx * ca - dz * sa
    lz = dx * sa + dz * ca
    return abs(lx) <= sx * 0.5 and abs(lz) <= sy * 0.5


def classify_polygon(verts_orig: list[Vector], center: Vector, nz: float, mat_name: str, obj_name: str) -> str:
    if obj_name.startswith("StreetLamp"):
        return "Landscape_Props"
    if mat_name in ALWAYS_BASE_MATS:
        return "Campus_Base"
    if mat_name in ALWAYS_LANDSCAPE_MATS:
        return "Landscape_Props"

    x, y = center.x, center.y
    min_z = min(v.z for v in verts_orig)
    max_z = max(v.z for v in verts_orig)

    # Keep low terracotta planter curbs & pergola trim in Landscape_Props
    if mat_name == "B03_Apricot_Glow.004" and max_z <= 0.10:
        return "Landscape_Props"

    for b_key, bdef in BUILDING_DEFS.items():
        if max_z <= bdef["min_z"]:
            continue
        if not any(in_oriented_box(x, y, *box) for box in bdef["boxes"]):
            continue
        # Toa_D sits on sloped ground down to z=-0.05: keep vertical wall/window faces below 0.012, route flat slabs to Campus_Base
        if b_key == "Toa_D":
            is_wall_mat = mat_name in (
                "UIT_Wall_White_PBR",
                "UIT_Wall_SupportBlue_PBR",
                "UIT_Wall_MainBlue_PBR",
                "UIT_window_glass",
                "UIT_WindowGlass_Reflective_Web",
            )
            if max_z <= 0.012 and not (is_wall_mat and nz < 0.75):
                return "Campus_Base"
            if mat_name == "UIT_Road_Enhanced_Main" and max_z <= 0.035:
                return "Campus_Base"
        else:
            if max_z <= 0.012:
                return "Campus_Base"
            # For low ground-level faces, require ALL vertices inside hitbox so long sidewalk/lawn triangles stay in Campus_Base
            if max_z < 0.040:
                if not all(any(in_oriented_box(v.x, v.y, *box) for box in bdef["boxes"]) for v in verts_orig):
                    return "Campus_Base"
            # Toa_A: exclude outer plaza/sidewalk stubs beyond Toa_A's podium perimeter and sloped ground-apron triangles
            if b_key == "Toa_A" and max_z < 0.060:
                if x < -4.48 or x > -2.12 or y < -2.05 or (mat_name == "UIT_Wall_White_PBR" and min_z < 0.030 and nz > 0.7):
                    return "Campus_Base"
            # Toa_B: separate detached SW courtyard pergola bench/planter outside Toa_B's facade
            if b_key == "Toa_B" and x < -1.25 and y < -2.48 and max_z < 0.18:
                return "Landscape_Props"
            # Exclude ground-level asphalt/paving slips near building edges
            if mat_name == "UIT_Road_Enhanced_Main" and max_z <= 0.035:
                return "Campus_Base"
            if mat_name == "C01_Vanilla_Cream.004" and max_z <= 0.065:
                return "Campus_Base"
        # Separate covered blue walkways (z < 0.25) from building roofs
        if mat_name == "UIT_Roof_Metal_PBR" and max_z < 0.25 and not bdef["keep_metal_roof_low"]:
            return "Landscape_Props"
        # Keep playground pergolas & flagpoles outside buildings
        if mat_name == "D03_Lemon_Mist.004" and (not bdef["keep_yellow_high"] or max_z <= 0.05):
            return "Landscape_Props"
        return b_key

    if max_z <= 0.012:
        return "Campus_Base"
    # Covered blue canopies & flagpoles outside buildings go to Landscape_Props
    if mat_name in ("UIT_Roof_Metal_PBR", "D03_Lemon_Mist.004") and max_z > 0.04:
        return "Landscape_Props"
    return "Campus_Base"


def ensure_collection(name: str, hide_viewport: bool = False, hide_render: bool = False) -> bpy.types.Collection:
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    col["managed"] = True
    col.hide_viewport = hide_viewport
    col.hide_render = hide_render
    return col


def clear_managed_scene() -> None:
    for col_name in ALL_MANAGED_COLLECTIONS:
        col = bpy.data.collections.get(col_name)
        if col:
            for obj in list(col.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj.get("managed") and not obj.name.startswith("UIT_Sun"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)
    for col_name in ALL_MANAGED_COLLECTIONS:
        ensure_collection(
            col_name,
            hide_viewport=(col_name == "08_Indoor_LOD3"),
            hide_render=(col_name == "08_Indoor_LOD3"),
        )


def build_indoor_lod3_supplement() -> list[str]:
    """Keep Indoor LOD 3 rooms for Toa A and Toa C aligned cleanly in 08_Indoor_LOD3."""
    if not METRICS_PATH.exists():
        return []
    data = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    col = ensure_collection("08_Indoor_LOD3", hide_viewport=True, hide_render=True)
    room_colors = {
        "Theory": (0.24, 0.56, 0.85, 0.85),
        "Lab": (0.18, 0.72, 0.56, 0.85),
        "Office": (0.88, 0.62, 0.24, 0.85),
        "Corridor": (0.76, 0.78, 0.80, 0.70),
        "Stairs": (0.86, 0.30, 0.28, 0.90),
        "WC": (0.58, 0.45, 0.78, 0.85),
        "Floor": (0.68, 0.69, 0.67, 1.0),
    }
    mats = {}
    for k, rgba in room_colors.items():
        mname = f"Mat_LOD3_{k}"
        m = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
        if m.node_tree is None:
            m.use_nodes = True
        m["managed"] = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = rgba
            bsdf.inputs["Roughness"].default_value = 0.5
        mats[k] = m

    from mathutils.geometry import tessellate_polygon

    def extrude_poly(bm, ring_xy, z0, z1):
        if len(ring_xy) < 3 or abs(z1 - z0) < 1e-4:
            return
        ring2d = [Vector((p[0], p[1])) for p in ring_xy]
        tris = tessellate_polygon([ring2d])
        if not tris:
            return
        vb = [bm.verts.new((p.x, p.y, z0)) for p in ring2d]
        vt = [bm.verts.new((p.x, p.y, z1)) for p in ring2d]
        for i0, i1, i2 in tris:
            try:
                bm.faces.new((vb[i0], vb[i2], vb[i1]))
                bm.faces.new((vt[i0], vt[i1], vt[i2]))
            except ValueError:
                pass
        n = len(ring2d)
        for i in range(n):
            j = (i + 1) % n
            try:
                bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
            except ValueError:
                pass

    created = []
    # Align LOD3 roots to the new Toa A and Toa C roots in world space
    align_targets = {
        "A": ("Root_Toa_A", "Root_Toa_A_Indoor_LOD3", -1.45),
        "C": ("Root_Toa_C", "Root_Toa_C_Indoor_LOD3", 0.08),
    }
    for b_code, (ref_root_name, lod_root_name, rot_offset) in align_targets.items():
        ref_root = bpy.data.objects.get(ref_root_name)
        loc = ref_root.location.copy() if ref_root else Vector((0.0, 0.0, 0.0))
        root = bpy.data.objects.new(lod_root_name, None)
        root.empty_display_type = "PLAIN_AXES"
        root.location = loc
        root.rotation_euler = (0.0, 0.0, rot_offset)
        root["managed"] = True
        root.hide_render = True
        col.objects.link(root)

        bms = {}
        for fl in data["floors"]:
            if fl["building_code"] == b_code:
                extrude_poly(bms.setdefault("Floor", bmesh.new()), fl["local_exterior"], fl["base_height"] - 0.15, fl["base_height"] + 0.05)
        for rm in data["rooms"]:
            if rm["building_code"] == b_code:
                rt = rm["room_type"] if rm["room_type"] in mats else "Theory"
                extrude_poly(bms.setdefault(rt, bmesh.new()), rm["local_exterior"], rm["base_height"], rm["extrude_height"])

        for k, bm in bms.items():
            if len(bm.faces) == 0:
                bm.free()
                continue
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            me = bpy.data.meshes.new(f"Toa_{b_code}_LOD3_{k}")
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mats[k])
            ob = bpy.data.objects.new(me.name, me)
            ob["managed"] = True
            ob.hide_render = True
            col.objects.link(ob)
            ob.parent = root
            created.append(ob.name)
    return created


def build_from_reference_glb() -> dict:
    clear_managed_scene()

    # Snapshot existing objects before GLTF import so we can isolate & clean imported hierarchy
    pre_objs = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=str(REF_GLB))
    bpy.context.view_layer.update()
    imported_objs = [bpy.data.objects[name] for name in list(bpy.data.objects.keys()) if name not in pre_objs]

    # Classify every face of each imported mesh and split cleanly preserving UVs & materials
    col_map = {name: ensure_collection(name) for name in ALL_MANAGED_COLLECTIONS}
    bucket_meshes: dict[str, list[bpy.types.Object]] = {
        "Campus_Base": [],
        "Landscape_Props": [],
    }
    for b_key in BUILDING_DEFS:
        bucket_meshes[b_key] = []

    scale_mat = Matrix.Scale(SCENE_SCALE, 4)

    for src_obj in imported_objs:
        if src_obj.type != "MESH" or len(src_obj.data.polygons) == 0:
            continue

        mw_orig = src_obj.matrix_world.copy()
        mats = [m.name if m else "" for m in src_obj.data.materials]

        if src_obj.name.startswith("StreetLamp"):
            # Keep StreetLamps directly as clean scaled objects in 07_Landscape_Props
            me_copy = src_obj.data.copy()
            me_copy.transform(scale_mat @ mw_orig)
            ob = bpy.data.objects.new(src_obj.name, me_copy)
            ob["managed"] = True
            col_map["07_Landscape_Props"].objects.link(ob)
            bucket_meshes["Landscape_Props"].append(ob)
            continue

        # Assign each polygon in src_obj to exactly one target bucket
        poly_buckets: list[str] = []
        buckets_present: set[str] = set()
        verts_data = src_obj.data.vertices
        rot_orig = mw_orig.to_3x3()
        for poly in src_obj.data.polygons:
            verts_orig = [mw_orig @ verts_data[vi].co for vi in poly.vertices]
            c_orig = mw_orig @ poly.center
            nz = abs((rot_orig @ poly.normal).normalized().z)
            m_name = mats[poly.material_index] if poly.material_index < len(mats) else ""
            b_tag = classify_polygon(verts_orig, c_orig, nz, m_name, src_obj.name)
            poly_buckets.append(b_tag)
            buckets_present.add(b_tag)

        for b_tag in buckets_present:
            me_copy = src_obj.data.copy()
            me_copy.transform(scale_mat @ mw_orig)

            # Fast face filtering via bmesh while preserving ALL UV layers, material slots & normals
            bm = bmesh.new()
            bm.from_mesh(me_copy)
            bm.faces.ensure_lookup_table()
            del_faces = [bm.faces[idx] for idx, tag in enumerate(poly_buckets) if tag != b_tag]
            if del_faces:
                bmesh.ops.delete(bm, geom=del_faces, context="FACES")
            # Remove unused loose verts left after face deletion
            loose_verts = [v for v in bm.verts if not v.link_faces]
            if loose_verts:
                bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
            if len(bm.faces) == 0:
                bm.free()
                bpy.data.meshes.remove(me_copy)
                continue
            bm.to_mesh(me_copy)
            bm.free()
            me_copy.update()

            ob = bpy.data.objects.new(f"{b_tag}_{src_obj.name}", me_copy)
            ob["managed"] = True
            target_col_name = (
                "01_Campus_Base"
                if b_tag == "Campus_Base"
                else ("07_Landscape_Props" if b_tag == "Landscape_Props" else BUILDING_DEFS[b_tag]["collection"])
            )
            col_map[target_col_name].objects.link(ob)
            bucket_meshes[b_tag].append(ob)

    # Remove original unsplit imported objects & unused meshes
    for src_obj in imported_objs:
        if src_obj.name in bpy.data.objects:
            bpy.data.objects.remove(src_obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    # Parent each building's meshes under Root_<Building> positioned at its SW corner
    # so standalone GLB exports sit cleanly at (0, 0, 0) while campus scene stays aligned!
    building_summaries = {}
    for b_key, bdef in BUILDING_DEFS.items():
        objs = bucket_meshes[b_key]
        col = col_map[bdef["collection"]]
        if not objs:
            continue
        min_x = min(v.co.x for ob in objs for v in ob.data.vertices)
        min_y = min(v.co.y for ob in objs for v in ob.data.vertices)
        min_z = min(v.co.z for ob in objs for v in ob.data.vertices)
        max_x = max(v.co.x for ob in objs for v in ob.data.vertices)
        max_y = max(v.co.y for ob in objs for v in ob.data.vertices)
        max_z = max(v.co.z for ob in objs for v in ob.data.vertices)

        # Shift geometry to Root-local coordinates anchored at SW ground corner (min_x, min_y, 0.0)
        shift = Matrix.Translation((-min_x, -min_y, 0.0))
        total_polys = 0
        for ob in objs:
            ob.data.transform(shift)
            ob.data.update()
            total_polys += len(ob.data.polygons)

        root = bpy.data.objects.new(bdef["root"], None)
        root.empty_display_type = "PLAIN_AXES"
        root.empty_display_size = 2.0
        root.location = (min_x, min_y, 0.0)
        root["managed"] = True
        col.objects.link(root)
        for ob in objs:
            ob.parent = root

        building_summaries[b_key] = {
            "root": bdef["root"],
            "objects": len(objs),
            "polys": total_polys,
            "world_min": [round(min_x, 3), round(min_y, 3), round(min_z, 3)],
            "world_max": [round(max_x, 3), round(max_y, 3), round(max_z, 3)],
            "size_m": [round(max_x - min_x, 2), round(max_y - min_y, 2), round(max_z - min_z, 2)],
        }

    lod3_objs = build_indoor_lod3_supplement()

    # Tune world background & key sun for crisp AgX look matching cs.uitmap.site
    scene = bpy.context.scene
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Punchy"
    except Exception:
        pass
    world = scene.world
    if world and world.node_tree:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs["Color"].default_value = (0.085, 0.11, 0.145, 1.0)
            bg.inputs["Strength"].default_value = 1.5

    return {
        "building_summaries": building_summaries,
        "campus_base_objects": len(bucket_meshes["Campus_Base"]),
        "landscape_objects": len(bucket_meshes["Landscape_Props"]),
        "lod3_objects": len(lod3_objs),
    }


def build_stage() -> dict:
    summary = build_from_reference_glb()
    export_report = None
    if CURRENT_STAGE >= 5:
        verify_path = SCRIPTS_DIR / "03_render_and_verify.py"
        spec = importlib.util.spec_from_file_location("uit_render_verify", str(verify_path))
        mod = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(mod)
        export_report = mod.export_all_and_verify()

    return {
        "stage": CURRENT_STAGE,
        "summary": "Synchronized 1:1 with cs.uitmap.site NewMap.glb & uit-building-hitboxes/v1 + full verification",
        "details": summary,
        "export_report": export_report,
    }


if __name__ == "__main__":
    build_stage()
