// Bản đồ MapLibre và lớp 3D khuôn viên
import { create } from './campus/scene.js';
import { BASE_PADDING, DEFAULT_CENTER } from './config.js';

export const map = new maplibregl.Map({
  container: 'map',
  center: DEFAULT_CENTER,
  zoom: 16.9,
  pitch: 18,
  bearing: 70,
  attributionControl: false,
  antialias: true,
  maxPitch: 85, // giới hạn của MapLibre 4
  style: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Esri',
      },
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: 'none' },
      },
    ],
  },
});

map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
map.setPadding(BASE_PADDING);

// main.js gắn xử lý khi mô hình tải xong / lỗi (map.js không import module khác để luôn nạp trước)
export const campusHandlers = { onReady() {}, onError() {} };
export const campus = create(map, {
  onReady: () => campusHandlers.onReady(),
  onError: (err) => campusHandlers.onError(err),
});

// Popup neo ở mặt đất (lngLat), đẩy lên đúng điểm ở độ cao z mét (phòng/tiện ích tầng cao); cập nhật mỗi khung hình
let lifted = null;
function placeLifted() {
  if (!lifted) return;
  if (!lifted.popup.isOpen()) {
    lifted = null;
    return;
  }
  const top = campus.project(lifted.lngLat, lifted.z);
  const ground = campus.project(lifted.lngLat, 0);
  if (top && ground) lifted.popup.setOffset([top.x - ground.x, top.y - ground.y - 16]);
}
export function liftPopup(popup, lngLat, z) {
  lifted = z > 0 ? { popup, lngLat, z } : null;
  placeLifted();
}
map.on('render', placeLifted);
