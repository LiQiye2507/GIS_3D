"""Xuất model campus cho web: nạp uit_campus_full.glb, xuất lại có nén Draco ra frontend/models/uit_campus.glb.

Chạy: blender -b -P Models_3D/scripts/05_export_web_glb.py
File gốc trong Models_3D/ không bị sửa.
"""
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'Models_3D' / 'uit_campus_full.glb'
OUT = ROOT / 'frontend' / 'models' / 'uit_campus.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC))
bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format='GLB',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_image_format='WEBP',
    export_yup=True,
)
print(f'EXPORTED {OUT} {OUT.stat().st_size} bytes')
