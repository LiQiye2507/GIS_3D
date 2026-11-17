const API = 'http://localhost:8000';
// Mặt đất của mô hình campus.glb nằm ở độ cao ~0 m; sàn tầng 1 Tòa A cao hơn một chút
const GROUND_Z = 0.3;
const DEFAULT_CENTER = [106.80333, 10.87002];
const DEFAULT_PITCH = 53;
const OVERVIEW_ZOOM = 17.62;
const BASE_PADDING = { top: 60, bottom: 110, left: 0, right: 0 };
const SHEET_PADDING = { top: 60, bottom: 40, left: 0, right: 420 };
// Tốc độ tự xoay (độ/giây): tổng quan, đang chọn tòa nhà, nút 360°
const SPIN_OVERVIEW = 0.46;
const SPIN_SELECTED = 3.15;
const SPIN_ORBIT = 6;

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

const EMPTY_FC = { type: 'FeatureCollection', features: [] };
// Ranh giới khuôn viên (LOD 1), chép từ dataset/campus_boundary.geojson (OSM way 1303838982).
const CAMPUS_BOUNDARY_FC = {
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

let currentLod = 2;
let campusLoadFailed = false;
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
let allAmenitiesList = [];
let cachedBuildingsFc = null;
let selectedBuildingIndex = -1;
let defaultPlacesCount = '00';
let defaultPlacesSummary = '0 ĐỊA ĐIỂM · 0 TIỆN ÍCH';
let isOrbiting = false;
let spinRate = 0;
let spinRafId = null;
let spinLast = 0;
let idleTimer = null;
let hoveredCode = null;
let campusCenter = DEFAULT_CENTER;

const loadingEl = document.getElementById('loading');
const toastEl = document.getElementById('toast');
const introEl = document.getElementById('intro');
const introFillEl = document.getElementById('intro-wordmark-fill');
const introCounterEl = document.getElementById('intro-counter');
const introStatsEl = document.getElementById('intro-stats');
const btnSkipIntroEl = document.getElementById('btn-skip-intro');
const lod3DockEl = document.getElementById('lod3-dock');
const floorSwitcherEl = document.getElementById('floor-switcher');
const hudTopLeftEl = document.getElementById('hud-top-left');
const hudBottomLeftEl = document.getElementById('hud-bottom-left');
const hudBottomCenterEl = document.getElementById('hud-bottom-center');
const btnPlacesToggleEl = document.getElementById('btn-places-toggle');
const btnPlacesCloseEl = document.getElementById('btn-places-close');
const placesPanelEl = document.getElementById('places-panel');
const placesPanelSummaryEl = document.getElementById('places-panel-summary');
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
const bpIndoorBoxEl = document.getElementById('bp-indoor-box');
const bpViewIndoorEl = document.getElementById('bp-view-indoor');
const bpFloorPillsEl = document.getElementById('bp-floor-pills');
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
const tourWrapEl = document.getElementById('tour-wrap');
const tourCardEl = document.getElementById('tour-card');
const tourCardSubEl = document.getElementById('tour-card-sub');
const colophonEl = document.querySelector('.colophon');
const btnOrbitEl = document.getElementById('btn-orbit-360');
const btnResetViewEl = document.getElementById('btn-reset-view');
const btnInfoEl = document.getElementById('btn-info');
const btnInfoCloseEl = document.getElementById('btn-info-close');
const infoPopoverEl = document.getElementById('info-popover');
const btnSatelliteEl = document.getElementById('btn-satellite');
const lightingSliderEl = document.getElementById('lighting-slider');
const lightingValueEl = document.getElementById('lighting-value');
const lightingKnobEl = document.getElementById('lighting-knob');
const lightingIconSunEl = document.getElementById('lighting-icon-sun');
const lightingIconSunsetEl = document.getElementById('lighting-icon-sunset');
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

function overviewCamera() {
  const canvas = map.getCanvas();
  const fit = Math.min(canvas.clientWidth / 1536, canvas.clientHeight / 730);
  return {
    center: campusCenter,
    zoom: OVERVIEW_ZOOM + Math.log2(Math.max(0.3, fit)),
    pitch: DEFAULT_PITCH,
    // Hướng nhìn tổng quan: camera ở phía Tây Bắc nhìn về Đông Nam (phương vị 230° trong hệ mô hình)
    bearing: campus.modelBearing(-Math.sin((230 * Math.PI) / 180), -Math.cos((230 * Math.PI) / 180)),
    padding: BASE_PADDING,
  };
}

function closeIntro(immediate = false) {
  if (introClosed) return;
  introClosed = true;
  if (introRafId) cancelAnimationFrame(introRafId);
  if (immediate || prefersReducedMotion) {
    introEl.style.display = 'none';
    map.jumpTo(overviewCamera());
    return;
  }
  introEl.classList.add('is-leaving');
  setTimeout(() => {
    introEl.style.display = 'none';
  }, 600);
  // Mở màn: từ góc gần thẳng đứng quét vòng 52° về góc tổng quan, độ phơi sáng tăng dần
  const target = overviewCamera();
  map.jumpTo({ ...target, zoom: target.zoom - 0.55, pitch: 18, bearing: target.bearing - 52 });
  campus.playIntro(3000);
  map.easeTo({ ...target, duration: 3000, easing: (t) => 1 - Math.pow(1 - t, 3) });
  map.once('moveend', () => startSpin(SPIN_OVERVIEW));
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
  zoom: 16.9,
  pitch: 18,
  bearing: 70,
  attributionControl: false,
  antialias: true,
  maxPitch: 74,
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

const campus = window.CampusScene.create(map, {
  onReady: () => {
    campusCenter = campus.modelToLngLat(campus.center.x, campus.center.z);
    markIntroStep('glb');
  },
  onError: () => {
    campusLoadFailed = true;
    showToast('Không tải được mô hình 3D khuôn viên', true);
    markIntroStep('glb');
    applyLod(1);
  },
});

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

const gateMarkerEls = [];
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
    const stem = document.createElement('span');
    stem.className = 'gate-marker-stem';
    const dot = document.createElement('span');
    dot.className = 'gate-marker-dot';
    el.appendChild(text);
    el.appendChild(stem);
    el.appendChild(dot);
    gateMarkerEls.push(el);
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

const buildingMarkerEl = document.createElement('div');
buildingMarkerEl.className = 'building-marker';
const buildingMarkerLabelEl = document.createElement('span');
buildingMarkerLabelEl.className = 'building-marker-label';
const buildingMarkerStemEl = document.createElement('span');
buildingMarkerStemEl.className = 'building-marker-stem';
const buildingMarkerRingEl = document.createElement('span');
buildingMarkerRingEl.className = 'building-marker-ring';
buildingMarkerEl.appendChild(buildingMarkerLabelEl);
buildingMarkerEl.appendChild(buildingMarkerStemEl);
buildingMarkerEl.appendChild(buildingMarkerRingEl);
// Nhãn tòa nhà đặt trên đỉnh công trình (Marker của MapLibre không có độ cao nên tự chiếu)
map.getContainer().appendChild(buildingMarkerEl);
buildingMarkerEl.style.position = 'absolute';
buildingMarkerEl.style.left = '0';
buildingMarkerEl.style.top = '0';

function updateBuildingMarker() {
  const code = hoveredCode || selectedCode();
  const feat = code ? buildingsList.find((b) => b.properties.building_code === code) : null;
  const anchor = feat ? campus.anchor(code) : null;
  const pos = !feat
    ? null
    : anchor
      ? campus.project(anchor.lngLat, anchor.topM + 1)
      : campus.project(getFeatureCenter(feat), Number(feat.properties.height_m) || 10);
  if (!pos || currentLod === 3 || activePopup) {
    buildingMarkerEl.classList.add('is-hidden');
    return;
  }
  buildingMarkerLabelEl.textContent = getBuildingShortLabel(feat.properties);
  buildingMarkerEl.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  buildingMarkerEl.classList.remove('is-hidden');
}

function startSpin(degPerSec) {
  spinRate = degPerSec;
  spinLast = performance.now();
  if (spinRafId || prefersReducedMotion) return;
  const tick = (now) => {
    if (!spinRate) {
      spinRafId = null;
      return;
    }
    if (!map.isMoving() || isOrbiting) {
      map.setBearing(map.getBearing() + (spinRate * Math.min(now - spinLast, 100)) / 1000);
    }
    spinLast = now;
    spinRafId = requestAnimationFrame(tick);
  };
  spinRafId = requestAnimationFrame(tick);
}

function stopSpin() {
  spinRate = 0;
  clearTimeout(idleTimer);
}

function setOrbit(active) {
  isOrbiting = Boolean(active);
  btnOrbitEl.setAttribute('aria-checked', String(isOrbiting));
  if (isOrbiting) startSpin(SPIN_ORBIT);
  else stopSpin();
}

function setPlacesPanelOpen(open) {
  placesPanelEl.classList.toggle('hidden', !open);
  btnPlacesToggleEl.setAttribute('aria-expanded', String(open));
  hudBottomLeftEl.classList.toggle('hidden', open);
  hudTopLeftEl.classList.toggle('is-dimmed', open);
}

function setInfoPopoverOpen(open) {
  infoPopoverEl.classList.toggle('hidden', !open);
  btnInfoEl.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('is-credits-open', open);
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

function selectedCode() {
  const feat = selectedBuildingIndex >= 0 ? buildingsList[selectedBuildingIndex] : null;
  return feat && feat.properties ? feat.properties.building_code : null;
}

function updateBuildingWallColors() {
  if (!map.getLayer('buildings-lod1')) return;
  const cfg = LIGHTING_CONFIG[currentLighting];
  const code = selectedCode();
  map.setPaintProperty(
    'buildings-lod1',
    'fill-extrusion-color',
    code ? ['match', ['get', 'building_code'], code, '#5B8DB8', cfg.blockColor] : cfg.blockColor
  );
}

const BUILDING_USER_DESCRIPTIONS = {
  A: 'Tổ hợp giảng đường trung tâm, khu hành chính và Thư viện UIT với 3 tầng nội thất 3D chi tiết (LOD 3).',
  B: 'Khối giảng đường hình vòng cung gồm 9 tầng phòng học, văn phòng các khoa và bộ môn.',
  C: 'Dãy giảng đường và cụm phòng máy tính thực hành phục vụ đào tạo chuyên ngành CNTT.',
  D: 'Khu vực hỗ trợ sinh hoạt, dịch vụ học tập và kết nối các tuyến đường nội bộ phía Đông.',
  E: 'Tòa nhà cao nhất tại UIT, kết hợp phòng học, phòng thí nghiệm nghiên cứu, văn phòng khoa và Hội trường E.',
  NHA_PVSV: 'Khu vực căn tin, dịch vụ ăn uống và không gian sinh hoạt chung dành cho sinh viên.',
};

function getBuildingDisplayDesc(props) {
  const raw = props && props.description ? String(props.description).trim() : '';
  const isInternalNote = /osm|kiểm chứng|khảo sát|todo|tam dung|tạm để/i.test(raw);
  const code = String((props && props.building_code) || '').toUpperCase();
  if ((!raw || isInternalNote) && BUILDING_USER_DESCRIPTIONS[code]) {
    return BUILDING_USER_DESCRIPTIONS[code];
  }
  return raw || 'Chưa có mô tả chi tiết.';
}

function getBuildingShortLabel(props) {
  const name = String((props && props.name) || '').trim();
  if (!name) return props && props.building_code ? `Tòa ${props.building_code}` : 'Công trình';
  const shortPart = name.split(' - ')[0].trim();
  return shortPart || name;
}

function getBuildingMetaType(props) {
  const code = String((props && props.building_code) || '').toUpperCase();
  const name = String((props && props.name) || '').toLowerCase();
  if (name.includes('thư viện') || name.includes('library')) return 'amenity';
  if (name.includes('căn tin') || name.includes('canteen')) return 'dining';
  if (['A', 'B', 'C', 'D', 'E'].includes(code)) return 'academic';
  return 'facility';
}

function updateBuildingMarkerVisibility() {
  updateBuildingMarker();
}

function closeBuildingPanel() {
  if (selectedBuildingIndex === -1 && buildingPanelEl.classList.contains('hidden')) return;
  selectedBuildingIndex = -1;
  buildingPanelEl.classList.add('hidden');
  document.body.classList.remove('is-sheet-open');
  tourWrapEl.classList.remove('hidden');
  hudBottomCenterEl.classList.remove('hidden');
  if (colophonEl) colophonEl.classList.remove('is-hidden');
  btnResetViewEl.setAttribute('data-label', 'Đặt lại góc nhìn');
  btnResetViewEl.setAttribute('aria-label', 'Đặt lại góc nhìn');
  btnPlacesToggleEl.classList.remove('is-selected');
  placesCountEl.classList.remove('hidden');
  placesCountEl.textContent = defaultPlacesCount;
  placesTitleEl.textContent = 'Danh sách địa điểm';
  placesSummaryEl.textContent = defaultPlacesSummary;
  updateBuildingWallColors();
  updateBuildingMarker();
  map.easeTo({ ...overviewCamera(), duration: 1600 });
  if (!isOrbiting) map.once('moveend', () => startSpin(SPIN_OVERVIEW));
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

  buildingPanelEl.dataset.meta = getBuildingMetaType(p);
  bpIndexEl.textContent = `${String(normIdx + 1).padStart(2, '0')} — ${String(len).padStart(2, '0')}`;
  bpFloorsEl.textContent = `${floors} TẦNG`;
  bpNameEl.textContent = p.name || p.building_code || 'Công trình';
  bpDescEl.textContent = getBuildingDisplayDesc(p);

  const specs = [
    `Mã công trình: ${p.building_code || '—'}`,
    `Chiều cao mô hình: ${p.height_m != null ? `${p.height_m} m` : '—'}`,
    `Quy mô kết cấu: ${floors} tầng`,
  ];
  if (p.building_code === 'A') {
    specs.push(`Dữ liệu nội thất LOD 3: ${roomsByCode.size || 65} phòng học & chức năng`);
    bpIndoorBoxEl.classList.remove('hidden');
    bpFloorPillsEl.innerHTML = '';
    for (let f = floors; f >= 1; f -= 1) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'sheet__floor-pill';
      pill.textContent = `T${f}`;
      pill.addEventListener('click', () => {
        closeBuildingPanel();
        setFloor(f);
      });
      bpFloorPillsEl.appendChild(pill);
    }
  } else {
    bpIndoorBoxEl.classList.add('hidden');
    bpFloorPillsEl.innerHTML = '';
  }

  bpSpecsEl.innerHTML = '';
  specs.forEach((text, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sheet__num">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(text)}</span>`;
    bpSpecsEl.appendChild(li);
  });

  bpPrevNameEl.textContent = getBuildingShortLabel(prevFeat.properties);
  bpNextNameEl.textContent = getBuildingShortLabel(nextFeat.properties);

  setPlacesPanelOpen(false);
  buildingPanelEl.classList.remove('hidden');
  document.body.classList.add('is-sheet-open');
  tourWrapEl.classList.add('hidden');
  hudBottomCenterEl.classList.add('hidden');
  if (colophonEl) colophonEl.classList.add('is-hidden');
  btnResetViewEl.setAttribute('data-label', 'Về chế độ tổng quan');
  btnResetViewEl.setAttribute('aria-label', 'Về chế độ tổng quan');

  updateBuildingMarker();

  btnPlacesToggleEl.classList.add('is-selected');
  placesCountEl.classList.add('hidden');
  placesTitleEl.textContent = getBuildingShortLabel(p);
  placesSummaryEl.textContent = `${floors} TẦNG · ĐANG CHỌN`;

  updateBuildingWallColors();
  setOrbit(false);
  map.easeTo({ ...focusCamera(feat), duration: 1700 });
  map.once('moveend', () => {
    if (selectedBuildingIndex === normIdx) startSpin(SPIN_SELECTED);
  });
}

// Góc nhìn khi chọn tòa nhà: camera nằm phía ngoài (hướng tâm khuôn viên -> tòa nhà, lệch 22°),
// cách hướng mặt trời ít nhất 52° để mặt tiền được chiếu sáng
function focusCamera(feat) {
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

function getAmenitiesForBuilding(feat) {
  if (!allAmenitiesList.length || !feat || !feat.properties) return [];
  const p = feat.properties;
  const code = String(p.building_code || '').toUpperCase();
  const bId = p.id != null ? Number(p.id) : null;
  const center = getFeatureCenter(feat);
  const cosLat = Math.cos((center[1] * Math.PI) / 180);

  return allAmenitiesList.filter((am) => {
    const ap = am.properties || {};
    if (bId != null && ap.building_id != null) {
      return Number(ap.building_id) === bId;
    }
    const name = String(ap.name || '').toUpperCase();
    if (code && name.includes(`TÒA ${code}`)) return true;
    const coords = am.geometry && am.geometry.coordinates;
    if (!coords) return false;
    const dist = Math.hypot((coords[0] - center[0]) * 111320 * cosLat, (coords[1] - center[1]) * 110540);
    return dist <= 32;
  });
}

function filterBuildingsList(query = '') {
  buildingsListEl.innerHTML = '';
  if (!buildingsList.length) {
    const li = document.createElement('li');
    li.className = 'result-empty';
    li.textContent = 'Chưa có dữ liệu công trình';
    buildingsListEl.appendChild(li);
    return;
  }
  const q = query.trim().toLowerCase();
  const matches = buildingsList
    .map((feat, idx) => ({ feat, idx, amenities: getAmenitiesForBuilding(feat) }))
    .filter(({ feat, amenities }) => {
      if (!q) return true;
      const p = feat.properties || {};
      const matchBld =
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.building_code || '').toLowerCase().includes(q);
      const matchAm = amenities.some((am) =>
        String((am.properties && am.properties.name) || '').toLowerCase().includes(q)
      );
      return matchBld || matchAm;
    });
  if (!matches.length) {
    if (!q || !searchResultsEl.children.length) {
      const li = document.createElement('li');
      li.className = 'result-empty';
      li.textContent = 'Không tìm thấy công trình';
      buildingsListEl.appendChild(li);
    }
    return;
  }
  matches.forEach(({ feat, idx, amenities }) => {
    const p = feat.properties || {};
    const li = document.createElement('li');
    li.className = 'explorer__group-item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loc';
    if (idx === selectedBuildingIndex) btn.classList.add('is-selected');
    const floorsText = p.total_floors ? `${p.total_floors} TẦNG` : '— TẦNG';
    btn.innerHTML = `
      <span class="loc__num">${String(idx + 1).padStart(2, '0')}</span>
      <span class="loc__body">
        <span class="loc__name">${escapeHtml(p.name || p.building_code)}</span>
        <span class="eyebrow loc__meta">${escapeHtml(floorsText)}</span>
      </span>
      <span class="loc__arrow" aria-hidden="true">→</span>
    `;
    btn.addEventListener('click', () => {
      selectBuildingByIndex(idx);
    });
    li.appendChild(btn);

    if (amenities.length) {
      const amWrap = document.createElement('div');
      amWrap.className = 'amenity-group';
      const amHead = document.createElement('div');
      amHead.className = 'eyebrow amenity-group__title';
      amHead.textContent = 'TIỆN ÍCH TRONG TÒA';
      amWrap.appendChild(amHead);

      amenities.forEach((am) => {
        const ap = am.properties || {};
        const amBtn = document.createElement('button');
        amBtn.type = 'button';
        amBtn.className = 'amenity-link';
        const parentLabel = p.name || (p.building_code ? `TÒA ${p.building_code}` : '');
        amBtn.innerHTML = `
          <span class="amenity-link__dot" aria-hidden="true"></span>
          <span class="amenity-link__body">
            <span class="amenity-link__name">${escapeHtml(ap.name || 'Tiện ích')}</span>
            <span class="eyebrow amenity-link__parent">${escapeHtml(parentLabel)}</span>
          </span>
          <span class="amenity-link__arrow" aria-hidden="true">→</span>
        `;
        amBtn.addEventListener('click', () => {
          setPlacesPanelOpen(false);
          const coords = am.geometry && am.geometry.coordinates;
          if (coords) {
            map.flyTo({ center: [coords[0], coords[1]], zoom: 19, pitch: 58, duration: 1200 });
            if (activePopup) activePopup.remove();
            activePopup = new maplibregl.Popup()
              .setLngLat([coords[0], coords[1]])
              .setHTML(`
                <div class="popup-content">
                  <h4>${escapeHtml(ap.name)}</h4>
                  <p><strong>Loại:</strong> ${escapeHtml(ap.category || 'Tiện ích')}</p>
                  <p><strong>Giờ mở cửa:</strong> ${escapeHtml(ap.open_hours || 'Chưa có dữ liệu')}</p>
                </div>
              `)
              .addTo(map);
          }
        });
        amWrap.appendChild(amBtn);
      });
      li.appendChild(amWrap);
    }

    buildingsListEl.appendChild(li);
  });
}

function renderBuildingsList(buildingsFc, amenitiesFc = null) {
  buildingsList = buildingsFc.features || [];
  if (amenitiesFc && Array.isArray(amenitiesFc.features)) {
    allAmenitiesList = amenitiesFc.features;
  }
  filterBuildingsList(searchInputEl.value);
}

function applyLod(lod) {
  if (lod !== 1 && campusLoadFailed) {
    showToast('Không tải được mô hình 3D khuôn viên', true);
    lod = 1;
  }
  currentLod = lod;
  const showIndoor = lod === 3;
  setLayerVisibility('campus-model', lod !== 1);
  setLayerVisibility('lod1-ground', lod === 1);
  setLayerVisibility('buildings-lod1', lod === 1);
  setLayerVisibility('rooms-3d-layer', showIndoor);
  setLayerVisibility('room-highlight', showIndoor);
  // LOD 3: ẩn vỏ Tòa A trong mô hình để thấy các phòng bên trong
  campus.setHidden(showIndoor ? 'A' : null);
  lod3DockEl.classList.toggle('hidden', !showIndoor);
  updateLodButtons();
  updateBuildingMarker();
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
  activePopup.on('close', () => {
    activePopup = null;
    updateBuildingMarkerVisibility();
  });
  updateBuildingMarkerVisibility();
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
    filterBuildingsList(searchInputEl.value);
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
  filterBuildingsList(searchInputEl.value);
}

searchInputEl.addEventListener('input', () => {
  const q = searchInputEl.value.trim();
  filterBuildingsList(q);
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

btnPlacesCloseEl.addEventListener('click', () => {
  setPlacesPanelOpen(false);
});

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
  cachedBuildingsFc = buildingsFc;
  roomsByCode = new Map(roomsFc.features.map((f) => [f.properties.room_code, f.properties]));
  campus.setFootprints(buildingsFc);

  map.addSource('campus-boundary', { type: 'geojson', data: boundaryFc });
  map.addSource('buildings', { type: 'geojson', data: buildingsFc });
  map.addSource('rooms', { type: 'geojson', data: roomsFc });
  map.addSource('radius-circle', { type: 'geojson', data: EMPTY_FC });
  map.addSource('amenities', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route-3d', { type: 'geojson', data: EMPTY_FC });

  const cfg = LIGHTING_CONFIG[currentLighting];

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
      'circle-pitch-alignment': 'map',
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

  // Chọn tòa nhà bằng tia chiếu vào khối footprint (dùng chung cho LOD 1/2/3)
  map.on('mousemove', (e) => {
    if (isPickingLocation || e.originalEvent.buttons) return;
    const code = currentLod === 3 && map.queryRenderedFeatures(e.point, { layers: ['rooms-3d-layer'] }).length
      ? null
      : campus.pick(e.point);
    if (code === hoveredCode) return;
    hoveredCode = code;
    map.getCanvas().style.cursor = code ? 'pointer' : '';
    updateBuildingMarker();
  });
  map.getCanvas().addEventListener('mouseleave', () => {
    hoveredCode = null;
    updateBuildingMarker();
  });

  map.on('click', (e) => {
    if (isPickingLocation) {
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
      return;
    }
    if (currentLod === 3 && map.queryRenderedFeatures(e.point, { layers: ['rooms-3d-layer'] }).length) return;
    const code = campus.pick(e.point);
    const idx = code ? buildingsList.findIndex((b) => b.properties.building_code === code) : -1;
    if (idx >= 0) selectBuildingByIndex(idx);
    else if (selectedBuildingIndex >= 0) closeBuildingPanel();
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

btnOrbitEl.addEventListener('click', () => {
  setOrbit(!isOrbiting);
});

tourCardEl.addEventListener('click', () => {
  if (!buildingsList.length) return;
  const idx = buildingsList.findIndex((b) => b.properties && b.properties.building_code === 'A');
  selectBuildingByIndex(idx >= 0 ? idx : 0);
});

// Người dùng thao tác thì dừng tự xoay, rảnh 6 giây thì xoay chậm trở lại
map.on('movestart', (e) => {
  if (!e.originalEvent) return;
  setOrbit(false);
});
map.on('moveend', (e) => {
  if (!e.originalEvent) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => startSpin(selectedBuildingIndex >= 0 ? SPIN_SELECTED : SPIN_OVERVIEW), 6000);
});

document.getElementById('btn-reset-view').addEventListener('click', () => {
  setOrbit(false);
  if (selectedBuildingIndex >= 0) {
    closeBuildingPanel();
    return;
  }
  map.easeTo({ ...overviewCamera(), duration: 1600 });
  map.once('moveend', () => startSpin(SPIN_OVERVIEW));
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

document.getElementById('toggle-route').addEventListener('change', (e) => {
  setLayerVisibility('route-3d', e.target.checked);
});

document.getElementById('toggle-amenities').addEventListener('change', (e) => {
  setLayerVisibility('amenities-layer', e.target.checked);
});

addGateMarkers();
setLighting(currentLighting);
updateRadiusVisual();

map.on('load', async () => {
  markIntroStep('map');
  try {
    const [buildingsFc, roomsFc, amenitiesFc] = await Promise.all([
      api('/api/buildings').finally(() => markIntroStep('buildings')),
      api('/api/rooms?building_code=A').finally(() => markIntroStep('rooms')),
      api('/api/amenities/nearby?lat=10.8700&lng=106.8030&radius=500').catch((err) => {
        console.error(err);
        return EMPTY_FC;
      }),
    ]);
    initLayers(buildingsFc, roomsFc, CAMPUS_BOUNDARY_FC);
    renderBuildingsList(buildingsFc, amenitiesFc);
    const bCount = buildingsFc.features.length;
    const rCount = roomsFc.features.length;
    const aCount = (amenitiesFc && amenitiesFc.features ? amenitiesFc.features.length : 0);
    defaultPlacesCount = String(bCount).padStart(2, '0');
    defaultPlacesSummary = `${bCount} địa điểm · ${aCount} tiện ích`;
    placesCountEl.textContent = defaultPlacesCount;
    placesSummaryEl.textContent = defaultPlacesSummary;
    placesPanelSummaryEl.textContent = defaultPlacesSummary;
    tourCardSubEl.textContent = `TÒA A · ${bCount} ĐIỂM`;
    introStatsEl.textContent = `${bCount} công trình · ${rCount} phòng Tòa A`;
    setLighting(currentLighting);
    applyLod(campusLoadFailed ? 1 : 2);
    const buildingA = buildingsFc.features.find((f) => f.properties.building_code === 'A');
    renderFloorSwitcher(buildingA && buildingA.properties.total_floors ? buildingA.properties.total_floors : 3);
  } catch (err) {
    console.error(err);
    markIntroStep('glb');
    setLighting(currentLighting);
    renderFloorSwitcher(3);
  }
});
