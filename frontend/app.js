const API = 'http://localhost:8000';
const DEFAULT_CENTER = [106.80333, 10.87002];
const DEFAULT_ZOOM = 17.6;
const DEFAULT_PITCH = 55;
const DEFAULT_BEARING = 128;

const GATE_A = [106.8020546, 10.8704376];
const GATE_B = [106.8039237, 10.8689966];

const ROOM_COLORS = {
  Theory: '#3B82F6',
  Lab: '#F97316',
  Library: '#8B5CF6',
  Office: '#10B981',
  Corridor: '#CBD5E1',
  Stairs: '#64748B',
  WC: '#64748B',
};

const ROOM_LABELS = {
  Theory: 'Phòng lý thuyết',
  Lab: 'Phòng thực hành',
  Library: 'Thư viện',
  Office: 'Văn phòng / Khoa',
  Corridor: 'Hành lang',
  Stairs: 'Cầu thang',
  WC: 'Nhà vệ sinh',
};

const AMENITY_COLORS = {
  Canteen: '#F97316',
  ATM: '#2563EB',
  Water: '#06B6D4',
  Parking: '#64748B',
  Medical: '#EF4444',
  FireSafety: '#DC2626',
};

const LIGHTING_MODES = ['day', 'sunset', 'night'];
const LIGHTING_CONFIG = {
  day: {
    label: 'Ban ngày',
    bodyClass: 'light-day',
    light: { anchor: 'map', color: '#ffffff', intensity: 0.45, position: [1.15, 210, 30] },
    groundColor: '#6B7A4A',
    pathColor: '#D9D2C3',
    buildingColor: '#2E4A66',
    rasterBrightness: 1,
    nightIcon: false,
  },
  sunset: {
    label: 'Hoàng hôn',
    bodyClass: 'light-dusk',
    light: { anchor: 'map', color: '#FFB27A', intensity: 0.55, position: [1.15, 260, 20] },
    groundColor: '#6E6A45',
    pathColor: '#D8C3A8',
    buildingColor: '#3A4560',
    rasterBrightness: 1,
    nightIcon: false,
  },
  night: {
    label: 'Ban đêm',
    bodyClass: 'light-night',
    light: { anchor: 'map', color: '#C8D0E6', intensity: 0.32, position: [1.15, 210, 30] },
    groundColor: '#2F3A2A',
    pathColor: '#7D7A72',
    buildingColor: '#1C2738',
    rasterBrightness: 0.55,
    nightIcon: true,
  },
};

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

let currentLod = 1;
let prevLodBeforeLod2 = 1;
let glbLoadFailed = false;
let currentFloor = null;
let currentLighting = 'day';
let isSatellite = false;
let loadingCount = 0;
let toastTimer = null;
let roomsByCode = new Map();
let selectedRoom = null;
let activePopup = null;
let searchDebounceTimer = null;
let searchAbortController = null;
let isPickingLocation = false;
let userPos = null;
let userMarker = null;
let buildingsList = [];
let selectedBuildingIndex = -1;
let defaultPlacesCount = '00';
let defaultPlacesSummary = '0 ĐỊA ĐIỂM · 0 TIỆN ÍCH';

const loadingEl = document.getElementById('loading');
const toastEl = document.getElementById('toast');
const introEl = document.getElementById('intro');
const introFillEl = document.getElementById('intro-wordmark-fill');
const introCounterEl = document.getElementById('intro-counter');
const introStatsEl = document.getElementById('intro-stats');
const btnSkipIntroEl = document.getElementById('btn-skip-intro');
const lod3DockEl = document.getElementById('lod3-dock');
const floorSwitcherEl = document.getElementById('floor-switcher');
const btnPlacesToggleEl = document.getElementById('btn-places-toggle');
const placesPanelEl = document.getElementById('places-panel');
const placesCountEl = document.getElementById('places-count');
const placesTitleEl = document.getElementById('places-title');
const placesSummaryEl = document.getElementById('places-summary');
const buildingsListEl = document.getElementById('buildings-list');
const buildingPanelEl = document.getElementById('building-panel');
const bpIndexEl = document.getElementById('bp-index');
const bpCloseEl = document.getElementById('bp-close');
const bpFloorsEl = document.getElementById('bp-floors');
const bpNameEl = document.getElementById('bp-name');
const bpDescEl = document.getElementById('bp-desc');
const bpSpecsEl = document.getElementById('bp-specs');
const bpViewIndoorEl = document.getElementById('bp-view-indoor');
const bpPrevEl = document.getElementById('bp-prev');
const bpPrevNameEl = document.getElementById('bp-prev-name');
const bpNextEl = document.getElementById('bp-next');
const bpNextNameEl = document.getElementById('bp-next-name');
const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const roomCardEl = document.getElementById('room-card');
const routeSummaryEl = document.getElementById('route-summary');
const btnPickLocationEl = document.getElementById('btn-pick-location');
const radiusSliderEl = document.getElementById('radius-slider');
const radiusValueEl = document.getElementById('radius-value');
const radiusFillEl = document.getElementById('radius-fill');
const radiusThumbEl = document.getElementById('radius-thumb');
const amenitiesListEl = document.getElementById('amenities-list');
const coordBoxEl = document.getElementById('coord-box');
const coordDmsEl = document.getElementById('coord-dms');
const coordZoomEl = document.getElementById('coord-zoom');
const btnInfoEl = document.getElementById('btn-info');
const infoPopoverEl = document.getElementById('info-popover');
const btnSatelliteEl = document.getElementById('btn-satellite');
const lightingSliderEl = document.getElementById('lighting-slider');
const lightingValueEl = document.getElementById('lighting-value');
const lightingKnobEl = document.getElementById('lighting-knob');
const lightingIconSunEl = document.getElementById('lighting-icon-sun');
const lightingIconMoonEl = document.getElementById('lighting-icon-moon');

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3500);
}

async function api(path, signal) {
  loadingCount += 1;
  loadingEl.classList.remove('hidden');
  try {
    const res = await fetch(`${API}${path}`, signal ? { signal } : undefined);
    if (!res.ok) {
      let detail = `Lỗi máy chủ (${res.status})`;
      try {
        const body = await res.json();
        if (body && body.detail) detail = body.detail;
      } catch (err) {
        console.error(err);
      }
      throw new Error(detail);
    }
    return await res.json();
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast(err.message || 'Không thể kết nối máy chủ', true);
    }
    throw err;
  } finally {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) loadingEl.classList.add('hidden');
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const prefersReducedMotion = Boolean(
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
const introCompletedSteps = new Set();
let introTarget = 0;
let introCurrent = 0;
let introClosed = false;
let introRafId = null;

function closeIntro(immediate = false) {
  if (introClosed) return;
  introClosed = true;
  if (introRafId) cancelAnimationFrame(introRafId);
  if (immediate || prefersReducedMotion) {
    introEl.style.display = 'none';
    map.jumpTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
    });
    return;
  }
  introEl.classList.add('is-leaving');
  setTimeout(() => {
    introEl.style.display = 'none';
  }, 600);
  map.easeTo({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: DEFAULT_BEARING,
    duration: 2200,
  });
}

function tickIntro() {
  introCurrent += (introTarget - introCurrent) * 0.14;
  if (Math.abs(introTarget - introCurrent) < 0.4) {
    introCurrent = introTarget;
  }
  introCounterEl.textContent = String(Math.round(introCurrent)).padStart(3, '0');
  introFillEl.style.clipPath = `inset(0 ${100 - introCurrent}% 0 0)`;

  if (introCurrent < 100 || introTarget < 100) {
    introRafId = requestAnimationFrame(tickIntro);
  } else if (!introClosed) {
    setTimeout(() => closeIntro(false), 180);
  }
}

function markIntroStep(stepKey) {
  if (introCompletedSteps.has(stepKey)) return;
  introCompletedSteps.add(stepKey);
  introTarget = Math.min(100, introCompletedSteps.size * 25);
  if (prefersReducedMotion) {
    introCurrent = introTarget;
    introCounterEl.textContent = String(introTarget).padStart(3, '0');
    introFillEl.style.clipPath = `inset(0 ${100 - introTarget}% 0 0)`;
    if (introTarget >= 100) closeIntro(true);
    return;
  }
  if (!introRafId && !introClosed) {
    introRafId = requestAnimationFrame(tickIntro);
  }
}

btnSkipIntroEl.addEventListener('click', () => closeIntro(false));

const map = new maplibregl.Map({
  container: 'map',
  center: DEFAULT_CENTER,
  zoom: prefersReducedMotion ? DEFAULT_ZOOM : 16,
  pitch: prefersReducedMotion ? DEFAULT_PITCH : 0,
  bearing: DEFAULT_BEARING,
  attributionControl: false,
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

function setLayerVisibility(id, visible) {
  if (map.getLayer(id)) {
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}

function setLighting(mode) {
  const key = LIGHTING_CONFIG[mode] ? mode : 'day';
  currentLighting = key;
  const cfg = LIGHTING_CONFIG[key];
  const idx = LIGHTING_MODES.indexOf(key);

  document.body.classList.remove('light-day', 'light-dusk', 'light-night');
  document.body.classList.add(cfg.bodyClass);

  lightingValueEl.textContent = cfg.label;
  lightingSliderEl.value = String(idx);
  const knobPositions = ['16px', '50%', 'calc(100% - 16px)'];
  lightingKnobEl.style.left = knobPositions[idx];
  lightingIconSunEl.classList.toggle('hidden', cfg.nightIcon);
  lightingIconMoonEl.classList.toggle('hidden', !cfg.nightIcon);

  if (!map.isStyleLoaded()) return;

  map.setLight(cfg.light);
  if (map.getLayer('campus-ground')) {
    map.setPaintProperty('campus-ground', 'fill-extrusion-color', cfg.groundColor);
  }
  if (map.getLayer('campus-paths')) {
    map.setPaintProperty('campus-paths', 'line-color', cfg.pathColor);
  }
  ['buildings-3d-layer', 'building-a-shell'].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'fill-extrusion-color', cfg.buildingColor);
    }
  });
  updateBuildingWallColors();
  if (map.getLayer('satellite-layer')) {
    map.setPaintProperty('satellite-layer', 'raster-brightness-max', cfg.rasterBrightness);
  }
}

function addGateMarkers() {
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
    const dot = document.createElement('span');
    dot.className = 'gate-marker-dot';
    el.appendChild(text);
    el.appendChild(dot);
    new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(coords)
      .addTo(map);
  });
}

function updateLodButtons() {
  document.querySelectorAll('[data-lod]').forEach((btn) => {
    const active = Number(btn.dataset.lod) === currentLod;
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

function applyHighlightFilter() {
  if (!map.getLayer('room-highlight')) return;
  if (!selectedRoom || !selectedRoom.room_code) {
    map.setFilter('room-highlight', ['==', ['get', 'room_code'], '']);
    return;
  }
  const codeFilter = ['==', ['get', 'room_code'], selectedRoom.room_code];
  const filter = currentFloor == null
    ? codeFilter
    : ['all', codeFilter, ['==', ['get', 'floor_number'], currentFloor]];
  map.setFilter('room-highlight', filter);
}

function formatDms(deg, posHem, negHem) {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  const sFixed = s === 60 ? 59 : s;
  return `${d}°${String(m).padStart(2, '0')}′${String(sFixed).padStart(2, '0')}″${deg >= 0 ? posHem : negHem}`;
}

function updateCoordBox() {
  const center = map.getCenter();
  coordDmsEl.textContent = `${formatDms(center.lat, 'N', 'S')} · ${formatDms(center.lng, 'E', 'W')}`;
  coordZoomEl.textContent = `ZOOM ${map.getZoom().toFixed(1)}`;
}

function setPlacesPanelOpen(open) {
  placesPanelEl.classList.toggle('hidden', !open);
  btnPlacesToggleEl.setAttribute('aria-expanded', String(open));
}

function setInfoPopoverOpen(open) {
  infoPopoverEl.classList.toggle('hidden', !open);
  btnInfoEl.setAttribute('aria-expanded', String(open));
}

function getFeatureCenter(feature) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  function walk(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number') {
      if (coords[0] < minLng) minLng = coords[0];
      if (coords[0] > maxLng) maxLng = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
    } else {
      coords.forEach(walk);
    }
  }
  walk(feature.geometry && feature.geometry.coordinates);
  if (!Number.isFinite(minLng)) return DEFAULT_CENTER;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

function updateBuildingWallColors() {
  const cfg = LIGHTING_CONFIG[currentLighting];
  const selectedFeat = selectedBuildingIndex >= 0 ? buildingsList[selectedBuildingIndex] : null;
  const selectedCode = selectedFeat && selectedFeat.properties ? selectedFeat.properties.building_code : null;
  const colorExpr = selectedCode
    ? ['match', ['get', 'building_code'], selectedCode, '#5B8DB8', cfg.buildingColor]
    : cfg.buildingColor;
  ['buildings-3d-layer', 'building-a-shell'].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'fill-extrusion-color', colorExpr);
    }
  });
  if (map.getLayer('buildings-roof')) {
    const roofMap = { A: '#BFE3C0', C: '#F2B98E' };
    if (selectedCode) roofMap[selectedCode] = '#FFFFFF';
    const roofExpr = ['match', ['get', 'building_code']];
    Object.entries(roofMap).forEach(([code, color]) => {
      roofExpr.push(code, color);
    });
    roofExpr.push('#E6E1D6');
    map.setPaintProperty('buildings-roof', 'fill-extrusion-color', roofExpr);
  }
}

function closeBuildingPanel() {
  if (selectedBuildingIndex === -1 && buildingPanelEl.classList.contains('hidden')) return;
  selectedBuildingIndex = -1;
  buildingPanelEl.classList.add('hidden');
  coordBoxEl.style.visibility = '';
  placesCountEl.classList.remove('hidden');
  placesCountEl.textContent = defaultPlacesCount;
  placesTitleEl.textContent = 'Danh sách địa điểm';
  placesSummaryEl.textContent = defaultPlacesSummary;
  updateBuildingWallColors();
}

function selectBuildingByIndex(idx) {
  if (!buildingsList.length) return;
  const len = buildingsList.length;
  const normIdx = ((idx % len) + len) % len;
  selectedBuildingIndex = normIdx;

  const feat = buildingsList[normIdx];
  const p = feat.properties || {};
  const floors = p.total_floors || 1;
  const prevFeat = buildingsList[(normIdx - 1 + len) % len];
  const nextFeat = buildingsList[(normIdx + 1) % len];

  bpIndexEl.textContent = `${String(normIdx + 1).padStart(2, '0')} — ${String(len).padStart(2, '0')}`;
  bpFloorsEl.textContent = `${floors} TẦNG`;
  bpNameEl.textContent = p.name || p.building_code || 'Công trình';
  bpDescEl.textContent = p.description && p.description.trim() ? p.description : 'Chưa có mô tả.';

  const specs = [
    `Mã công trình: ${p.building_code || '—'}`,
    `Chiều cao: ${p.height_m != null ? `${p.height_m} m` : '—'}`,
    `Số tầng: ${floors} tầng`,
  ];
  if (p.building_code === 'A') {
    specs.push(`Có dữ liệu trong nhà LOD 3 (${roomsByCode.size || 65} phòng)`);
    bpViewIndoorEl.classList.remove('hidden');
  } else {
    bpViewIndoorEl.classList.add('hidden');
  }

  bpSpecsEl.innerHTML = '';
  specs.forEach((text, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="bp-spec-num">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(text)}</span>`;
    bpSpecsEl.appendChild(li);
  });

  bpPrevNameEl.textContent = (prevFeat.properties && (prevFeat.properties.name || prevFeat.properties.building_code)) || '';
  bpNextNameEl.textContent = (nextFeat.properties && (nextFeat.properties.name || nextFeat.properties.building_code)) || '';

  setPlacesPanelOpen(false);
  buildingPanelEl.classList.remove('hidden');
  coordBoxEl.style.visibility = 'hidden';

  placesCountEl.classList.add('hidden');
  placesTitleEl.textContent = p.name || p.building_code || 'Công trình';
  placesSummaryEl.textContent = `${floors} TẦNG · ĐANG CHỌN`;

  updateBuildingWallColors();
  map.flyTo({
    center: getFeatureCenter(feat),
    zoom: 18.3,
    pitch: 58,
    bearing: map.getBearing(),
    duration: 1400,
  });
}

function renderBuildingsList(buildingsFc) {
  buildingsListEl.innerHTML = '';
  const features = buildingsFc.features || [];
  buildingsList = features;
  if (!features.length) {
    const li = document.createElement('li');
    li.className = 'result-empty';
    li.textContent = 'Chưa có dữ liệu công trình';
    buildingsListEl.appendChild(li);
    return;
  }
  features.forEach((feat, idx) => {
    const p = feat.properties || {};
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-row-btn';
    const floorsText = p.total_floors ? `${p.total_floors}T` : '';
    btn.innerHTML = `
      <span class="row-left">
        <span class="row-index">${String(idx + 1).padStart(2, '0')}</span>
        <span class="row-name">${escapeHtml(p.name || p.building_code)}</span>
      </span>
      <span class="row-meta-right">${escapeHtml(floorsText)}</span>
    `;
    btn.addEventListener('click', () => {
      selectBuildingByIndex(idx);
    });
    li.appendChild(btn);
    buildingsListEl.appendChild(li);
  });
}

function applyLod(lod) {
  if (lod === 2) {
    if (!map.getLayer('building-a-glb') || glbLoadFailed) {
      showToast('Không tải được mô hình LOD 2', true);
      return;
    }
    if (currentLod !== 2) prevLodBeforeLod2 = currentLod;
  }
  currentLod = lod;
  const showGlb = lod === 2;
  const showIndoor = lod === 3;
  setLayerVisibility('building-a-glb', showGlb);
  setLayerVisibility('rooms-3d-layer', showIndoor);
  setLayerVisibility('room-highlight', showIndoor);
  setLayerVisibility('building-a-shell', !showGlb);
  if (!showGlb && map.getLayer('building-a-shell')) {
    map.setPaintProperty('building-a-shell', 'fill-extrusion-opacity', showIndoor ? 0.15 : 0.9);
  }
  if (map.getLayer('buildings-roof')) {
    map.setFilter('buildings-roof', lod === 1 ? null : ['!=', ['get', 'building_code'], 'A']);
  }
  lod3DockEl.classList.toggle('hidden', !showIndoor);
  updateLodButtons();
}

function setFloor(n) {
  currentFloor = n == null ? null : Number(n);
  if (currentLod !== 3) applyLod(3);
  if (map.getLayer('rooms-3d-layer')) {
    const filter = currentFloor == null ? null : ['==', ['get', 'floor_number'], currentFloor];
    map.setFilter('rooms-3d-layer', filter);
  }
  applyHighlightFilter();
  updateFloorButtons();
}
window.setFloor = setFloor;

function renderFloorSwitcher(totalFloors) {
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

function buildRoomPopupHtml(props) {
  const typeLabel = ROOM_LABELS[props.room_type] || props.room_type || 'Không rõ';
  const capacity = props.capacity != null ? `${props.capacity} chỗ` : 'Chưa cập nhật';
  return `
    <div class="popup-content">
      <h4>${escapeHtml(props.room_code)} — ${escapeHtml(props.room_name)}</h4>
      <p><strong>Loại:</strong> ${escapeHtml(typeLabel)}</p>
      <p><strong>Tầng:</strong> ${escapeHtml(props.floor_number)}</p>
      <p><strong>Sức chứa:</strong> ${escapeHtml(capacity)}</p>
    </div>
  `;
}

function renderRoomCard(room) {
  document.getElementById('room-card-title').textContent = room.room_name || room.room_code;
  document.getElementById('rc-code').textContent = room.room_code || '—';
  document.getElementById('rc-type').textContent = ROOM_LABELS[room.room_type] || room.room_type || 'Chưa rõ';
  document.getElementById('rc-floor').textContent = `Tầng ${room.floor_number}`;
  document.getElementById('rc-capacity').textContent = room.capacity != null ? `${room.capacity} chỗ` : 'Chưa cập nhật';
  document.getElementById('rc-equipment').textContent = room.equipment_info || 'Chưa cập nhật';
  roomCardEl.classList.remove('hidden');
}

function openRoomPopup(lngLat, room) {
  if (activePopup) activePopup.remove();
  activePopup = new maplibregl.Popup()
    .setLngLat(lngLat)
    .setHTML(buildRoomPopupHtml(room))
    .addTo(map);
}

function selectRoom(roomData, lngLat, shouldFly = false) {
  const cached = roomsByCode.get(roomData.room_code) || {};
  const merged = { ...cached, ...roomData };
  selectedRoom = merged;

  if (shouldFly && merged.floor_number != null) {
    setFloor(merged.floor_number);
  }
  applyHighlightFilter();
  renderRoomCard(merged);
  setPlacesPanelOpen(true);

  if (lngLat) {
    if (shouldFly) {
      map.flyTo({ center: lngLat, zoom: 19.5, pitch: 60 });
    }
    openRoomPopup(lngLat, merged);
  }
}

function renderSearchResults(items) {
  searchResultsEl.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'result-empty';
    li.textContent = 'Không tìm thấy phòng';
    searchResultsEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-row-btn';
    btn.innerHTML = `
      <span class="row-name">${escapeHtml(item.room_code)} – ${escapeHtml(item.room_name)}</span>
      <span class="row-meta-right">T${escapeHtml(item.floor_number)}</span>
    `;
    btn.addEventListener('click', () => {
      selectRoom(item, [item.lng, item.lat], true);
    });
    li.appendChild(btn);
    searchResultsEl.appendChild(li);
  });
}

searchInputEl.addEventListener('input', () => {
  const q = searchInputEl.value.trim();
  clearTimeout(searchDebounceTimer);
  if (searchAbortController) {
    searchAbortController.abort();
    searchAbortController = null;
  }
  if (!q) {
    searchResultsEl.innerHTML = '';
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    searchAbortController = new AbortController();
    try {
      const items = await api(`/api/search?q=${encodeURIComponent(q)}`, searchAbortController.signal);
      renderSearchResults(items);
    } catch (err) {
      console.error(err);
    }
  }, 300);
});

function buildCirclePolygon(centerLng, centerLat, radiusM, steps = 64) {
  // shortcut: xấp xỉ phẳng 111320 m/độ, sai số nhỏ trong phạm vi <= 300 m quanh UIT
  const latRad = (centerLat * Math.PI) / 180;
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos(latRad));
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([
      centerLng + dLng * Math.cos(angle),
      centerLat + dLat * Math.sin(angle),
    ]);
  }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {},
    }],
  };
}

function buildRoute3dPolygons(routeFc) {
  const features = [];
  routeFc.features.forEach((feat) => {
    const { path_type: pathType } = feat.properties;
    if (pathType !== 'Corridor' && pathType !== 'Stairs') return;
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
      const base = p1[2] ?? 0;

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

function renderAmenitiesList(fc) {
  amenitiesListEl.innerHTML = '';
  if (!fc.features.length) {
    const li = document.createElement('li');
    li.className = 'result-empty';
    li.textContent = 'Không có tiện ích trong bán kính';
    amenitiesListEl.appendChild(li);
    return;
  }
  fc.features.forEach((f) => {
    const p = f.properties;
    const li = document.createElement('li');
    li.className = 'amenity-row';
    li.innerHTML = `
      <span class="row-name">${escapeHtml(p.name)}</span>
      <span class="row-meta-right">${escapeHtml(p.distance_m)} m</span>
    `;
    amenitiesListEl.appendChild(li);
  });
}

function updateRadiusVisual() {
  const val = Number(radiusSliderEl.value);
  const min = Number(radiusSliderEl.min);
  const max = Number(radiusSliderEl.max);
  const pct = ((val - min) / (max - min)) * 100;
  radiusValueEl.textContent = `${val} m`;
  radiusFillEl.style.width = `${pct}%`;
  radiusThumbEl.style.left = `${pct}%`;
}

async function updateProximity() {
  if (!userPos) return;
  const radius = Number(radiusSliderEl.value);
  const [lng, lat] = userPos;
  if (map.getSource('radius-circle')) {
    map.getSource('radius-circle').setData(buildCirclePolygon(lng, lat, radius));
  }
  try {
    const fc = await api(`/api/amenities/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    if (map.getSource('amenities')) {
      map.getSource('amenities').setData(fc);
    }
    renderAmenitiesList(fc);
  } catch (err) {
    console.error(err);
  }
}

function setPickingMode(active) {
  isPickingLocation = active;
  btnPickLocationEl.classList.toggle('active', active);
  btnPickLocationEl.setAttribute('aria-pressed', String(active));
  map.getCanvas().style.cursor = active ? 'crosshair' : '';
}

btnPickLocationEl.addEventListener('click', () => {
  setPickingMode(!isPickingLocation);
});

radiusSliderEl.addEventListener('input', () => {
  updateRadiusVisual();
  updateProximity();
});

btnPlacesToggleEl.addEventListener('click', () => {
  const isHidden = placesPanelEl.classList.contains('hidden');
  setPlacesPanelOpen(isHidden);
});

btnInfoEl.addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = infoPopoverEl.classList.contains('hidden');
  setInfoPopoverOpen(isHidden);
});

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

bpCloseEl.addEventListener('click', closeBuildingPanel);
bpPrevEl.addEventListener('click', () => {
  if (buildingsList.length) selectBuildingByIndex(selectedBuildingIndex - 1);
});
bpNextEl.addEventListener('click', () => {
  if (buildingsList.length) selectBuildingByIndex(selectedBuildingIndex + 1);
});
bpViewIndoorEl.addEventListener('click', () => {
  closeBuildingPanel();
  applyLod(3);
});

document.getElementById('btn-route').addEventListener('click', async () => {
  if (!selectedRoom || !selectedRoom.room_code) {
    showToast('Vui lòng chọn phòng đích trước', true);
    return;
  }
  const start = userPos || GATE_A;
  if (!userPos) {
    showToast('Chưa chọn vị trí giả lập, xuất phát từ Cổng A');
  }
  try {
    const routeFc = await api(
      `/api/route?start_lng=${start[0]}&start_lat=${start[1]}&end_room_code=${encodeURIComponent(selectedRoom.room_code)}`
    );
    if (map.getSource('route')) {
      map.getSource('route').setData(routeFc);
    }
    if (map.getSource('route-3d')) {
      map.getSource('route-3d').setData(buildRoute3dPolygons(routeFc));
    }

    routeSummaryEl.textContent = `Quãng đường: ${routeFc.total_length_m} m · Qua tầng ${routeFc.floors.join(' → ')}`;
    routeSummaryEl.classList.remove('hidden');

    setFloor(null);
    const bounds = new maplibregl.LngLatBounds();
    routeFc.features.forEach((f) => {
      (f.geometry.coordinates || []).forEach((c) => bounds.extend([c[0], c[1]]));
    });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, pitch: 60, maxZoom: 19.5 });
    }
  } catch (err) {
    console.error(err);
  }
});

function initLayers(buildingsFc, roomsFc, boundaryFc) {
  roomsByCode = new Map(roomsFc.features.map((f) => [f.properties.room_code, f.properties]));

  map.addSource('campus-boundary', { type: 'geojson', data: boundaryFc });
  map.addSource('campus-paths', { type: 'geojson', data: 'data/campus_paths.geojson' });
  map.addSource('buildings', { type: 'geojson', data: buildingsFc });
  map.addSource('rooms', { type: 'geojson', data: roomsFc });
  map.addSource('radius-circle', { type: 'geojson', data: EMPTY_FC });
  map.addSource('amenities', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route-3d', { type: 'geojson', data: EMPTY_FC });

  const cfg = LIGHTING_CONFIG[currentLighting];
  const boundaryGeom = boundaryFc && boundaryFc.features && boundaryFc.features[0]
    ? boundaryFc.features[0].geometry
    : null;

  map.addLayer({
    id: 'campus-ground',
    type: 'fill-extrusion',
    source: 'campus-boundary',
    paint: {
      'fill-extrusion-color': cfg.groundColor,
      'fill-extrusion-base': 0,
      'fill-extrusion-height': 1.2,
      'fill-extrusion-vertical-gradient': true,
    },
  });

  map.addLayer({
    id: 'campus-paths',
    type: 'line',
    source: 'campus-paths',
    ...(boundaryGeom ? { filter: ['within', boundaryGeom] } : {}),
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': cfg.pathColor,
      'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 6, 20, 14],
    },
  });

  map.addLayer({
    id: 'buildings-2d',
    type: 'fill',
    source: 'buildings',
    paint: {
      'fill-color': '#94A3B8',
      'fill-opacity': 0.22,
      'fill-outline-color': '#475569',
    },
  });

  map.addLayer({
    id: 'radius-circle',
    type: 'fill',
    source: 'radius-circle',
    paint: {
      'fill-color': '#2563EB',
      'fill-opacity': 0.14,
    },
  });

  map.addLayer({
    id: 'radius-circle-line',
    type: 'line',
    source: 'radius-circle',
    paint: {
      'line-color': '#60A5FA',
      'line-width': 2,
      'line-dasharray': [2, 2],
    },
  });

  map.addLayer({
    id: 'buildings-3d-layer',
    type: 'fill-extrusion',
    source: 'buildings',
    filter: ['!=', ['get', 'building_code'], 'A'],
    paint: {
      'fill-extrusion-color': cfg.buildingColor,
      'fill-extrusion-base': 1.2,
      'fill-extrusion-height': ['coalesce', ['get', 'height_m'], 10],
      'fill-extrusion-opacity': 0.9,
    },
  });

  // Tách lớp vỏ Tòa A riêng vì fill-extrusion-opacity không nhận expression theo thuộc tính
  map.addLayer({
    id: 'building-a-shell',
    type: 'fill-extrusion',
    source: 'buildings',
    filter: ['==', ['get', 'building_code'], 'A'],
    paint: {
      'fill-extrusion-color': cfg.buildingColor,
      'fill-extrusion-base': 1.2,
      'fill-extrusion-height': ['coalesce', ['get', 'height_m'], 12],
      'fill-extrusion-opacity': 0.9,
    },
  });

  map.addLayer({
    id: 'buildings-roof',
    type: 'fill-extrusion',
    source: 'buildings',
    paint: {
      'fill-extrusion-color': [
        'match',
        ['get', 'building_code'],
        'A', '#BFE3C0',
        'C', '#F2B98E',
        '#E6E1D6',
      ],
      'fill-extrusion-base': ['-', ['coalesce', ['get', 'height_m'], 10], 0.4],
      'fill-extrusion-height': ['+', ['coalesce', ['get', 'height_m'], 10], 0.05],
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
      'fill-extrusion-base': ['get', 'base_height'],
      'fill-extrusion-height': ['get', 'extrude_height'],
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
      'fill-extrusion-base': ['get', 'base_height'],
      'fill-extrusion-height': ['get', 'extrude_height'],
      'fill-extrusion-opacity': 0.98,
    },
  });

  const routeVis = document.getElementById('toggle-route').checked ? 'visible' : 'none';
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { visibility: routeVis, 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#EF4444',
      'line-width': 5,
    },
  });

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

  const amenitiesVis = document.getElementById('toggle-amenities').checked ? 'visible' : 'none';
  map.addLayer({
    id: 'amenities-layer',
    type: 'circle',
    source: 'amenities',
    layout: { visibility: amenitiesVis },
    paint: {
      'circle-color': [
        'match',
        ['get', 'category'],
        'Canteen', AMENITY_COLORS.Canteen,
        'ATM', AMENITY_COLORS.ATM,
        'Water', AMENITY_COLORS.Water,
        'Parking', AMENITY_COLORS.Parking,
        'Medical', AMENITY_COLORS.Medical,
        'FireSafety', AMENITY_COLORS.FireSafety,
        '#10B981',
      ],
      'circle-radius': 7,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
    },
  });

  map.on('mouseenter', 'rooms-3d-layer', () => {
    if (!isPickingLocation) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'rooms-3d-layer', () => {
    if (!isPickingLocation) map.getCanvas().style.cursor = '';
  });
  map.on('click', 'rooms-3d-layer', (e) => {
    if (isPickingLocation) return;
    const feat = e.features && e.features[0];
    if (!feat) return;
    selectRoom(feat.properties, [e.lngLat.lng, e.lngLat.lat], false);
  });

  ['buildings-3d-layer', 'building-a-shell', 'buildings-roof'].forEach((layerId) => {
    map.on('mouseenter', layerId, () => {
      if (!isPickingLocation) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', layerId, () => {
      if (!isPickingLocation) map.getCanvas().style.cursor = '';
    });
    map.on('click', layerId, (e) => {
      if (isPickingLocation) return;
      if (currentLod === 3) {
        const hitRooms = map.queryRenderedFeatures(e.point, { layers: ['rooms-3d-layer'] });
        if (hitRooms && hitRooms.length > 0) return;
      }
      const feat = e.features && e.features[0];
      if (!feat || !feat.properties) return;
      const code = feat.properties.building_code;
      const idx = buildingsList.findIndex((b) => b.properties && b.properties.building_code === code);
      if (idx >= 0) selectBuildingByIndex(idx);
    });
  });

  map.on('click', (e) => {
    if (!isPickingLocation) return;
    userPos = [e.lngLat.lng, e.lngLat.lat];
    if (userMarker) {
      userMarker.setLngLat(userPos);
    } else {
      userMarker = new maplibregl.Marker({ color: '#EF4444' })
        .setLngLat(userPos)
        .addTo(map);
    }
    setPickingMode(false);
    updateProximity();
  });
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

document.getElementById('btn-reset-view').addEventListener('click', () => {
  map.easeTo({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: DEFAULT_BEARING,
  });
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

document.getElementById('toggle-route').addEventListener('change', (e) => {
  const visible = e.target.checked;
  setLayerVisibility('route-line', visible);
  setLayerVisibility('route-3d', visible);
});

document.getElementById('toggle-amenities').addEventListener('change', (e) => {
  setLayerVisibility('amenities-layer', e.target.checked);
});

function createBuildingAGlbLayer(props, onGlbDone) {
  const origin = maplibregl.MercatorCoordinate.fromLngLat(
    [Number(props.anchor_lng), Number(props.anchor_lat)],
    0
  );
  const s = origin.meterInMercatorCoordinateUnits();
  const rotYRad = ((Number(props.model_rotation) || 0) * Math.PI) / 180;

  let camera;
  let scene;
  let renderer;

  return {
    id: 'building-a-glb',
    type: 'custom',
    renderingMode: '3d',
    layout: { visibility: 'none' },
    onAdd(mapInstance, gl) {
      if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
        glbLoadFailed = true;
        if (onGlbDone) onGlbDone();
        return;
      }
      camera = new THREE.Camera();
      scene = new THREE.Scene();

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(80, 120, 60);
      scene.add(directionalLight);

      const loader = new THREE.GLTFLoader();
      loader.load(
        props.glb_model_url,
        (gltf) => {
          scene.add(gltf.scene);
          mapInstance.triggerRepaint();
          if (onGlbDone) onGlbDone();
        },
        undefined,
        () => {
          glbLoadFailed = true;
          if (currentLod === 2) {
            showToast('Không tải được mô hình LOD 2', true);
            applyLod(prevLodBeforeLod2);
          }
          if (onGlbDone) onGlbDone();
        }
      );

      renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    render(gl, matrix) {
      if (!renderer || !scene || !camera) return;
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );
      const rotationY = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 1, 0),
        rotYRad
      );
      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(rotationX)
        .multiply(rotationY);

      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
  };
}

addGateMarkers();
setLighting(currentLighting);
updateRadiusVisual();
updateCoordBox();
map.on('move', updateCoordBox);

map.on('load', async () => {
  markIntroStep('map');
  try {
    const [buildingsFc, roomsFc, amenitiesFc, boundaryFc] = await Promise.all([
      api('/api/buildings').finally(() => markIntroStep('buildings')),
      api('/api/rooms?building_code=A').finally(() => markIntroStep('rooms')),
      api('/api/amenities/nearby?lat=10.8700&lng=106.8030&radius=500').catch((err) => {
        console.error(err);
        return EMPTY_FC;
      }),
      fetch('data/campus_boundary.geojson').then((res) => {
        if (!res.ok) throw new Error(`Lỗi tải ranh giới khuôn viên (${res.status})`);
        return res.json();
      }),
    ]);
    initLayers(buildingsFc, roomsFc, boundaryFc);
    renderBuildingsList(buildingsFc);
    const bCount = buildingsFc.features.length;
    const rCount = roomsFc.features.length;
    const aCount = (amenitiesFc && amenitiesFc.features ? amenitiesFc.features.length : 0);
    defaultPlacesCount = String(bCount).padStart(2, '0');
    defaultPlacesSummary = `${bCount} ĐỊA ĐIỂM · ${aCount} TIỆN ÍCH`;
    placesCountEl.textContent = defaultPlacesCount;
    placesSummaryEl.textContent = defaultPlacesSummary;
    introStatsEl.textContent = `${bCount} công trình · ${rCount} phòng Tòa A`;
    setLighting(currentLighting);
    const buildingA = buildingsFc.features.find((f) => f.properties.building_code === 'A');
    if (
      buildingA &&
      buildingA.properties.glb_model_url &&
      buildingA.properties.anchor_lng != null &&
      buildingA.properties.anchor_lat != null
    ) {
      map.addLayer(createBuildingAGlbLayer(buildingA.properties, () => markIntroStep('glb')));
      // Custom layer không tự đọc layout.visibility lúc addLayer trong MapLibre 4.7
      setLayerVisibility('building-a-glb', false);
    } else {
      markIntroStep('glb');
    }
    const totalFloors = buildingA && buildingA.properties.total_floors ? buildingA.properties.total_floors : 3;
    renderFloorSwitcher(totalFloors);
  } catch (err) {
    console.error(err);
    markIntroStep('glb');
    setLighting(currentLighting);
    renderFloorSwitcher(3);
  }
});
