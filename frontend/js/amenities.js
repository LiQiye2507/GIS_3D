// Tiện ích: lớp biểu tượng theo danh mục, bộ lọc kiêm chú giải, popup, vị trí giả lập và bán kính
import { AMENITY_COLORS, AMENITY_TYPES, floorNo } from './config.js';
import { state } from './state.js';
import { amenitiesListEl, btnPickLocationEl, radiusFillEl, radiusSliderEl, radiusThumbEl, radiusValueEl } from './dom.js';
import { api, escapeHtml } from './utils.js';
import { campus, liftPopup, map } from './map.js';
import { selectRoom } from './rooms.js';
import { onFrameChange, toView, warpFc } from './frame.js';

const filtersEl = document.getElementById('amenity-filters');
const enabled = new Set(Object.keys(AMENITY_TYPES).filter((k) => AMENITY_TYPES[k].on));
let allAmenities = { type: 'FeatureCollection', features: [] };
let shownAmenities = allAmenities;

export function buildCirclePolygon(centerLng, centerLat, radiusM, steps = 64) {
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

// Biểu tượng tròn màu danh mục + ký hiệu, vẽ bằng canvas (style không có sprite/glyph)
function makeIcon(color, glyph) {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const g = canvas.getContext('2d');
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.font = '30px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText(glyph, s / 2, s / 2 + 2);
  return canvas;
}

// Tiện ích trên tầng cao (vd. phòng ăn tầng 7 Tòa E): lớp symbol chỉ vẽ sát đất,
// nên dùng phần tử HTML đặt theo độ cao thật, cập nhật mỗi khung hình
const RAISED_MIN_Z = 3;
const isRaised = (p) => Number(p.elevation_z) > RAISED_MIN_Z;
const iconUrls = {};
let raised = [];

function syncRaised(fc) {
  raised.forEach((r) => r.el.remove());
  raised = fc.features.filter((f) => isRaised(f.properties)).map((f) => {
    const p = f.properties;
    const el = document.createElement('img');
    el.className = 'amenity-raised';
    el.src = iconUrls[p.category] || '';
    el.alt = p.name;
    el.title = p.name;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isPickingLocation || state.measureMode) return;
      openAmenityPopup(p, f.geometry.coordinates);
    });
    map.getContainer().appendChild(el);
    return { el, f };
  });
  placeRaised();
}

function placeRaised() {
  raised.forEach(({ el, f }) => {
    const pos = enabled.has(f.properties.category) && campus.project(f.geometry.coordinates, Number(f.properties.elevation_z));
    el.hidden = !pos;
    if (pos) el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
  });
}

const typeLabel = (cat) => (AMENITY_TYPES[cat] ? AMENITY_TYPES[cat].label : cat || 'Tiện ích');
const isVisible = (f) => enabled.has(f.properties.category);

export function openAmenityPopup(p, lngLat) {
  // WC / Thư viện là phòng: chọn phòng để có thẻ thông tin, đổi tầng và nút chỉ đường
  if (p.room_code && state.roomsByCode.has(p.room_code)) {
    selectRoom(state.roomsByCode.get(p.room_code), lngLat, true);
    return;
  }
  const rows = [
    ['Loại', typeLabel(p.category)],
    ['Tòa', p.building_code || 'Ngoài trời'],
    ['Tầng', p.floor_number == null ? '—' : floorNo(p.building_code, p.floor_number)],
    ['Giờ mở cửa', p.open_hours || 'Chưa có dữ liệu'],
    ['Trạng thái', p.status || 'Chưa có dữ liệu'],
  ];
  if (p.distance_m != null) rows.push(['Khoảng cách', `${p.distance_m} m`]);
  if (state.activePopup) state.activePopup.remove();
  state.activePopup = new maplibregl.Popup()
    .setLngLat(lngLat)
    .setHTML(`
      <div class="popup-content">
        <h4>${escapeHtml(p.name)}</h4>
        ${rows.map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v ?? '—')}</p>`).join('')}
      </div>
    `)
    .addTo(map);
  state.activePopup.on('close', () => { state.activePopup = null; });
  liftPopup(state.activePopup, lngLat, isRaised(p) ? Number(p.elevation_z) : 0);
}

export function focusAmenity(f) {
  const [lng, lat] = f.geometry.coordinates;
  map.flyTo({ center: [lng, lat], zoom: 19, pitch: 58, duration: 1200 });
  openAmenityPopup(f.properties, [lng, lat]);
}

function renderAmenitiesList() {
  amenitiesListEl.innerHTML = '';
  if (!state.userPos) return;
  const items = shownAmenities.features.filter(isVisible);
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'result-empty';
    li.textContent = 'Không có tiện ích trong bán kính';
    amenitiesListEl.appendChild(li);
    return;
  }
  items.forEach((f) => {
    const p = f.properties;
    const li = document.createElement('li');
    li.className = 'amenity-row';
    li.innerHTML = `
      <button type="button" class="amenity-row__btn">
        <span class="row-name">${escapeHtml(AMENITY_TYPES[p.category] ? AMENITY_TYPES[p.category].icon : '')} ${escapeHtml(p.name)}</span>
        <span class="row-meta-right">${escapeHtml(p.distance_m)} m</span>
      </button>
    `;
    li.firstElementChild.addEventListener('click', () => focusAmenity(f));
    amenitiesListEl.appendChild(li);
  });
}

function applyAmenityFilter() {
  if (map.getLayer('amenities-layer')) {
    map.setFilter('amenities-layer', ['all',
      ['in', ['get', 'category'], ['literal', [...enabled]]],
      ['<=', ['to-number', ['get', 'elevation_z'], 0], RAISED_MIN_Z]]);
  }
  placeRaised();
  renderAmenitiesList();
}

function renderAmenityFilters() {
  const counts = {};
  allAmenities.features.forEach((f) => {
    counts[f.properties.category] = (counts[f.properties.category] || 0) + 1;
  });
  filtersEl.innerHTML = '';
  Object.entries(AMENITY_TYPES).filter(([cat]) => counts[cat]).forEach(([cat, t]) => {
    const label = document.createElement('label');
    label.className = 'amenity-chip';
    label.innerHTML = `
      <input type="checkbox" ${enabled.has(cat) ? 'checked' : ''} />
      <span class="amenity-chip__icon" style="background:${AMENITY_COLORS[cat]}" aria-hidden="true">${t.icon}</span>
      <span>${escapeHtml(t.label)} <small>(${counts[cat]})</small></span>
    `;
    label.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) enabled.add(cat);
      else enabled.delete(cat);
      applyAmenityFilter();
    });
    filtersEl.appendChild(label);
  });
}

export function addAmenityLayer() {
  Object.entries(AMENITY_TYPES).forEach(([cat, t]) => {
    const c = makeIcon(AMENITY_COLORS[cat], t.icon);
    iconUrls[cat] = c.toDataURL();
    if (!map.hasImage(cat)) map.addImage(cat, c.getContext('2d').getImageData(0, 0, c.width, c.height), { pixelRatio: 2 });
  });
  map.on('render', placeRaised);
  map.addLayer({
    id: 'amenities-layer',
    type: 'symbol',
    source: 'amenities',
    layout: {
      'icon-image': ['get', 'category'],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  applyAmenityFilter();
  map.on('mouseenter', 'amenities-layer', () => {
    if (!state.isPickingLocation) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'amenities-layer', () => {
    if (!state.isPickingLocation) map.getCanvas().style.cursor = '';
  });
  map.on('click', 'amenities-layer', (e) => {
    if (state.isPickingLocation || state.measureMode || !e.features.length) return;
    const f = e.features[0];
    openAmenityPopup(f.properties, f.geometry.coordinates);
  });
}

function showAmenitiesOnMap() {
  if (map.getSource('amenities')) map.getSource('amenities').setData(shownAmenities);
  syncRaised(shownAmenities);
}

// Toàn bộ tiện ích của khuôn viên (nạp lúc khởi động) – hiển thị khi chưa chọn vị trí
export function setAllAmenities(fc) {
  // khoảng cách ở đây tính từ tâm khuôn viên cố định, vô nghĩa với người dùng: chỉ hiện khi đã chọn vị trí
  fc.features.forEach((f) => { delete f.properties.distance_m; });
  allAmenities = fc;
  if (!state.userPos) {
    shownAmenities = fc;
    showAmenitiesOnMap();
  }
  renderAmenityFilters();
}

export function updateRadiusVisual() {
  const val = Number(radiusSliderEl.value);
  const min = Number(radiusSliderEl.min);
  const max = Number(radiusSliderEl.max);
  const pct = ((val - min) / (max - min)) * 100;
  radiusValueEl.textContent = `${val} m`;
  radiusFillEl.style.width = `${pct}%`;
  radiusThumbEl.style.left = `${pct}%`;
}

async function updateProximity() {
  if (!state.userPos) return;
  const radius = Number(radiusSliderEl.value);
  const [lng, lat] = state.userPos;
  drawUserPos();
  if (map.getSource('radius-circle')) map.setLayoutProperty('radius-circle', 'visibility', 'visible');
  try {
    const fc = await api(`/api/amenities/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    shownAmenities = warpFc(fc, 'amenities-near');
    showAmenitiesOnMap();
    renderAmenitiesList();
  } catch (err) {
    console.error(err);
  }
}

let userMarker = null;
// Vị trí người dùng (state.userPos, hệ CSDL) và vòng bán kính theo hệ đang hiển thị
function drawUserPos() {
  if (!state.userPos) return;
  const p = toView(state.userPos);
  if (userMarker) userMarker.setLngLat(p);
  else userMarker = new maplibregl.Marker({ color: '#EF4444' }).setLngLat(p).addTo(map);
  if (map.getSource('radius-circle')) map.getSource('radius-circle').setData(buildCirclePolygon(p[0], p[1], Number(radiusSliderEl.value)));
}
onFrameChange(() => {
  showAmenitiesOnMap();
  drawUserPos();
});

// Đặt vị trí người dùng (hệ CSDL: GPS, hoặc điểm chọn trên bản đồ đã đổi bằng toDb) rồi tìm tiện ích trong bán kính
export function setUserPos(lngLat) {
  state.userPos = lngLat;
  updateProximity();
}

export function setPickingMode(active) {
  state.isPickingLocation = active;
  btnPickLocationEl.classList.toggle('active', active);
  btnPickLocationEl.setAttribute('aria-pressed', String(active));
  map.getCanvas().style.cursor = active ? 'crosshair' : '';
}

btnPickLocationEl.addEventListener('click', () => {
  setPickingMode(!state.isPickingLocation);
});

radiusSliderEl.addEventListener('input', () => {
  updateRadiusVisual();
  updateProximity();
});
