// Dẫn đường liên tầng
import { GATE_A, GROUND_Z } from './config.js';
import { state } from './state.js';
import { routeSummaryEl } from './dom.js';
import { api, showToast } from './utils.js';
import { map } from './map.js';
import { setFloor } from './layers.js';
import { stopSpin } from './camera.js';

export function buildRoute3dPolygons(routeFc) {
  const features = [];
  routeFc.features.forEach((feat) => {
    const { path_type: pathType } = feat.properties;
    const coords = feat.geometry && feat.geometry.coordinates;
    if (!coords || coords.length < 2) return;

    for (let i = 0; i < coords.length - 1; i += 1) {
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const midLatRad = (((p1[1] + p2[1]) / 2) * Math.PI) / 180;
      const mPerDegLng = 111320 * Math.cos(midLatRad);
      const dx = (p2[0] - p1[0]) * mPerDegLng;
      const dy = (p2[1] - p1[1]) * 111320;
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;

      const offLng = ((-dy / len) * 0.4) / mPerDegLng;
      const offLat = ((dx / len) * 0.4) / 111320;
      const rawZ = p1[2] ?? 0;
      const base = GROUND_Z + (pathType === 'Walkway' ? Math.max(0.36, rawZ) : rawZ);

      features.push({
        type: 'Feature',
        properties: { base, height: base + 0.3 },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [p1[0] + offLng, p1[1] + offLat],
            [p2[0] + offLng, p2[1] + offLat],
            [p2[0] - offLng, p2[1] - offLat],
            [p1[0] - offLng, p1[1] - offLat],
            [p1[0] + offLng, p1[1] + offLat],
          ]],
        },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}

function fitSegments(features) {
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((f) => (f.geometry.coordinates || []).forEach((c) => bounds.extend([c[0], c[1]])));
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, pitch: 60, maxZoom: 19.5 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let playToken = 0;

// Xem toàn tuyến, rồi lần lượt bật từng tầng tuyến đi qua (mỗi tầng 2.5 s), dừng ở tầng của phòng đích
async function playRouteByFloor(routeFc) {
  const token = ++playToken;
  stopSpin();
  setFloor(null);
  fitSegments(routeFc.features);
  if (routeFc.floors.length < 2) return;
  for (const floor of routeFc.floors) {
    await sleep(2500);
    if (token !== playToken) return;
    setFloor(floor);
    fitSegments(routeFc.features.filter((f) => f.properties.floor_from === floor || f.properties.floor_to === floor));
  }
}

document.getElementById('btn-route').addEventListener('click', async () => {
  if (!state.selectedRoom || !state.selectedRoom.room_code) {
    showToast('Vui lòng chọn phòng đích trước', true);
    return;
  }
  const start = state.userPos || GATE_A;
  if (!state.userPos) {
    showToast('Chưa chọn vị trí giả lập, xuất phát từ Cổng A');
  }
  try {
    const routeFc = await api(
      `/api/route?start_lng=${start[0]}&start_lat=${start[1]}&end_room_code=${encodeURIComponent(state.selectedRoom.room_code)}`
    );
    if (map.getSource('route')) {
      map.getSource('route').setData(routeFc);
    }
    if (map.getSource('route-3d')) {
      map.getSource('route-3d').setData(buildRoute3dPolygons(routeFc));
    }
    // Đĩa bán kính (cao 1.2–1.35 m) che mất tuyến đi bộ sát mặt đất
    map.setLayoutProperty('radius-circle', 'visibility', 'none');

    // Đi bộ 1.2 m/s, cộng 15 giây cho mỗi tầng phải leo
    const minutes = Math.max(1, Math.ceil((routeFc.total_length_m / 1.2 + 15 * (routeFc.floors.length - 1)) / 60));
    routeSummaryEl.textContent = `Quãng đường: ${routeFc.total_length_m} m · khoảng ${minutes} phút đi bộ · Qua tầng ${routeFc.floors.join(' → ')}`
      + (routeFc.reaches_room ? '' : ` · Tòa ${state.selectedRoom.building_code} chưa có dữ liệu đường đi trong nhà, tuyến dừng ở lối vào`);
    routeSummaryEl.classList.remove('hidden');

    playRouteByFloor(routeFc);
  } catch (err) {
    console.error(err);
  }
});
