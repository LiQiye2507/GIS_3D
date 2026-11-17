// Điểm vào: khởi tạo và nạp dữ liệu khi bản đồ sẵn sàng
import { CAMPUS_BOUNDARY_FC, EMPTY_FC } from './config.js';
import { state } from './state.js';
import { btnInfoCloseEl, btnInfoEl, infoPopoverEl, introStatsEl, placesCountEl, placesPanelSummaryEl, placesSummaryEl, tourCardSubEl } from './dom.js';
import { api, showToast } from './utils.js';
import { campus, campusHandlers, map } from './map.js';
import { markIntroStep } from './intro.js';
import { addGateMarkers, applyLod, initLayers, renderFloorSwitcher, setIndoorBuilding, setLighting } from './layers.js';
import { closeBuildingPanel, renderBuildingsList, setPlacesPanelOpen } from './buildings.js';
import { setAllAmenities, updateRadiusVisual } from './amenities.js';
import { buildSearchIndex } from './search.js';
import { applyDeepLink } from './share.js';
import './camera.js';
import './rooms.js';
import './route.js';
import './geolocate.js';

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
    const [buildingsFc, roomsA, roomsC, amenitiesFc] = await Promise.all([
      api('/api/buildings').finally(() => markIntroStep('buildings')),
      api('/api/rooms?building_code=A').finally(() => markIntroStep('rooms')),
      api('/api/rooms?building_code=C').catch(() => EMPTY_FC),
      api('/api/amenities/nearby?lat=10.8700&lng=106.8030&radius=500').catch((err) => {
        console.error(err);
        return EMPTY_FC;
      }),
    ]);
    const roomsFc = { type: 'FeatureCollection', features: [...roomsA.features, ...roomsC.features] };
    initLayers(buildingsFc, roomsFc, CAMPUS_BOUNDARY_FC);
    setAllAmenities(amenitiesFc);
    renderBuildingsList(buildingsFc, amenitiesFc);
    buildSearchIndex(amenitiesFc);
    const bCount = buildingsFc.features.length;
    const rCount = roomsFc.features.length;
    const aCount = amenitiesFc.features.filter((f) => !f.properties.room_code).length;
    state.defaultPlacesCount = String(bCount).padStart(2, '0');
    state.defaultPlacesSummary = `${bCount} địa điểm · ${aCount} tiện ích`;
    placesCountEl.textContent = state.defaultPlacesCount;
    placesSummaryEl.textContent = state.defaultPlacesSummary;
    placesPanelSummaryEl.textContent = state.defaultPlacesSummary;
    tourCardSubEl.textContent = `TÒA A · ${bCount} ĐIỂM`;
    introStatsEl.textContent = `${bCount} công trình · ${rCount} phòng (Tòa A, C)`;
    setLighting(state.currentLighting);
    applyLod(state.campusLoadFailed ? 1 : 2);
    setIndoorBuilding('A');
    applyDeepLink();
  } catch (err) {
    console.error(err);
    markIntroStep('glb');
    setLighting(state.currentLighting);
    renderFloorSwitcher(3);
  }
});
