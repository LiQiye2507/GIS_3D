// Phòng: popup, thẻ thông tin, chọn phòng
import { ROOM_LABELS } from './config.js';
import { state } from './state.js';
import { roomCardEl } from './dom.js';
import { escapeHtml } from './utils.js';
import { map } from './map.js';
import { applyHighlightFilter, setFloor, setIndoorBuilding } from './layers.js';
import { setPlacesPanelOpen, updateBuildingMarker } from './buildings.js';
import { stopSpin } from './camera.js';

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
  if (merged.building_code) setIndoorBuilding(merged.building_code);

  if (shouldFly && merged.floor_number != null) {
    setFloor(merged.floor_number);
  }
  applyHighlightFilter();
  renderRoomCard(merged);
  setPlacesPanelOpen(true);

  if (lngLat) {
    if (shouldFly) {
      stopSpin();
      // Điện thoại: danh sách là bottom sheet 55vh nên đẩy phòng lên nửa trên màn hình
      const mobile = window.matchMedia('(max-width: 720px)').matches;
      map.flyTo({ center: lngLat, zoom: 19.5, pitch: 60, ...(mobile && { padding: { top: 40, bottom: innerHeight * 0.55, left: 0, right: 0 } }) });
    }
    openRoomPopup(lngLat, merged);
  }
}
