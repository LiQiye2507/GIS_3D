// Tiện ích: lớp biểu tượng theo danh mục, bộ lọc kiêm chú giải, popup, vị trí giả lập và bán kính
import { AMENITY_COLORS, AMENITY_TYPES } from './config.js';
import { state } from './state.js';
import { amenitiesListEl, btnPickLocationEl, radiusFillEl, radiusSliderEl, radiusThumbEl, radiusValueEl } from './dom.js';
import { api, escapeHtml } from './utils.js';
import { map } from './map.js';
import { selectRoom } from './rooms.js';

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
  return g.getImageData(0, 0, s, s);
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
    ['Tầng', p.floor_number],
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
    map.setFilter('amenities-layer', ['in', ['get', 'category'], ['literal', [...enabled]]]);
  }
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
    if (!map.hasImage(cat)) map.addImage(cat, makeIcon(AMENITY_COLORS[cat], t.icon), { pixelRatio: 2 });
  });
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
    if (state.isPickingLocation || !e.features.length) return;
    const f = e.features[0];
    openAmenityPopup(f.properties, f.geometry.coordinates);
  });
}

// Toàn bộ tiện ích của khuôn viên (nạp lúc khởi động) – hiển thị khi chưa chọn vị trí
export function setAllAmenities(fc) {
  allAmenities = fc;
  if (!state.userPos) {
    shownAmenities = fc;
    if (map.getSource('amenities')) map.getSource('amenities').setData(fc);
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

export async function updateProximity() {
  if (!state.userPos) return;
  const radius = Number(radiusSliderEl.value);
  const [lng, lat] = state.userPos;
  if (map.getSource('radius-circle')) {
    map.getSource('radius-circle').setData(buildCirclePolygon(lng, lat, radius));
    map.setLayoutProperty('radius-circle', 'visibility', 'visible');
  }
  try {
    const fc = await api(`/api/amenities/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    shownAmenities = fc;
    if (map.getSource('amenities')) {
      map.getSource('amenities').setData(fc);
    }
    renderAmenitiesList();
  } catch (err) {
    console.error(err);
  }
}

let userMarker = null;
// Đặt vị trí người dùng (chọn trên bản đồ hoặc GPS) rồi tìm tiện ích trong bán kính
export function setUserPos(lngLat) {
  state.userPos = lngLat;
  if (userMarker) userMarker.setLngLat(lngLat);
  else userMarker = new maplibregl.Marker({ color: '#EF4444' }).setLngLat(lngLat).addTo(map);
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
