// Truy vấn phòng theo thuộc tính (tòa, tầng, loại, sức chứa >= N): lọc trên dữ liệu đã nạp, tô màu và liệt kê kết quả
import { ROOM_LABELS, floorName, floorShort } from './config.js';
import { state } from './state.js';
import { escapeHtml, getFeatureCenter } from './utils.js';
import { map } from './map.js';
import { setFloor, setIndoorBuilding } from './layers.js';
import { selectRoom } from './rooms.js';

const formEl = document.getElementById('query-form');
const buildingEl = document.getElementById('q-building');
const floorEl = document.getElementById('q-floor');
const typeEl = document.getElementById('q-type');
const capacityEl = document.getElementById('q-capacity');
const summaryEl = document.getElementById('query-summary');
const resultsEl = document.getElementById('query-results');

Object.entries(ROOM_LABELS)
  .filter(([type]) => type !== 'Corridor')
  .forEach(([type, label]) => typeEl.add(new Option(label, type)));

export function renderFloorOptions() {
  const feat = state.buildingsList.find((b) => b.properties.building_code === buildingEl.value);
  const floors = (feat && feat.properties.total_floors) || 3;
  floorEl.length = 1;
  for (let f = 1; f <= floors; f += 1) floorEl.add(new Option(floorName(buildingEl.value, f), String(f)));
}
buildingEl.addEventListener('change', renderFloorOptions);

// Trả về { matches, missingCapacity }: phòng thỏa điều kiện và số phòng bị loại vì chưa có sức chứa
function queryRooms({ building, floor, type, minCapacity }) {
  let missingCapacity = 0;
  const matches = state.roomFeatures.filter(({ properties: p }) => {
    if (p.room_type === 'Corridor' || p.building_code !== building) return false;
    if (floor != null && p.floor_number !== floor) return false;
    if (type && p.room_type !== type) return false;
    if (minCapacity != null) {
      if (p.capacity == null) {
        missingCapacity += 1;
        return false;
      }
      if (p.capacity < minCapacity) return false;
    }
    return true;
  });
  return { matches, missingCapacity };
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const cap = capacityEl.value.trim();
  const criteria = {
    building: buildingEl.value,
    floor: floorEl.value ? Number(floorEl.value) : null,
    type: typeEl.value,
    minCapacity: cap === '' ? null : Math.max(0, Number(cap)),
  };
  const { matches, missingCapacity } = queryRooms(criteria);

  map.setFilter('rooms-query', ['in', ['get', 'room_code'], ['literal', matches.map((f) => f.properties.room_code)]]);
  setIndoorBuilding(criteria.building);
  setFloor(criteria.floor);

  summaryEl.textContent = `${matches.length} phòng thỏa điều kiện (tô màu hồng)`
    + (missingCapacity ? ` · ${missingCapacity} phòng chưa có dữ liệu sức chứa nên không xét` : '');
  resultsEl.innerHTML = '';
  matches.forEach((f) => {
    const p = f.properties;
    const li = document.createElement('li');
    li.innerHTML = `
      <button type="button" class="panel-row-btn">
        <span class="row-name">${escapeHtml(p.room_code)} – ${escapeHtml(p.room_name)}</span>
        <span class="row-meta-right">${escapeHtml(floorShort(p.building_code, p.floor_number))}${p.capacity != null ? ` · ${escapeHtml(p.capacity)} chỗ` : ''}</span>
      </button>
    `;
    li.firstElementChild.addEventListener('click', () => selectRoom(p, getFeatureCenter(f), true));
    resultsEl.appendChild(li);
  });
});
