// Dẫn đường liên tầng
import { GATE_A, GROUND_Z } from './config.js';
import { state } from './state.js';
import { routeSummaryEl } from './dom.js';
import { api, showToast } from './utils.js';
import { campus, map } from './map.js';
import { setFloor } from './layers.js';
import { stopSpin } from './camera.js';
import { onFrameChange, warpFc } from './frame.js';
import { setPlacesPanelOpen } from './buildings.js';

const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

// Độ cao (m) cần đặt đáy khối tuyến để nằm trên mặt mô hình giữa hai điểm a, b (lấy mặt cao nhất ở 3 điểm)
function liftOverModel(a, b) {
  if (!campus.groundHeight) return 0;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return Math.max(campus.groundHeight(a), campus.groundHeight(mid), campus.groundHeight(b)) + 0.12;
}

export function buildRoute3dPolygons(routeFc, connectorsOnly = false) {
  const features = [];
  routeFc.features.forEach((feat) => {
    const { path_type: pathType } = feat.properties;
    if ((pathType === 'Connector') !== connectorsOnly) return;
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

      const dashLength = 4;
      const dashPeriod = 7;
      const intervals = pathType === 'Connector'
        ? Array.from({ length: Math.ceil(len / dashPeriod) }, (_, dash) => [
          dash * dashPeriod,
          Math.min(dash * dashPeriod + dashLength, len),
        ])
        // khúc ~2 m để bám theo độ cao mặt sân / bậc thềm của mô hình (xem liftOverModel)
        : Array.from({ length: Math.ceil(len / 2) }, (_, k) => [(k * len) / Math.ceil(len / 2), ((k + 1) * len) / Math.ceil(len / 2)]);

      intervals.forEach(([from, to]) => {
        if (to - from < 0.05) return;
        const interpolate = (distance) => {
          const fraction = distance / len;
          return [
            p1[0] + (p2[0] - p1[0]) * fraction,
            p1[1] + (p2[1] - p1[1]) * fraction,
            (p1[2] ?? 0) + ((p2[2] ?? 0) - (p1[2] ?? 0)) * fraction,
          ];
        };
        const a = interpolate(from);
        const b = interpolate(to);
        const offLng = ((-dy / len) * 0.4) / mPerDegLng;
        const offLat = ((dx / len) * 0.4) / 111320;
        const rawZ = (a[2] + b[2]) / 2;
        let base = GROUND_Z + (pathType === 'Walkway' ? Math.max(0.36, rawZ) : rawZ);
        // Ngoài trời: nâng lên trên mặt mô hình (quảng trường, bậc thềm cao hơn mặt đất) để tuyến không chìm mất
        if (rawZ < 1) base = Math.max(base, liftOverModel(a, b));

        features.push({
          type: 'Feature',
          properties: { base, height: base + 0.3 },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [a[0] + offLng, a[1] + offLat],
              [b[0] + offLng, b[1] + offLat],
              [b[0] - offLng, b[1] - offLat],
              [a[0] - offLng, a[1] - offLat],
              [a[0] + offLng, a[1] + offLat],
            ]],
          },
        });
      });
    }
  });
  return { type: 'FeatureCollection', features };
}

// Nhìn theo hướng xuất phát -> đích (camera đứng sau điểm xuất phát) để tòa khác không chắn tuyến;
// chừa chỗ cho ngăn trái (máy tính) hoặc ngăn trượt dưới đáy (điện thoại)
function fitSegments(features, bearing) {
  const bounds = new maplibregl.LngLatBounds();
  features.forEach((f) => (f.geometry.coordinates || []).forEach((c) => bounds.extend([c[0], c[1]])));
  if (bounds.isEmpty()) return;
  const drawerOpen = !document.getElementById('places-panel').classList.contains('hidden');
  const padding = isMobile()
    ? { top: 110, bottom: drawerOpen ? innerHeight * 0.5 + 70 : 90, left: 20, right: 20 }
    : { top: 90, bottom: 60, left: drawerOpen ? 500 : 80, right: document.body.classList.contains('is-sheet-open') ? 420 : 160 };
  // MapLibre cộng dồn padding còn giữ từ lần bay camera trước (chọn phòng/tòa) -> vượt khung, fitBounds bị bỏ qua
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds(bounds, { padding, pitch: 55, bearing, maxZoom: 19 });
}

function routeBearing(features) {
  if (!features.length) return undefined; // fitBounds giữ hướng hiện tại
  const s =features[0].geometry.coordinates[0];
  const e = features[features.length - 1].geometry.coordinates.at(-1);
  return (Math.atan2((e[0] - s[0]) * Math.cos((s[1] * Math.PI) / 180), e[1] - s[1]) * 180) / Math.PI;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let playToken = 0;

function drawRoute(routeFc) {
  if (map.getSource('route')) map.getSource('route').setData(routeFc);
  if (map.getSource('route-3d')) map.getSource('route-3d').setData(buildRoute3dPolygons(routeFc));
  if (map.getSource('route-connectors-3d')) {
    map.getSource('route-connectors-3d').setData(buildRoute3dPolygons(routeFc, true));
  }
}
let lastRoute = null;
onFrameChange(() => { if (lastRoute) drawRoute(lastRoute); });

// Xem toàn tuyến, rồi lần lượt bật từng tầng tuyến đi qua (mỗi tầng 2.5 s), dừng ở tầng của phòng đích
// và quay lại khung toàn tuyến (đoạn ở tầng đích thường rất ngắn, nằm trong khối phòng)
async function playRouteByFloor(routeFc) {
  const token = ++playToken;
  const bearing = routeBearing(routeFc.features);
  stopSpin();
  setFloor(null);
  fitSegments(routeFc.features, bearing);
  if (routeFc.floors.length < 2) return;
  for (const floor of routeFc.floors) {
    await sleep(2500);
    if (token !== playToken) return;
    setFloor(floor);
    fitSegments(routeFc.features.filter((f) => f.properties.floor_from === floor || f.properties.floor_to === floor), bearing);
  }
  await sleep(2500);
  if (token === playToken) fitSegments(routeFc.features, bearing);
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
    const routeFc = warpFc(await api(
      `/api/route?start_lng=${start[0]}&start_lat=${start[1]}&end_room_code=${encodeURIComponent(state.selectedRoom.room_code)}`
    ), 'route');
    lastRoute = routeFc;
    drawRoute(routeFc);
    // Đĩa bán kính (cao 1.2–1.35 m) che mất tuyến đi bộ sát mặt đất
    map.setLayoutProperty('radius-circle', 'visibility', 'none');

    const minutes = Math.max(1, Math.ceil(routeFc.walk_seconds / 60));
    routeSummaryEl.textContent = `Quãng đường: ${routeFc.total_length_m} m · khoảng ${minutes} phút đi bộ · Qua tầng ${routeFc.floors.join(' → ')}`
      + (routeFc.reaches_room ? '' : ` · Tòa ${state.selectedRoom.building_code} chưa có dữ liệu đường đi trong nhà, tuyến dừng ở lối vào`);
    routeSummaryEl.classList.remove('hidden');
    // Điện thoại: ngăn trượt + popup che gần hết bản đồ -> thu lại, tóm tắt đưa lên thông báo
    if (isMobile()) {
      setPlacesPanelOpen(false);
      if (state.activePopup) state.activePopup.remove();
      showToast(routeSummaryEl.textContent);
    }

    const startConnector = routeFc.features.find((feature) => feature.properties.path_type === 'Connector');
    if (startConnector && startConnector.properties.floor_from === 1
      && startConnector.properties.seq === 0 && startConnector.properties.length_m > 50) {
      showToast(`Vị trí xuất phát cách lối đi gần nhất ${Math.round(startConnector.properties.length_m)} m`);
    }

    playRouteByFloor(routeFc);
  } catch (err) {
    console.error(err);
  }
});
