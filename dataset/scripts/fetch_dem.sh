#!/usr/bin/env bash
# Tải DEM Copernicus GLO-30 (COP30, ~30 m) quanh UIT.
# Cách 1 (khuyên dùng): OpenTopography API, cần API key miễn phí (opentopography.org).
#   export OPENTOPO_API_KEY=xxxx
#   bash fetch_dem.sh
# Cách 2: tải thẳng tile 1x1 độ từ bucket công khai AWS rồi cắt bằng GDAL (xem cuối file).
#
# Khung bao dưới đây là vùng đệm ~1 km quanh vị trí GẦN ĐÚNG của UIT, chưa kiểm chứng.
# Thu hẹp lại sau khi xác định ranh trường trên QGIS/OSM.
# Copernicus DEM là DSM (gồm cả nhà và cây) và chỉ 30 m/pixel; khuôn viên ~13 ha chỉ vài trăm pixel.
# Ghi nguồn theo giấy phép Copernicus DEM khi công bố.
set -euo pipefail

: "${OPENTOPO_API_KEY:?Hãy đặt biến OPENTOPO_API_KEY}"
SOUTH=${SOUTH:-10.860}
NORTH=${NORTH:-10.880}
WEST=${WEST:-106.793}
EAST=${EAST:-106.813}
OUT=${OUT:-../01_raster}

mkdir -p "$OUT"
curl -fL "https://portal.opentopography.org/API/globaldem?demtype=COP30&south=${SOUTH}&north=${NORTH}&west=${WEST}&east=${EAST}&outputFormat=GTiff&API_Key=${OPENTOPO_API_KEY}" \
  -o "$OUT/dem_cop30_uit.tif"
echo "Đã lưu $OUT/dem_cop30_uit.tif"

# Tùy chọn, cần GDAL: tạo bản đổ bóng và đường đồng mức 1 m
# gdaldem hillshade "$OUT/dem_cop30_uit.tif" "$OUT/hillshade_uit.tif"
# gdal_contour -a elev -i 1 "$OUT/dem_cop30_uit.tif" "$OUT/contour_1m.gpkg"

# Cách 2: tile N10 E106 (10-11 độ Bắc, 106-107 độ Đông) từ AWS
# curl -fLO https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N10_00_E106_00_DEM/Copernicus_DSM_COG_10_N10_00_E106_00_DEM.tif
# gdal_translate -projwin $WEST $NORTH $EAST $SOUTH Copernicus_DSM_COG_10_N10_00_E106_00_DEM.tif "$OUT/dem_cop30_uit.tif"
