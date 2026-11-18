// "Vị trí của tôi": Geolocation API + vòng tròn sai số; chỉ chính xác ngoài trời
import { CAMPUS_BOUNDARY_FC } from './config.js';
import { showToast } from './utils.js';
import { map } from './map.js';
import { buildCirclePolygon, setUserPos } from './amenities.js';
import { pointInRing } from './campus/geo.js';
import { onFrameChange, toView } from './frame.js';

const btnEl = document.getElementById('btn-geolocate');

const ERRORS = {
  1: 'Bạn đã từ chối quyền vị trí. Hãy bật lại trong cài đặt trình duyệt hoặc dùng "Click chọn vị trí giả lập".',
  2: 'Không xác định được vị trí (mất tín hiệu GPS/mạng). Hãy dùng "Click chọn vị trí giả lập".',
  3: 'Hết thời gian chờ định vị. Hãy thử lại hoặc dùng "Click chọn vị trí giả lập".',
};

let lastFix = null; // [lng, lat, sai số m] theo hệ CSDL (GPS là vị trí thật)
onFrameChange(() => { if (lastFix) showAccuracy(...lastFix); });

function showAccuracy(lng, lat, accuracyM) {
  lastFix = [lng, lat, accuracyM];
  const [x, y] = toView([lng, lat]);
  const data = buildCirclePolygon(x, y, accuracyM);
  if (map.getSource('accuracy-circle')) {
    map.getSource('accuracy-circle').setData(data);
    return;
  }
  map.addSource('accuracy-circle', { type: 'geojson', data });
  // fill-extrusion mỏng để không bị mô hình 3D che (lớp fill 2D nằm dưới mô hình)
  map.addLayer({
    id: 'accuracy-circle',
    type: 'fill-extrusion',
    source: 'accuracy-circle',
    paint: {
      'fill-extrusion-color': '#F97316',
      'fill-extrusion-base': 1.0,
      'fill-extrusion-height': 1.1,
      'fill-extrusion-opacity': 0.25,
    },
  }, 'route-3d');
}

const LABEL = btnEl.textContent.trim();
function setBusy(busy) {
  btnEl.disabled = busy;
  btnEl.textContent = busy ? 'Đang định vị…' : LABEL;
}

btnEl.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    showToast('Trình duyệt không hỗ trợ định vị', true);
    return;
  }
  setBusy(true);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      setBusy(false);
      const pos = [coords.longitude, coords.latitude];
      const accuracy = Math.max(5, Math.round(coords.accuracy));
      showAccuracy(pos[0], pos[1], accuracy);
      setUserPos(pos);
      map.flyTo({ center: toView(pos), zoom: Math.min(19, 18.6 - Math.log2(accuracy / 30)) });
      const inside = pointInRing(pos[0], pos[1], CAMPUS_BOUNDARY_FC.features[0].geometry.coordinates[0]);
      showToast(inside
        ? `Đã định vị, sai số khoảng ${accuracy} m`
        : `Bạn đang ở ngoài khuôn viên UIT (sai số ${accuracy} m)`, !inside);
    },
    (err) => {
      setBusy(false);
      showToast(ERRORS[err.code] || 'Không định vị được', true);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
});
