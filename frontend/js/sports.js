// Lớp sân thể thao: trong suốt trên nền model, tô màu khi rê chuột / khi chọn, bấm để xem thông tin
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { campus, map } from './map.js';

const COLOR = '#f59e0b';
let hoveredId = null;
let selectedId = null;

function setFlag(id, key, value) {
  if (id != null) map.setFeatureState({ source: 'sports-fields', id }, { [key]: value });
}

function openSportsPopup(p, lngLat) {
  const rows = [
    ['Mã sân', p.field_code],
    ['Loại sân', p.sport_type || 'Chưa xác định'],
    ['Diện tích', `${p.area_m2} m²`],
    ['Giờ mở cửa', p.open_hours || 'Chưa có dữ liệu'],
  ];
  if (state.activePopup) state.activePopup.remove();
  setFlag(selectedId, 'selected', false);
  selectedId = p.field_code;
  setFlag(selectedId, 'selected', true);
  state.activePopup = new maplibregl.Popup()
    .setLngLat(lngLat)
    .setHTML(`
      <div class="popup-content">
        <h4>${escapeHtml(p.name)}</h4>
        ${rows.map(([k, v]) => `<p><strong>${k}:</strong> ${escapeHtml(v)}</p>`).join('')}
        ${p.verified ? '' : '<p><em>Vị trí tách từ mô hình 3D, chưa kiểm chứng thực địa</em></p>'}
      </div>
    `)
    .addTo(map);
  const popup = state.activePopup;
  popup.on('close', () => {
    if (state.activePopup === popup) state.activePopup = null;
    if (selectedId === p.field_code) {
      setFlag(selectedId, 'selected', false);
      selectedId = null;
    }
  });
}

export function initSportsLayer(fc) {
  map.addSource('sports-fields', { type: 'geojson', data: fc, promoteId: 'field_code' });
  // vẽ sau model (lớp 2D không bị model che), dưới các lớp trong nhà / chỉ đường
  const state3 = (on, off) => ['case', ['boolean', ['feature-state', 'selected'], false], on,
    ['boolean', ['feature-state', 'hover'], false], on * 0.6, off];
  map.addLayer({
    id: 'sports-fill',
    type: 'fill',
    source: 'sports-fields',
    paint: { 'fill-color': COLOR, 'fill-opacity': state3(0.4, 0) },
  }, 'indoor-base');
  map.addLayer({
    id: 'sports-outline',
    type: 'line',
    source: 'sports-fields',
    paint: { 'line-color': COLOR, 'line-width': 2, 'line-opacity': state3(1, 0) },
  }, 'indoor-base');

  map.on('mousemove', 'sports-fill', (e) => {
    const id = e.features[0]?.id;
    if (id === hoveredId) return;
    setFlag(hoveredId, 'hover', false);
    hoveredId = id;
    setFlag(hoveredId, 'hover', true);
  });
  map.on('mouseleave', 'sports-fill', () => {
    setFlag(hoveredId, 'hover', false);
    hoveredId = null;
  });
  map.on('click', 'sports-fill', (e) => {
    if (state.isPickingLocation || state.measureMode || !e.features.length) return;
    // tòa nhà, tiện ích, phòng nằm phía trước sân thì ưu tiên chúng
    if (map.queryRenderedFeatures(e.point, { layers: ['amenities-layer'] }).length) return;
    if (state.currentLod === 3 && map.queryRenderedFeatures(e.point, { layers: ['rooms-3d-layer'] }).length) return;
    if (campus.pick(e.point)) return;
    openSportsPopup(e.features[0].properties, [e.lngLat.lng, e.lngLat.lat]);
  });
}
