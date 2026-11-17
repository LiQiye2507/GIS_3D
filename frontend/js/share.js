// Liên kết chia sẻ (?room=<mã> / ?building=<mã>), mã QR và mở đúng đối tượng khi vào trang bằng liên kết
import { state } from './state.js';
import { getFeatureCenter, showToast } from './utils.js';
import { selectRoom } from './rooms.js';
import { selectBuildingByIndex } from './buildings.js';
import { closeIntro } from './intro.js';
import { normalize } from './search.js';

const popoverEl = document.getElementById('share-popover');
const titleEl = document.getElementById('share-title');
const qrEl = document.getElementById('share-qr');
const urlEl = document.getElementById('share-url');

function shareUrl(param, value) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set(param, value);
  return url.href;
}

function openShare(title, url) {
  titleEl.textContent = title;
  urlEl.value = url;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  popoverEl.classList.remove('hidden');
}

document.getElementById('btn-share-room').addEventListener('click', () => {
  const code = state.selectedRoom && state.selectedRoom.room_code;
  if (code) openShare(`Phòng ${code}`, shareUrl('room', code));
});

document.getElementById('bp-share').addEventListener('click', () => {
  const feat = state.buildingsList[state.selectedBuildingIndex];
  if (feat) openShare(feat.properties.name, shareUrl('building', feat.properties.building_code));
});

document.getElementById('share-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(urlEl.value)
    .then(() => showToast('Đã sao chép liên kết'))
    .catch(() => {
      urlEl.select();
      showToast('Không sao chép tự động được, hãy nhấn Ctrl+C', true);
    });
});

document.getElementById('share-close').addEventListener('click', () => popoverEl.classList.add('hidden'));

// Gọi sau khi đã nạp dữ liệu: ?room=A305 (chấp nhận A.305, a305) hoặc ?building=A
export function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  const building = params.get('building');
  if (!room && !building) return;
  closeIntro(true);
  if (room) {
    const feat = state.roomFeatures.find((f) => normalize(f.properties.room_code) === normalize(room));
    if (feat) selectRoom(feat.properties, getFeatureCenter(feat), true);
    else showToast(`Không tìm thấy phòng ${room}`, true);
    return;
  }
  const idx = state.buildingsList.findIndex((b) => b.properties.building_code.toUpperCase() === building.toUpperCase());
  if (idx >= 0) selectBuildingByIndex(idx);
  else showToast(`Không tìm thấy tòa ${building}`, true);
}
