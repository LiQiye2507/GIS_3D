const API = 'http://localhost:8000';
const DEFAULT_CENTER = [106.8030, 10.8700];
const DEFAULT_ZOOM = 17.5;
const DEFAULT_PITCH = 60;
const DEFAULT_BEARING = -20;

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
    light: { anchor: 'map', color: '#ffffff', intensity: 0.45, position: [1.15, 210, 30] },
    buildingColor: '#E9E4D8',
    rasterBrightness: 1,
    nightIcon: false,
  },
  sunset: {
    label: 'Hoàng hôn',
    light: { anchor: 'map', color: '#FFB27A', intensity: 0.55, position: [1.15, 260, 20] },
    buildingColor: '#E8C7A8',
    rasterBrightness: 1,
    nightIcon: false,
  },
  night: {
    label: 'Ban đêm',
    light: { anchor: 'map', color: '#8FA8FF', intensity: 0.25, position: [1.15, 210, 30] },
    buildingColor: '#3A4250',
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

const loadingEl = document.getElementById('loading');
const toastEl = document.getElementById('toast');
const floorSwitcherEl = document.getElementById('floor-switcher');
const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const roomCardEl = document.getElementById('room-card');
const routeSummaryEl = document.getElementById('route-summary');
const btnPickLocationEl = document.getElementById('btn-pick-location');
const radiusSliderEl = document.getElementById('radius-slider');
const radiusValueEl = document.getElementById('radius-value');
const amenitiesListEl = document.getElementById('amenities-list');
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
      } catch (_) {}
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

const map = new maplibregl.Map({
  container: 'map',
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  pitch: DEFAULT_PITCH,
  bearing: DEFAULT_BEARING,
  attributionControl: false,
  style: {
    version: 8,
    sources: {
      dark: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
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
      { id: 'dark-layer', type: 'raster', source: 'dark' },
      {
        id: 'osm-layer',
        type: 'raster',
        source: 'osm',
        layout: { visibility: 'none' },
      },
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
map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

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

  lightingValueEl.textContent = cfg.label;
  lightingSliderEl.value = String(idx);
  const knobPositions = ['16px', '50%', 'calc(100% - 16px)'];
  lightingKnobEl.style.left = knobPositions[idx];
  lightingIconSunEl.classList.toggle('hidden', cfg.nightIcon);
  lightingIconMoonEl.classList.toggle('hidden', !cfg.nightIcon);

  if (!map.isStyleLoaded()) return;

  map.setLight(cfg.light);
  ['buildings-3d-layer', 'building-a-shell'].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'fill-extrusion-color', cfg.buildingColor);
    }
  });
  ['dark-layer', 'osm-layer', 'satellite-layer'].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'raster-brightness-max', cfg.rasterBrightness);
    }
  });
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
  const items = [{ label: 'Tất cả', value: null }];
  for (let f = totalFloors; f >= 1; f -= 1) {
    items.push({ label: `T${f}`, value: f });
  }
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
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
    btn.className = 'result-item';
    btn.textContent = `${item.room_code} – ${item.room_name} (Tầng ${item.floor_number})`;
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
    } catch (_) {}
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
    li.className = 'result-item';
    li.textContent = `${p.name} – ${p.category} – ${p.distance_m} m`;
    amenitiesListEl.appendChild(li);
  });
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
  } catch (_) {}
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
  radiusValueEl.textContent = `${radiusSliderEl.value} m`;
  updateProximity();
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
  } catch (_) {}
});

function initLayers(buildingsFc, roomsFc) {
  roomsByCode = new Map(roomsFc.features.map((f) => [f.properties.room_code, f.properties]));

  map.addSource('buildings', { type: 'geojson', data: buildingsFc });
  map.addSource('rooms', { type: 'geojson', data: roomsFc });
  map.addSource('radius-circle', { type: 'geojson', data: EMPTY_FC });
  map.addSource('amenities', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route', { type: 'geojson', data: EMPTY_FC });
  map.addSource('route-3d', { type: 'geojson', data: EMPTY_FC });

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

  const initialColor = LIGHTING_CONFIG[currentLighting].buildingColor;

  map.addLayer({
    id: 'buildings-3d-layer',
    type: 'fill-extrusion',
    source: 'buildings',
    filter: ['!=', ['get', 'building_code'], 'A'],
    paint: {
      'fill-extrusion-color': initialColor,
      'fill-extrusion-base': ['coalesce', ['get', 'base_elevation'], 0],
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
      'fill-extrusion-color': initialColor,
      'fill-extrusion-base': ['coalesce', ['get', 'base_elevation'], 0],
      'fill-extrusion-height': ['coalesce', ['get', 'height_m'], 12],
      'fill-extrusion-opacity': 0.9,
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

function createBuildingAGlbLayer(props) {
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
        },
        undefined,
        () => {
          glbLoadFailed = true;
          if (currentLod === 2) {
            showToast('Không tải được mô hình LOD 2', true);
            applyLod(prevLodBeforeLod2);
          }
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

map.on('load', async () => {
  try {
    const [buildingsFc, roomsFc] = await Promise.all([
      api('/api/buildings'),
      api('/api/rooms?building_code=A'),
    ]);
    initLayers(buildingsFc, roomsFc);
    setLighting(currentLighting);
    const buildingA = buildingsFc.features.find((f) => f.properties.building_code === 'A');
    if (
      buildingA &&
      buildingA.properties.glb_model_url &&
      buildingA.properties.anchor_lng != null &&
      buildingA.properties.anchor_lat != null
    ) {
      map.addLayer(createBuildingAGlbLayer(buildingA.properties));
      // Custom layer không tự đọc layout.visibility lúc addLayer trong MapLibre 4.7
      setLayerVisibility('building-a-glb', false);
    }
    const totalFloors = buildingA && buildingA.properties.total_floors ? buildingA.properties.total_floors : 3;
    renderFloorSwitcher(totalFloors);
  } catch (_) {
    setLighting(currentLighting);
    renderFloorSwitcher(3);
  }
});
