// Tìm kiếm: gợi ý khi gõ, không dấu, gõ sai nhẹ vẫn ra (Fuse.js), ưu tiên mã phòng khớp chính xác
import Fuse from 'fuse.js';
import { AMENITY_TYPES, floorShort } from './config.js';
import { state } from './state.js';
import { searchInputEl, searchResultsEl } from './dom.js';
import { escapeHtml, getFeatureCenter } from './utils.js';
import { selectRoom } from './rooms.js';
import { filterBuildingsList, selectBuildingByIndex } from './buildings.js';
import { focusAmenity } from './amenities.js';
import { focusSportsField } from './sports.js';

// "Phòng A.305 Đ" -> "phonga305d": bỏ dấu, đ -> d, chữ thường, bỏ dấu chấm / gạch / khoảng trắng
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[\s.\-_]/g, '');
}

// Mã phòng thật dạng A305 / C312 (chấp nhận gõ A.305)
const ROOM_CODE_RE = /^[a-z]\d{3}$/;

let fuse = null;
let items = [];
let debounceTimer = null;

export function buildSearchIndex(amenitiesFc, sportsFc) {
  items = [
    ...state.roomFeatures
      .filter((f) => f.properties.room_type !== 'Corridor')
      .map((f) => ({
        kind: 'room',
        code: normalize(f.properties.room_code),
        name: normalize(f.properties.room_name),
        label: `${f.properties.room_code} – ${f.properties.room_name}`,
        meta: `${f.properties.building_code} · ${floorShort(f.properties.building_code, f.properties.floor_number)}`,
        feature: f,
      })),
    ...state.buildingsList.map((f, idx) => ({
      kind: 'building',
      code: normalize(f.properties.building_code),
      name: normalize(f.properties.name),
      label: f.properties.name,
      meta: `${f.properties.total_floors || '?'} tầng`,
      idx,
    })),
    ...amenitiesFc.features
      .filter((f) => !f.properties.room_code)
      .map((f) => ({
        kind: 'amenity',
        code: normalize(f.properties.category),
        name: normalize(`${f.properties.name} ${AMENITY_TYPES[f.properties.category]?.label || ''}`),
        label: f.properties.name,
        meta: AMENITY_TYPES[f.properties.category]?.label || f.properties.category,
        feature: f,
      })),
    ...sportsFc.features.map((f) => ({
      kind: 'sports',
      code: normalize(f.properties.field_code),
      name: normalize(`${f.properties.name} ${f.properties.sport_type || ''}`),
      label: f.properties.name,
      meta: `${f.properties.field_code} · ${f.properties.area_m2} m²`,
      feature: f,
    })),
  ];
  fuse = new Fuse(items, {
    keys: [{ name: 'code', weight: 2 }, { name: 'name', weight: 1 }],
    threshold: 0.3,
    ignoreLocation: true,
  });
}

export function search(query, limit = 10) {
  const q = normalize(query);
  if (!q || !fuse) return [];
  const exact = ROOM_CODE_RE.test(q) ? items.filter((it) => it.kind === 'room' && it.code === q) : [];
  const fuzzy = fuse.search(q, { limit }).map((r) => r.item).filter((it) => !exact.includes(it));
  return [...exact, ...fuzzy].slice(0, limit);
}

function openResult(item) {
  if (item.kind === 'room') {
    selectRoom(item.feature.properties, getFeatureCenter(item.feature), true);
  } else if (item.kind === 'building') {
    selectBuildingByIndex(item.idx);
  } else if (item.kind === 'sports') {
    focusSportsField(item.feature);
  } else {
    focusAmenity(item.feature);
  }
}

const KIND_LABEL = { room: 'Phòng', building: 'Tòa', amenity: 'Tiện ích', sports: 'Sân' };

function renderResults(results) {
  searchResultsEl.innerHTML = '';
  if (!results.length) {
    searchResultsEl.innerHTML = '<li class="result-empty">Không tìm thấy kết quả</li>';
    return;
  }
  results.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="panel-row-btn" role="option">
        <span class="row-name"><span class="result-kind">${KIND_LABEL[item.kind]}</span>${escapeHtml(item.label)}</span>
        <span class="row-meta-right">${escapeHtml(item.meta)}</span>
      </button>
    `;
    li.firstElementChild.addEventListener('click', () => openResult(item));
    searchResultsEl.appendChild(li);
  });
}

searchInputEl.addEventListener('input', () => {
  const q = searchInputEl.value.trim();
  clearTimeout(debounceTimer);
  if (!q) {
    searchResultsEl.innerHTML = '';
    filterBuildingsList('');
    return;
  }
  debounceTimer = setTimeout(() => {
    renderResults(search(q));
    filterBuildingsList(q);
  }, 300);
});

// Enter: mở ngay kết quả đầu tiên
searchInputEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const first = search(searchInputEl.value.trim())[0];
  if (first) openResult(first);
});
