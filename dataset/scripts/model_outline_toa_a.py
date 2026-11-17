#!/usr/bin/env python3
"""Lấy đường viền Tòa A từ mô hình 3D frontend/models/campus.glb.

Mô hình đã được nắn theo ảnh vệ tinh (frontend/campus-scene.js, GEO). Từ lưới độ cao mái:
- main    : khối chính bát giác (mái ~10.5 m, 3 tầng)
- library : cánh Thư viện phía Bắc (mái ~7 m, 2 tầng)
- all     : toàn bộ Tòa A (tầng 1-2)
Khối chính còn được khớp một hình vuông xoay (tâm, góc, nửa cạnh) để đặt sơ đồ phòng khảo sát.

Cần Node.js. Kết quả: dataset/processed/toa_A_model_outline.geojson
"""
import json
import math
import os
import subprocess
import tempfile

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LON0, LAT0, HALF = 106.802962, 10.870515, 80  # tâm vùng quét ~ tâm footprint OSM Tòa A
M_LAT = 110574.0
M_LNG = 111320.0 * math.cos(math.radians(LAT0))


def heightmap():
    out = os.path.join(tempfile.gettempdir(), "toa_a_heightmap.json")
    subprocess.run([
        "node", os.path.join(ROOT, "dataset", "scripts", "extract_model_heightmap.cjs"),
        os.path.join(ROOT, "frontend", "models", "campus.glb"),
        os.path.join(ROOT, "frontend", "vendor", "draco", "draco_decoder.js"),
        out, str(LON0), str(LAT0), str(HALF),
    ], check=True)
    d = json.load(open(out))
    n, cell = d["N"], d["cell"]
    a = np.array(d["hm"]).reshape(n, n)
    xs = np.arange(n) * cell - HALF
    return xs, a


def simplify(pts, tol):
    """Douglas-Peucker cho đường gấp khúc."""
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    nrm = np.hypot(*ab) or 1e-9
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / nrm for p in pts[1:-1]]
    i = int(np.argmax(d)) + 1
    if d[i - 1] <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: i + 1], tol)[:-1] + simplify(pts[i:], tol)


def outline(xs, mask, tol=0.6):
    cs = plt.contour(xs, xs, mask.astype(float), levels=[0.5])
    segs = max(cs.allsegs[0], key=len)
    plt.close("all")
    pts = [tuple(map(float, p)) for p in segs]
    h = len(pts) // 2  # vòng kín: đơn giản hóa hai nửa riêng để đầu/cuối không trùng nhau
    ring = simplify(pts[: h + 1], tol) + simplify(pts[h:], tol)[1:]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def to_lnglat(ring):
    return [[round(float(LON0 + x / M_LNG), 8), round(float(LAT0 + y / M_LAT), 8)] for x, y in ring]


def fit_square(xs, mask):
    """Hình vuông xoay nhỏ nhất ôm khối chính: góc (độ, ngược chiều kim đồng hồ từ trục Đông), tâm, nửa cạnh."""
    yy, xx = np.meshgrid(xs, xs, indexing="ij")
    px, py = xx[mask], yy[mask]
    best = None
    for deg in np.arange(-15, 15.01, 0.25):
        t = math.radians(deg)
        u = px * math.cos(t) + py * math.sin(t)
        v = -px * math.sin(t) + py * math.cos(t)
        area = (u.max() - u.min()) * (v.max() - v.min())
        if best is None or area < best[0]:
            cu, cv = (u.max() + u.min()) / 2, (v.max() + v.min()) / 2
            best = (area, deg, cu * math.cos(t) - cv * math.sin(t), cu * math.sin(t) + cv * math.cos(t),
                    (u.max() - u.min()) / 2, (v.max() - v.min()) / 2)
    return best[1:]


def main():
    xs, a = heightmap()
    yy, xx = np.meshgrid(xs, xs, indexing="ij")
    area = (xx > -45) & (xx < 40) & (yy > -70) & (yy < 50)
    main_m = area & (a > 9.5) & (yy < -2)          # mái khối chính 3 tầng
    lib_m = area & (a > 5.5) & (a < 9.5) & (yy > 4)  # mái cánh Thư viện 2 tầng (kể cả vòm)
    all_m = area & (a > 5.5)
    deg, cx, cy, hu, hv = fit_square(xs, main_m)
    feats = []
    for part, m, roof in (("main", main_m, 10.5), ("library", lib_m, 7.0), ("all", all_m, None)):
        props = {"building_code": "A", "part": part, "roof_height_m": roof,
                 "source": "campus.glb (Heli Ton, CC BY 4.0) - đường viền mái"}
        if part == "main":
            clng, clat = to_lnglat([(cx, cy)])[0]
            props.update({"fit_center": [float(clng), float(clat)], "fit_angle_deg": round(float(deg), 2),
                          "fit_half_x_m": round(float(hu), 2), "fit_half_y_m": round(float(hv), 2)})
        feats.append({"type": "Feature", "properties": props,
                      "geometry": {"type": "Polygon", "coordinates": [to_lnglat(outline(xs, m))]}})
    out = os.path.join(ROOT, "dataset", "processed", "toa_A_model_outline.geojson")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, indent=1)
    print("Da ghi", out, "| fit:", feats[0]["properties"])


if __name__ == "__main__":
    main()
