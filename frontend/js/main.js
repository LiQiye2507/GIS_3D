// Điểm vào: khởi tạo và nạp dữ liệu khi bản đồ sẵn sàng
import { CAMPUS_BOUNDARY_FC, EMPTY_FC, INDOOR_CODES } from './config.js';
import { state } from './state.js';
import { btnInfoCloseEl, btnInfoEl, infoPopoverEl, introStatsEl, placesCountEl, placesPanelSummaryEl, placesSummaryEl, tourCardSubEl } from './dom.js';
import { api, showToast } from './utils.js';
import { campus, campusHandlers, map } from './map.js';
import { markIntroStep } from './intro.js';
import { addGateMarkers, applyLod, initLayers, renderFloorSwitcher, setIndoorBuilding, setLighting } from './layers.js';
import { closeBuildingPanel, renderBuildingsList, setPlacesPanelOpen } from './buildings.js';
import { setAllAmenities, updateRadiusVisual } from './amenities.js';
import { initSportsLayer } from './sports.js';
import { setFrameFootprints, warpFc } from './frame.js';
import { buildSearchIndex } from './search.js';
import { applyDeepLink } from './share.js';
import { renderFloorOptions } from './query.js';
import './camera.js';
import './rooms.js';
import './route.js';
import './geolocate.js';
import './nearest.js';
import './measure.js';

campusHandlers.onReady = () => {
  state.campusCenter = campus.modelToLngLat(campus.center.x, campus.center.z);
  markIntroStep('glb');
};
campusHandlers.onError = () => {
  state.campusLoadFailed = true;
  showToast('Không tải được mô hình 3D khuôn viên', true);
  markIntroStep('glb');
  applyLod(1);
};

function setInfoPopoverOpen(open) {
  infoPopoverEl.classList.toggle('hidden', !open);
  btnInfoEl.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('is-credits-open', open);
}

btnInfoEl.addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = infoPopoverEl.classList.contains('hidden');
  setInfoPopoverOpen(isHidden);
});

if (btnInfoCloseEl) {
  btnInfoCloseEl.addEventListener('click', () => {
    setInfoPopoverOpen(false);
  });
}

document.addEventListener('click', (e) => {
  if (!infoPopoverEl.classList.contains('hidden') && !infoPopoverEl.contains(e.target) && e.target !== btnInfoEl) {
    setInfoPopoverOpen(false);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    setPlacesPanelOpen(false);
    setInfoPopoverOpen(false);
    closeBuildingPanel();
  }
});

addGateMarkers();
setLighting(state.currentLighting);
updateRadiusVisual();

map.on('load', async () => {
  markIntroStep('map');
  try {
    const [buildingsFc, roomsList, amenitiesFc, sportsFc] = await Promise.all([
      api('/api/buildings').finally(() => markIntroStep('buildings')),
      // Tòa có nội thất LOD 3; Tòa A bắt buộc, các tòa khác lỗi thì bỏ qua
      Promise.all(INDOOR_CODES.map((code) => (code === 'A'
        ? api('/api/rooms?building_code=A')
        : api(`/api/rooms?building_code=${code}`).catch(() => EMPTY_FC)))).finally(() => markIntroStep('rooms')),
      api('/api/amenities/nearby?lat=10.8700&lng=106.8030&radius=500').catch((err) => {
        console.error(err);
        return EMPTY_FC;
      }),
      api('/api/sports-fields').catch(() => EMPTY_FC),
    ]);
    const roomsFc = { type: 'FeatureCollection', features: roomsList.flatMap((fc) => fc.features) };
    // CSDL lưu vị trí thật; sơ đồ model cần dời dữ liệu về vị trí mô hình (frame.js)
    setFrameFootprints(buildingsFc);
    warpFc(buildingsFc, 'buildings');
    warpFc(roomsFc, 'rooms');
    warpFc(amenitiesFc, 'amenities');
    warpFc(sportsFc, 'sports');
    initLayers(buildingsFc, roomsFc, CAMPUS_BOUNDARY_FC);
    initSportsLayer(sportsFc);
    setAllAmenities(amenitiesFc);
    renderBuildingsList(buildingsFc, amenitiesFc);
    buildSearchIndex(amenitiesFc, sportsFc);
    const bCount = buildingsFc.features.length;
    const rCount = roomsFc.features.length;
    const aCount = amenitiesFc.features.filter((f) => !f.properties.room_code).length;
    state.defaultPlacesCount = String(bCount).padStart(2, '0');
    state.defaultPlacesSummary = `${bCount} địa điểm · ${aCount} tiện ích`;
    placesCountEl.textContent = state.defaultPlacesCount;
    placesSummaryEl.textContent = state.defaultPlacesSummary;
    placesPanelSummaryEl.textContent = state.defaultPlacesSummary;
    tourCardSubEl.textContent = `TÒA A · ${bCount} ĐIỂM`;
    introStatsEl.textContent = `${bCount} công trình · ${rCount} phòng (Tòa ${INDOOR_CODES.join(', ')})`;
    setLighting(state.currentLighting);
    applyLod(state.campusLoadFailed ? 1 : 2);
    setIndoorBuilding('A');
    renderFloorOptions();
    applyDeepLink();
  } catch (err) {
    console.error(err);
    markIntroStep('glb');
    setLighting(state.currentLighting);
    renderFloorSwitcher(3);
  }
});
