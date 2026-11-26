// Mặt cắt ngang mô hình và công cụ đo: khoảng cách (m), diện tích (m²), chiều cao tòa (từ CSDL)
import area from '@turf/area';
import length from '@turf/length';
import { state } from './state.js';
import { campus, map } from './map.js';
import { buildRoute3dPolygons } from './route.js';

const resultEl = document.getElementById('measure-result');
const clipSliderEl = document.getElementById('clip-slider');
const clipValueEl = document.getElementById('clip-value');
const buttons = document.querySelectorAll('[data-measure]');
const HINTS = {
  distance: 'Nhấp lần lượt các điểm trên bản đồ để đo quãng đường.',
  area: 'Nhấp ít nhất 3 điểm để khoanh vùng cần đo diện tích.',
  height: 'Nhấp vào một tòa nhà để xem chiều cao.',
};
let points = [];

clipSliderEl.addEventListener('input', () => {
  const h = Number(clipSliderEl.value);
  const off = h >= Number(clipSliderEl.max);
  campus.setClip(off ? null : h);
  map.setLayoutProperty('clip-base', 'visibility', off ? 'none' : 'visible');
  clipValueEl.textContent = off ? 'Tắt' : `Cắt ở độ cao ${h} m`;
});

function draw() {
  const line = { type: 'Feature', properties: { path_type: 'Walkway' }, geometry: { type: 'LineString', coordinates: points } };
  const closed = state.measureMode === 'area' && points.length >= 3 ? [...points, points[0]] : points;
  const ribbons = buildRoute3dPolygons({ features: [{ ...line, geometry: { ...line.geometry, coordinates: closed } }] }).features;
  const fill = closed.length >= 4
    ? [{ type: 'Feature', properties: { base: 0.7, height: 0.75 }, geometry: { type: 'Polygon', coordinates: [closed] } }]
    : [];
  const data = { type: 'FeatureCollection', features: [...fill, ...ribbons] };
  if (map.getSource('measure')) {
    map.getSource('measure').setData(data);
    return;
  }
  map.addSource('measure', { type: 'geojson', data });
  map.addLayer({
    id: 'measure',
    type: 'fill-extrusion',
    source: 'measure',
    paint: {
      'fill-extrusion-color': '#FACC15',
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-opacity': 0.85,
    },
  });
}

function showResult() {
  if (state.measureMode === 'distance' && points.length >= 2) {
    const m = length({ type: 'LineString', coordinates: points }, { units: 'kilometers' }) * 1000;
    resultEl.textContent = `Khoảng cách: ${m.toFixed(1)} m (${points.length} điểm)`;
  } else if (state.measureMode === 'area' && points.length >= 3) {
    const ring = [...points, points[0]];
    const m2 = area({ type: 'Polygon', coordinates: [ring] });
    const perimeter = length({ type: 'LineString', coordinates: ring }, { units: 'kilometers' }) * 1000;
    resultEl.textContent = `Diện tích: ${m2.toFixed(1)} m² · Chu vi: ${perimeter.toFixed(1)} m`;
  }
}

function setMode(mode) {
  state.measureMode = mode;
  points = [];
  draw();
  buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.measure === mode)));
  map.getCanvas().style.cursor = mode ? 'crosshair' : '';
  resultEl.textContent = mode ? HINTS[mode] : 'Chọn công cụ rồi nhấp lên bản đồ.';
}

// Rời nhóm Đo đạc (đóng ngăn/chuyển nhóm) thì tắt chế độ đo, tránh nhấp bản đồ không phản hồi mà không thấy lý do
export function endMeasure() {
  if (state.measureMode) setMode(null);
}

buttons.forEach((btn) => {
  btn.addEventListener('click', () => setMode(state.measureMode === btn.dataset.measure ? null : btn.dataset.measure));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.measureMode) setMode(null);
});

map.on('click', (e) => {
  if (!state.measureMode) return;
  if (state.measureMode === 'height') {
    const code = campus.pick(e.point);
    const feat = code && state.buildingsList.find((b) => b.properties.building_code === code);
    resultEl.textContent = feat
      ? `${feat.properties.name}: cao ${feat.properties.height_m} m · ${feat.properties.total_floors} tầng (theo CSDL)`
      : 'Hãy nhấp đúng vào một tòa nhà.';
    return;
  }
  points.push([e.lngLat.lng, e.lngLat.lat]);
  draw();
  showResult();
});
