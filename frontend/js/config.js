// Hằng số dùng chung: API, màu, cấu hình ánh sáng, ranh giới khuôn viên

export const API = 'http://localhost:8000';
// Mặt đất của mô hình campus.glb nằm ở độ cao ~0 m; sàn tầng 1 Tòa A cao hơn một chút
export const GROUND_Z = 0.3;
export const DEFAULT_CENTER = [106.80333, 10.87002];
export const DEFAULT_PITCH = 53;
export const OVERVIEW_ZOOM = 17.62;
export const BASE_PADDING = { top: 60, bottom: 110, left: 0, right: 0 };
export const SHEET_PADDING = { top: 60, bottom: 40, left: 0, right: 420 };
// Tốc độ tự xoay (độ/giây): tổng quan, đang chọn tòa nhà, nút 360°
export const SPIN_OVERVIEW = 0.46;
export const SPIN_SELECTED = 3.15;
export const SPIN_ORBIT = 6;

export const GATE_A = [106.8020546, 10.8704376];
export const GATE_B = [106.8039237, 10.8689966];

export const ROOM_COLORS = {
  Theory: '#3B82F6',
  Lab: '#F97316',
  Library: '#8B5CF6',
  Office: '#10B981',
  Corridor: '#CBD5E1',
  Stairs: '#64748B',
  WC: '#64748B',
};

export const ROOM_LABELS = {
  Theory: 'Phòng lý thuyết',
  Lab: 'Phòng thực hành',
  Library: 'Thư viện',
  Office: 'Văn phòng / Khoa',
  Corridor: 'Hành lang',
  Stairs: 'Cầu thang',
  WC: 'Nhà vệ sinh',
};

export const AMENITY_COLORS = {
  Canteen: '#F97316',
  ATM: '#2563EB',
  Water: '#06B6D4',
  Parking: '#64748B',
  Medical: '#EF4444',
  FireSafety: '#DC2626',
};

export const LIGHTING_MODES = ['day', 'sunset', 'night'];
export const LIGHTING_CONFIG = {
  day: {
    label: 'Ban ngày',
    bodyClass: 'light-day',
    light: { anchor: 'map', color: '#ffffff', intensity: 0.48, position: [1.15, 210, 32] },
    groundColor: '#6f7a5c',
    blockColor: '#d9dde2',
  },
  sunset: {
    label: 'Hoàng hôn',
    bodyClass: 'light-dusk',
    light: { anchor: 'map', color: '#FFB074', intensity: 0.62, position: [1.15, 255, 18] },
    groundColor: '#5d5b40',
    blockColor: '#c9b8a8',
  },
  night: {
    label: 'Ban đêm',
    bodyClass: 'light-night',
    light: { anchor: 'map', color: '#8fa9d6', intensity: 0.28, position: [1.15, 210, 30] },
    groundColor: '#1f2a24',
    blockColor: '#3a4558',
  },
};

export const EMPTY_FC = { type: 'FeatureCollection', features: [] };
// Ranh giới khuôn viên (LOD 1), chép từ dataset/campus_boundary.geojson (OSM way 1303838982).
export const CAMPUS_BOUNDARY_FC = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { id: 'UIT', name: 'Trường Đại học Công nghệ Thông tin' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [106.8016693, 10.8701079], [106.8026322, 10.8688555], [106.8029416, 10.8681458],
        [106.8039263, 10.8688472], [106.8045606, 10.8695156], [106.8051924, 10.8701937],
        [106.8029489, 10.8718309], [106.8027563, 10.8714107], [106.8023241, 10.8708307],
        [106.8016693, 10.8701079],
      ]],
    },
  }],
};

export const prefersReducedMotion = Boolean(
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
