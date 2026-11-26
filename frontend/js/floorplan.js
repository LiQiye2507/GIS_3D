// Sơ đồ mặt bằng 2D theo tầng trong bảng chi tiết tòa: vẽ SVG từ hình học phòng, bấm phòng để mở trên bản đồ
import { ROOM_COLORS, floorShort } from './config.js';
import { state } from './state.js';
import { getFeatureCenter } from './utils.js';
import { selectRoom } from './rooms.js';

const NS = 'http://www.w3.org/2000/svg';
const tabsEl = document.getElementById('bp-floor-tabs');
const svgEl = document.getElementById('bp-plan');
const UNLABELED = ['Corridor', 'Stairs'];

const ring = (f) => f.geometry.coordinates[0];

export function renderFloorPlan(code) {
  const rooms = state.roomFeatures.filter((f) => f.properties.building_code === code);
  const floors = [...new Set(rooms.map((f) => f.properties.floor_number))].sort((a, b) => a - b);
  // đổi sang mét quanh một điểm gốc: SVG vẽ bằng float32, dùng thẳng độ (~106.8) sẽ sai lệch cỡ mét
  // khung chung cho mọi tầng để chuyển tab sơ đồ không nhảy vị trí
  const [lng0, lat0] = rooms.length ? ring(rooms[0])[0] : [0, 0];
  const k = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const meters = ([lng, lat]) => [(lng - lng0) * k, -(lat - lat0) * 110540];
  // xoay theo hướng tường chính (hướng cạnh chiếm tổng chiều dài lớn nhất, mod 90°) để phòng nằm ngang dọc
  const votes = new Map();
  rooms.forEach((f) => ring(f).map(meters).forEach((q, i, r) => {
    if (!i) return;
    const dx = q[0] - r[i - 1][0];
    const dy = q[1] - r[i - 1][1];
    const deg = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 90);
    votes.set(deg, (votes.get(deg) || 0) + Math.hypot(dx, dy));
  }));
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  const rot = best ? (-best[0] * Math.PI) / 180 : 0;
  const rotate = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  // nếu sau khi xoay tòa đứng dọc thì xoay thêm 90° cho vừa khung ngang
  const raw = rooms.flatMap((f) => ring(f).map((q) => rotate(meters(q), rot)));
  const span = (i) => Math.max(...raw.map((p) => p[i])) - Math.min(...raw.map((p) => p[i]));
  const angle = span(1) > span(0) ? rot + Math.PI / 2 : rot;
  const xy = (q) => rotate(meters(q), angle);
  const pts = rooms.flatMap((f) => ring(f).map(xy));
  const minX = Math.min(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const w = Math.max(...pts.map((p) => p[0])) - minX;
  const h = Math.max(...pts.map((p) => p[1])) - minY;
  const pad = Math.max(w, h) * 0.03;
  svgEl.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`);
  const fontSize = Math.max(w, h) / 38;

  function draw(floor) {
    [...tabsEl.children].forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.floor) === floor)));
    svgEl.innerHTML = '';
    // hành lang vẽ trước để phòng nằm đè lên
    const onFloor = rooms
      .filter((f) => f.properties.floor_number === floor)
      .sort((a, b) => (b.properties.room_type === 'Corridor') - (a.properties.room_type === 'Corridor'));
    onFloor.forEach((f) => {
      const p = f.properties;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', p.room_type === 'Corridor' ? 'plan__room is-corridor' : 'plan__room');
      if (state.selectedRoom && state.selectedRoom.room_code === p.room_code) g.classList.add('is-selected');
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', ring(f).map(xy).map((q) => q.join(',')).join(' '));
      poly.setAttribute('fill', ROOM_COLORS[p.room_type] || '#CBD5E1');
      poly.setAttribute('vector-effect', 'non-scaling-stroke');
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${p.room_code} — ${p.room_name || ''}`;
      g.append(poly, title);
      if (!UNLABELED.includes(p.room_type)) {
        const [cx, cy] = xy(getFeatureCenter(f));
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', cx);
        text.setAttribute('y', cy);
        text.setAttribute('font-size', fontSize);
        text.textContent = p.room_code;
        g.appendChild(text);
      }
      if (p.room_type !== 'Corridor') {
        g.addEventListener('click', () => {
          selectRoom(p, getFeatureCenter(f), true);
          draw(floor);
        });
      }
      svgEl.appendChild(g);
    });
  }

  tabsEl.innerHTML = '';
  floors.forEach((f) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plan__tab';
    btn.dataset.floor = f;
    btn.textContent = floorShort(code, f);
    btn.addEventListener('click', () => draw(f));
    tabsEl.appendChild(btn);
  });
  if (floors.length) draw(floors[0]);
}
