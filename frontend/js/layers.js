// Các lớp bản đồ, LOD, lọc tầng, ánh sáng
import { EMPTY_FC, GATE_A, GATE_B, GROUND_Z, LIGHTING_CONFIG, LIGHTING_MODES, ROOM_COLORS } from './config.js';
import { state } from './state.js';
import { btnSatelliteEl, floorSwitcherEl, lightingIconMoonEl, lightingIconSunEl, lightingIconSunsetEl, lightingKnobEl, lightingSliderEl, lightingValueEl, lod3DockEl } from './dom.js';
import { showToast } from './utils.js';
import { campus, map } from './map.js';
import { closeBuildingPanel, selectBuildingByIndex, updateBuildingMarker, updateBuildingWallColors } from './buildings.js';
import { selectRoom } from './rooms.js';
import { addAmenityLayer, setPickingMode, setUserPos } from './amenities.js';

let isSatellite = false;
let currentFloor = null;
function setLayerVisibility(id, visible) {
  if (map.getLayer(id)) {
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

export function setLighting(mode) {
  const key = LIGHTING_CONFIG[mode] ? mode : 'day';
  state.currentLighting = key;
  const cfg = LIGHTING_CONFIG[key];
  const idx = LIGHTING_MODES.indexOf(key);

  document.body.classList.remove('light-day', 'light-dusk', 'light-night');
  document.body.classList.add(cfg.bodyClass);

  lightingValueEl.textContent = cfg.label;
  lightingSliderEl.value = String(idx);
  const knobPositions = ['16px', '50%', 'calc(100% - 16px)'];
  lightingKnobEl.style.left = knobPositions[idx];
  lightingKnobEl.dataset.mode = key;
  lightingIconSunEl.classList.toggle('hidden', key !== 'day');
  lightingIconSunsetEl.classList.toggle('hidden', key !== 'sunset');
  lightingIconMoonEl.classList.toggle('hidden', key !== 'night');
  document.querySelectorAll('.daynight__stops [data-stop]').forEach((el) => {
    el.classList.toggle('is-active', Number(el.dataset.stop) === idx);
  });

  campus.setMode(key);
  if (!map.getLayer('lod1-ground')) return;
  map.setLight(cfg.light);
  map.setPaintProperty('lod1-ground', 'fill-extrusion-color', cfg.groundColor);
  updateBuildingWallColors();
}

export function addGateMarkers() {
  const gates = [
    { coords: GATE_A, label: 'CỔNG A - HÀN THUYÊN' },
    { coords: GATE_B, label: 'CỔNG B - XA LỘ HÀ NỘI' },
  ];
  gates.forEach(({ coords, label }) => {
    const el = document.createElement('div');
    el.className = 'gate-marker';
    const text = document.createElement('span');
    text.className = 'gate-marker-label';
    text.textContent = label;
    const stem = document.createElement('span');
    stem.className = 'gate-marker-stem';
    const dot = document.createElement('span');
    dot.className = 'gate-marker-dot';
    el.appendChild(text);
    el.appendChild(stem);
    el.appendChild(dot);
    new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(coords)
      .addTo(map);
  });
}

function updateLodButtons() {
  document.querySelectorAll('[data-lod]').forEach((btn) => {
    const active = Number(btn.dataset.lod) === state.currentLod;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function updateFloorButtons() {
  floorSwitcherEl.querySelectorAll('[data-floor]').forEach((btn) => {
    const val = btn.dataset.floor === 'all' ? null : Number(btn.dataset.floor);
    const active = currentFloor === val;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

export function applyHighlightFilter() {
  if (!map.getLayer('room-highlight')) return;
  if (!state.selectedRoom || !state.selectedRoom.room_code) {
    map.setFilter('room-highlight', ['==', ['get', 'room_code'], '']);
    return;
  }
  const codeFilter = ['==', ['get', 'room_code'], state.selectedRoom.room_code];
  const filter = currentFloor == null
    ? codeFilter
    : ['all', codeFilter, ['==', ['get', 'floor_number'], currentFloor]];
  map.setFilter('room-highlight', filter);
}

export function applyLod(lod) {
  if (lod !== 1 && state.campusLoadFailed) {
    showToast('Không tải được mô hình 3D khuôn viên', true);
    lod = 1;
  }
  state.currentLod = lod;
  const showIndoor = lod === 3;
  setLayerVisibility('campus-model', lod !== 1);
  setLayerVisibility('lod1-ground', lod === 1);
  setLayerVisibility('buildings-lod1', lod === 1);
  setLayerVisibility('rooms-3d-layer', showIndoor);
  setLayerVisibility('room-highlight', showIndoor);
  setLayerVisibility('indoor-base', showIndoor);
  // LOD 3: ẩn vỏ tòa đang xem trong mô hình để thấy các phòng bên trong
  campus.setHidden(showIndoor ? state.indoorCode : null);
  applyRoomFilter();
  lod3DockEl.classList.toggle('hidden', !showIndoor);
  document.getElementById('lod1-dock').classList.toggle('hidden', lod !== 1);
  updateBuildingWallColors();
  updateLodButtons();
  updateBuildingMarker();
}

function applyRoomFilter() {
  if (!map.getLayer('rooms-3d-layer')) return;
  const bld = ['==', ['get', 'building_code'], state.indoorCode];
  map.setFilter('indoor-base', bld);
  map.setFilter('rooms-3d-layer', currentFloor == null ? bld : ['all', bld, ['==', ['get', 'floor_number'], currentFloor]]);
}

export function setFloor(n) {
  currentFloor = n == null ? null : Number(n);
  if (state.currentLod !== 3) applyLod(3);
  applyRoomFilter();
  applyHighlightFilter();
  updateFloorButtons();
}

// Chọn tòa xem trong nhà (tòa có dữ liệu phòng): dựng lại bộ chọn tầng theo số tầng của tòa
export function setIndoorBuilding(code) {
  if (code === state.indoorCode && floorSwitcherEl.children.length) return;
  state.indoorCode = code;
  currentFloor = null;
  const feat = state.buildingsList.find((b) => b.properties.building_code === code);
  floorSwitcherEl.setAttribute('aria-label', `Chọn tầng Tòa ${code}`);
  renderFloorSwitcher((feat && feat.properties.total_floors) || 3);
  applyRoomFilter();
  if (state.currentLod === 3) campus.setHidden(code);
}

export function renderFloorSwitcher(totalFloors) {
  floorSwitcherEl.innerHTML = '';
  const items = [];
  for (let f = totalFloors; f >= 1; f -= 1) {
    items.push({ label: `T${f}`, value: f });
  }
  items.push({ label: 'Tất cả', value: null });
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'floor-text-btn';
    btn.textContent = item.label;
    btn.dataset.floor = item.value === null ? 'all' : String(item.value);
    btn.addEventListener('click', () => setFloor(item.value));
    floorSwitcherEl.appendChild(btn);
  });
  updateFloorButtons();
}

export function initLayers(buildingsFc, roomsFc, boundaryFc) {
  state.roomsByCode = new Map(roomsFc.features.map((f) => [f.properties.room_code, f.properties]));
  state.roomFeatures = roomsFc.features;
  campus.setFootprints(buildingsFc);

  map.addSource('campus-boundary', { type: 'geojson', data: boundaryFc });
  map.addSource('buildings', { type: 'geojson', data: buildingsFc });
  map.addSource('rooms', { type: 'geojson', data: roomsFc });
  map.addSource('radius-circle', { type: 'geojson', data: EMPTY_FC });
  map.addSource('amenities', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route-3d', { type: 'geojson', data: EMPTY_FC });

  const cfg = LIGHTING_CONFIG[state.currentLighting];

  // LOD 1: khối hộp dựng trực tiếp từ footprint + chiều cao trong CSDL
  map.addLayer({
    id: 'lod1-ground',
    type: 'fill-extrusion',
    source: 'campus-boundary',
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': cfg.groundColor,
      'fill-extrusion-base': 0,
      'fill-extrusion-height': 0.2,
    },
  });
  map.addLayer({
    id: 'buildings-lod1',
    type: 'fill-extrusion',
    source: 'buildings',
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': cfg.blockColor,
      'fill-extrusion-base': 0.2,
      'fill-extrusion-height': ['coalesce', ['get', 'height_m'], 10],
      'fill-extrusion-vertical-gradient': true,
    },
  });

  // LOD 2: mô hình toàn khuôn viên
  map.addLayer(campus.layer);

  // Sàn nền tòa đang xem trong nhà: mô hình không có mặt đất bên dưới vỏ tòa đã ẩn
  map.addLayer({
    id: 'indoor-base',
    type: 'fill-extrusion',
    source: 'buildings',
    filter: ['==', ['get', 'building_code'], ''],
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': '#d6d9dd',
      'fill-extrusion-base': 0,
      'fill-extrusion-height': GROUND_Z,
    },
  });

  map.addLayer({
    id: 'radius-circle',
    type: 'fill-extrusion',
    source: 'radius-circle',
    paint: {
      'fill-extrusion-color': '#2563EB',
      'fill-extrusion-base': 1.2,
      'fill-extrusion-height': 1.35,
      'fill-extrusion-opacity': 0.35,
    },
  });

  map.addLayer({
    id: 'rooms-3d-layer',
    type: 'fill-extrusion',
    source: 'rooms',
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': [
        'match',
        ['get', 'room_type'],
        'Theory', ROOM_COLORS.Theory,
        'Lab', ROOM_COLORS.Lab,
        'Library', ROOM_COLORS.Library,
        'Office', ROOM_COLORS.Office,
        'Corridor', ROOM_COLORS.Corridor,
        ['Stairs', 'WC'], ROOM_COLORS.Stairs,
        '#64748B',
      ],
      'fill-extrusion-base': ['+', GROUND_Z, ['get', 'base_height']],
      'fill-extrusion-height': ['+', GROUND_Z, ['get', 'extrude_height']],
      'fill-extrusion-opacity': 0.92,
    },
  });

  map.addLayer({
    id: 'room-highlight',
    type: 'fill-extrusion',
    source: 'rooms',
    filter: ['==', ['get', 'room_code'], ''],
    layout: { visibility: 'none' },
    paint: {
      'fill-extrusion-color': '#EAB308',
      'fill-extrusion-base': ['+', GROUND_Z, ['get', 'base_height']],
      'fill-extrusion-height': ['+', GROUND_Z, ['get', 'extrude_height']],
      'fill-extrusion-opacity': 0.98,
    },
  });

  const routeVis = document.getElementById('toggle-route').checked ? 'visible' : 'none';
  map.addLayer({
    id: 'route-3d',
    type: 'fill-extrusion',
    source: 'route-3d',
    layout: { visibility: routeVis },
    paint: {
      'fill-extrusion-color': '#EF4444',
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-opacity': 0.95,
    },
  });

  addAmenityLayer();

  map.on('mouseenter', 'rooms-3d-layer', () => {
    if (!state.isPickingLocation) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'rooms-3d-layer', () => {
    if (!state.isPickingLocation) map.getCanvas().style.cursor = '';
  });
  map.on('click', 'rooms-3d-layer', (e) => {
    if (state.isPickingLocation) return;
    const feat = e.features && e.features[0];
    if (!feat) return;
    selectRoom(feat.properties, [e.lngLat.lng, e.lngLat.lat], false);
  });

  // Chọn tòa nhà bằng tia chiếu vào khối footprint (dùng chung cho LOD 1/2/3)
  map.on('mousemove', (e) => {
    if (state.isPickingLocation || e.originalEvent.buttons) return;
    const code = state.currentLod === 3 && map.queryRenderedFeatures(e.point, { layers: ['rooms-3d-layer'] }).length
      ? null
      : campus.pick(e.point);
    if (code === state.hoveredCode) return;
    state.hoveredCode = code;
    map.getCanvas().style.cursor = code ? 'pointer' : '';
    updateBuildingMarker();
  });
  map.getCanvas().addEventListener('mouseleave', () => {
    state.hoveredCode = null;
    updateBuildingMarker();
  });

  map.on('click', (e) => {
    if (state.isPickingLocation) {
      setPickingMode(false);
      setUserPos([e.lngLat.lng, e.lngLat.lat]);
      return;
    }
    if (map.queryRenderedFeatures(e.point, { layers: ['amenities-layer'] }).length) return;
    if (state.currentLod === 3 && map.queryRenderedFeatures(e.point, { layers: ['rooms-3d-layer'] }).length) return;
    const code = campus.pick(e.point);
    const idx = code ? state.buildingsList.findIndex((b) => b.properties.building_code === code) : -1;
    if (idx >= 0) selectBuildingByIndex(idx);
    else if (state.selectedBuildingIndex >= 0) closeBuildingPanel();
  });

  map.on('render', updateBuildingMarker);
}

document.querySelectorAll('[data-lod]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const lod = Number(btn.dataset.lod);
    if (lod === 3) {
      setFloor(null);
      return;
    }
    applyLod(lod);
  });
});

btnSatelliteEl.addEventListener('click', () => {
  isSatellite = !isSatellite;
  btnSatelliteEl.classList.toggle('active', isSatellite);
  btnSatelliteEl.setAttribute('aria-pressed', String(isSatellite));
  setLayerVisibility('satellite-layer', isSatellite);
});

lightingSliderEl.addEventListener('input', () => {
  const mode = LIGHTING_MODES[Number(lightingSliderEl.value)] || 'day';
  setLighting(mode);
});

document.getElementById('toggle-route').addEventListener('change', (e) => {
  setLayerVisibility('route-3d', e.target.checked);
});

