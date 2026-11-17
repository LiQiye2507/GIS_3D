// Góc nhìn camera: tổng quan, chọn tòa nhà, tự xoay
import { BASE_PADDING, DEFAULT_PITCH, OVERVIEW_ZOOM, SHEET_PADDING, SPIN_DEG_PER_SEC, prefersReducedMotion } from './config.js';
import { state } from './state.js';
import { getFeatureCenter } from './utils.js';
import { campus, map } from './map.js';
import { closeBuildingPanel } from './buildings.js';

let idleTimer = null;
let spinLast = 0;
let spinRafId = null;
let spinRate = 0;
export function overviewCamera() {
  const canvas = map.getCanvas();
  const fit = Math.min(canvas.clientWidth / 1536, canvas.clientHeight / 730);
  return {
    center: state.campusCenter,
    zoom: OVERVIEW_ZOOM + Math.log2(Math.max(0.3, fit)),
    pitch: DEFAULT_PITCH,
    // Hướng nhìn tổng quan: camera ở phía Tây Bắc nhìn về Đông Nam (phương vị 230° trong hệ mô hình)
    bearing: campus.modelBearing(-Math.sin((230 * Math.PI) / 180), -Math.cos((230 * Math.PI) / 180)),
    padding: BASE_PADDING,
  };
}

export function startSpin() {
  spinRate = SPIN_DEG_PER_SEC;
  spinLast = performance.now();
  if (spinRafId || prefersReducedMotion) return;
  const tick = (now) => {
    if (!spinRate) {
      spinRafId = null;
      return;
    }
    if (!map.isMoving()) {
      // bearing giảm = cảnh quay cùng chiều kim đồng hồ
      map.setBearing(map.getBearing() - (spinRate * Math.min(now - spinLast, 100)) / 1000);
    }
    spinLast = now;
    spinRafId = requestAnimationFrame(tick);
  };
  spinRafId = requestAnimationFrame(tick);
}

export function stopSpin() {
  spinRate = 0;
  clearTimeout(idleTimer);
}

// Góc nhìn khi chọn tòa nhà: camera nằm phía ngoài (hướng tâm khuôn viên -> tòa nhà, lệch 22°),
// cách hướng mặt trời ít nhất 52° để mặt tiền được chiếu sáng
export function focusCamera(feat) {
  const DEG = Math.PI / 180;
  const anchor = campus.anchor(feat.properties.building_code);
  const center = anchor ? anchor.lngLat : getFeatureCenter(feat);
  const m = campus.lngLatToModel(center[0], center[1]);
  const c = campus.center;
  let ax = m.x - c.x;
  let az = m.z - c.z;
  if (Math.hypot(ax, az) < 1e-3) {
    ax = Math.sin(138 * DEG);
    az = Math.cos(138 * DEG);
  }
  let ang = Math.atan2(ax, az) - 22 * DEG;
  let delta = ang - 58 * DEG;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(delta) < 52 * DEG) ang += (delta === 0 ? 1 : Math.sign(delta)) * (52 * DEG - Math.abs(delta));
  const bearing = campus.modelBearing(-Math.sin(ang), -Math.cos(ang));

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const ring = feat.geometry.type === 'Polygon' ? feat.geometry.coordinates[0] : feat.geometry.coordinates[0][0];
  ring.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });
  const cosLat = Math.cos(center[1] * DEG);
  const extent = Math.max(
    Math.hypot((maxLng - minLng) * 111320 * cosLat, (maxLat - minLat) * 110574),
    (Number(feat.properties.height_m) || 10) * 1.6,
    45
  );
  const canvas = map.getCanvas();
  const viewW = Math.max(320, canvas.clientWidth - SHEET_PADDING.right);
  const zoom = Math.log2((78271.52 * cosLat * viewW * 0.5) / extent);
  return { center, zoom: Math.min(19.6, zoom), pitch: 67, bearing, padding: SHEET_PADDING };
}

// Người dùng thao tác thì dừng tự xoay, rảnh 6 giây thì xoay chậm trở lại
map.on('movestart', (e) => {
  if (!e.originalEvent) return;
  stopSpin();
});
map.on('moveend', (e) => {
  if (!e.originalEvent) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => startSpin(), 6000);
});

// Camera bàn xoay: kéo chuột trái = xoay ngang 360° + nghiêng 0–85° quanh tâm màn hình, kéo chuột phải = di chuyển.
// Chặn mousedown trên canvas trước khi tới MapLibre (vốn kéo trái = di chuyển, kéo phải = xoay); cảm ứng giữ mặc định.
const ORBIT_DEG_PER_PX = 0.4;
const TILT_DEG_PER_PX = 0.3;
const CLICK_TOLERANCE_PX = 3;
let drag = null;
let swallowClick = false;
const mapEl = map.getContainer();
const canvasEl = map.getCanvas();

mapEl.addEventListener('mousedown', (e) => {
  swallowClick = false;
  if (e.target !== canvasEl || (e.button !== 0 && e.button !== 2)) return;
  e.stopPropagation();
  drag = { pan: e.button === 2, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false };
}, true);

window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < CLICK_TOLERANCE_PX) return;
    drag.moved = true;
    canvasEl.style.cursor = 'grabbing';
  }
  if (drag.pan) map.panBy([-dx, -dy], { duration: 0 }, { originalEvent: e });
  else map.jumpTo({ bearing: map.getBearing() - dx * ORBIT_DEG_PER_PX, pitch: map.getPitch() - dy * TILT_DEG_PER_PX }, { originalEvent: e });
});

window.addEventListener('mouseup', () => {
  if (!drag) return;
  if (drag.moved) {
    swallowClick = true; // kéo xong thì không tính là nhấp chọn tòa
    canvasEl.style.cursor = '';
  }
  drag = null;
});

mapEl.addEventListener('click', (e) => {
  if (!swallowClick) return;
  swallowClick = false;
  e.stopPropagation();
}, true);

mapEl.addEventListener('contextmenu', (e) => {
  if (e.target === canvasEl) e.preventDefault();
});

document.getElementById('btn-reset-view').addEventListener('click', () => {
  stopSpin();
  if (state.selectedBuildingIndex >= 0) {
    closeBuildingPanel();
    return;
  }
  map.easeTo({ ...overviewCamera(), duration: 1600 });
  map.once('moveend', () => startSpin());
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});
