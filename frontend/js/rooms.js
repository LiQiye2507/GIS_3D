// Phòng: popup, thẻ thông tin, tìm kiếm
import { ROOM_LABELS } from './config.js';
import { state } from './state.js';
import { roomCardEl, searchInputEl, searchResultsEl } from './dom.js';
import { api, escapeHtml } from './utils.js';
import { map } from './map.js';
import { applyHighlightFilter, setFloor } from './layers.js';
import { filterBuildingsList, setPlacesPanelOpen, updateBuildingMarker } from './buildings.js';

let searchAbortController = null;
let searchDebounceTimer = null;
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
  if (state.activePopup) state.activePopup.remove();
  state.activePopup = new maplibregl.Popup()
    .setLngLat(lngLat)
    .setHTML(buildRoomPopupHtml(room))
    .addTo(map);
  state.activePopup.on('close', () => {
    state.activePopup = null;
    updateBuildingMarker();
  });
  updateBuildingMarker();
}

export function selectRoom(roomData, lngLat, shouldFly = false) {
  const cached = state.roomsByCode.get(roomData.room_code) || {};
  const merged = { ...cached, ...roomData };
  state.selectedRoom = merged;

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
