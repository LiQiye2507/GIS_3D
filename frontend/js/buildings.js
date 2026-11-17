// Danh sách tòa nhà, bảng chi tiết, nhãn trên nóc
import { LIGHTING_CONFIG, SPIN_OVERVIEW, SPIN_SELECTED } from './config.js';
import { state } from './state.js';
import { bpCloseEl, bpDescEl, bpFloorPillsEl, bpFloorsEl, bpIndexEl, bpIndoorBoxEl, bpNameEl, bpNextEl, bpNextNameEl, bpPrevEl, bpPrevNameEl, bpSpecsEl, bpViewIndoorEl, btnPlacesCloseEl, btnPlacesToggleEl, btnResetViewEl, buildingPanelEl, buildingsListEl, colophonEl, hudBottomCenterEl, hudBottomLeftEl, hudTopLeftEl, placesCountEl, placesPanelEl, placesSummaryEl, placesTitleEl, searchInputEl, searchResultsEl, tourCardEl, tourWrapEl } from './dom.js';
import { escapeHtml, getFeatureCenter } from './utils.js';
import { campus, map } from './map.js';
import { focusCamera, overviewCamera, setOrbit, startSpin } from './camera.js';
import { applyLod, setFloor } from './layers.js';

let allAmenitiesList = [];
const buildingMarkerEl = document.createElement('div');
buildingMarkerEl.className = 'building-marker';
const buildingMarkerLabelEl = document.createElement('span');
buildingMarkerLabelEl.className = 'building-marker-label';
const buildingMarkerStemEl = document.createElement('span');
buildingMarkerStemEl.className = 'building-marker-stem';
const buildingMarkerRingEl = document.createElement('span');
buildingMarkerRingEl.className = 'building-marker-ring';
buildingMarkerEl.appendChild(buildingMarkerLabelEl);
buildingMarkerEl.appendChild(buildingMarkerStemEl);
buildingMarkerEl.appendChild(buildingMarkerRingEl);
// Nhãn tòa nhà đặt trên đỉnh công trình (Marker của MapLibre không có độ cao nên tự chiếu)
map.getContainer().appendChild(buildingMarkerEl);
buildingMarkerEl.style.position = 'absolute';
buildingMarkerEl.style.left = '0';
buildingMarkerEl.style.top = '0';

export function updateBuildingMarker() {
  const code = state.hoveredCode || selectedCode();
  const feat = code ? state.buildingsList.find((b) => b.properties.building_code === code) : null;
  const anchor = feat ? campus.anchor(code) : null;
  const pos = !feat
    ? null
    : anchor
      ? campus.project(anchor.lngLat, anchor.topM + 1)
      : campus.project(getFeatureCenter(feat), Number(feat.properties.height_m) || 10);
  if (!pos || state.currentLod === 3 || state.activePopup) {
    buildingMarkerEl.classList.add('is-hidden');
    return;
  }
  buildingMarkerLabelEl.textContent = getBuildingShortLabel(feat.properties);
  buildingMarkerEl.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  buildingMarkerEl.classList.remove('is-hidden');
}

export function setPlacesPanelOpen(open) {
  placesPanelEl.classList.toggle('hidden', !open);
  btnPlacesToggleEl.setAttribute('aria-expanded', String(open));
  hudBottomLeftEl.classList.toggle('hidden', open);
  hudTopLeftEl.classList.toggle('is-dimmed', open);
}

function selectedCode() {
  const feat = state.selectedBuildingIndex >= 0 ? state.buildingsList[state.selectedBuildingIndex] : null;
  return feat && feat.properties ? feat.properties.building_code : null;
}

export function updateBuildingWallColors() {
  if (!map.getLayer('buildings-lod1')) return;
  const cfg = LIGHTING_CONFIG[state.currentLighting];
  const code = selectedCode();
  map.setPaintProperty(
    'buildings-lod1',
    'fill-extrusion-color',
    code ? ['match', ['get', 'building_code'], code, '#5B8DB8', cfg.blockColor] : cfg.blockColor
  );
}

const BUILDING_USER_DESCRIPTIONS = {
  A: 'Tổ hợp giảng đường trung tâm, khu hành chính và Thư viện UIT với 3 tầng nội thất 3D chi tiết (LOD 3).',
  B: 'Khối giảng đường hình vòng cung gồm 9 tầng phòng học, văn phòng các khoa và bộ môn.',
  C: 'Dãy giảng đường và cụm phòng máy tính thực hành phục vụ đào tạo chuyên ngành CNTT.',
  D: 'Khu vực hỗ trợ sinh hoạt, dịch vụ học tập và kết nối các tuyến đường nội bộ phía Đông.',
  E: 'Tòa nhà cao nhất tại UIT, kết hợp phòng học, phòng thí nghiệm nghiên cứu, văn phòng khoa và Hội trường E.',
  NHA_PVSV: 'Khu vực căn tin, dịch vụ ăn uống và không gian sinh hoạt chung dành cho sinh viên.',
};

function getBuildingDisplayDesc(props) {
  const raw = props && props.description ? String(props.description).trim() : '';
  const isInternalNote = /osm|kiểm chứng|khảo sát|todo|tam dung|tạm để/i.test(raw);
  const code = String((props && props.building_code) || '').toUpperCase();
  if ((!raw || isInternalNote) && BUILDING_USER_DESCRIPTIONS[code]) {
    return BUILDING_USER_DESCRIPTIONS[code];
  }
  return raw || 'Chưa có mô tả chi tiết.';
}

function getBuildingShortLabel(props) {
  const name = String((props && props.name) || '').trim();
  if (!name) return props && props.building_code ? `Tòa ${props.building_code}` : 'Công trình';
  const shortPart = name.split(' - ')[0].trim();
  return shortPart || name;
}

function getBuildingMetaType(props) {
  const code = String((props && props.building_code) || '').toUpperCase();
  const name = String((props && props.name) || '').toLowerCase();
  if (name.includes('thư viện') || name.includes('library')) return 'amenity';
  if (name.includes('căn tin') || name.includes('canteen')) return 'dining';
  if (['A', 'B', 'C', 'D', 'E'].includes(code)) return 'academic';
  return 'facility';
}

export function closeBuildingPanel() {
  if (state.selectedBuildingIndex === -1 && buildingPanelEl.classList.contains('hidden')) return;
  state.selectedBuildingIndex = -1;
  buildingPanelEl.classList.add('hidden');
  document.body.classList.remove('is-sheet-open');
  tourWrapEl.classList.remove('hidden');
  hudBottomCenterEl.classList.remove('hidden');
  if (colophonEl) colophonEl.classList.remove('is-hidden');
  btnResetViewEl.setAttribute('data-label', 'Đặt lại góc nhìn');
  btnResetViewEl.setAttribute('aria-label', 'Đặt lại góc nhìn');
  btnPlacesToggleEl.classList.remove('is-selected');
  placesCountEl.classList.remove('hidden');
  placesCountEl.textContent = state.defaultPlacesCount;
  placesTitleEl.textContent = 'Danh sách địa điểm';
  placesSummaryEl.textContent = state.defaultPlacesSummary;
  updateBuildingWallColors();
  updateBuildingMarker();
  map.easeTo({ ...overviewCamera(), duration: 1600 });
  if (!state.isOrbiting) map.once('moveend', () => startSpin(SPIN_OVERVIEW));
}

export function selectBuildingByIndex(idx) {
  if (!state.buildingsList.length) return;
  const len = state.buildingsList.length;
  const normIdx = ((idx % len) + len) % len;
  state.selectedBuildingIndex = normIdx;

  const feat = state.buildingsList[normIdx];
  const p = feat.properties || {};
  const floors = p.total_floors || 1;
  const prevFeat = state.buildingsList[(normIdx - 1 + len) % len];
  const nextFeat = state.buildingsList[(normIdx + 1) % len];

  buildingPanelEl.dataset.meta = getBuildingMetaType(p);
  bpIndexEl.textContent = `${String(normIdx + 1).padStart(2, '0')} — ${String(len).padStart(2, '0')}`;
  bpFloorsEl.textContent = `${floors} TẦNG`;
  bpNameEl.textContent = p.name || p.building_code || 'Công trình';
  bpDescEl.textContent = getBuildingDisplayDesc(p);

  const specs = [
    `Mã công trình: ${p.building_code || '—'}`,
    `Chiều cao mô hình: ${p.height_m != null ? `${p.height_m} m` : '—'}`,
    `Quy mô kết cấu: ${floors} tầng`,
  ];
  if (p.building_code === 'A') {
    specs.push(`Dữ liệu nội thất LOD 3: ${state.roomsByCode.size || 65} phòng học & chức năng`);
    bpIndoorBoxEl.classList.remove('hidden');
    bpFloorPillsEl.innerHTML = '';
    for (let f = floors; f >= 1; f -= 1) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'sheet__floor-pill';
      pill.textContent = `T${f}`;
      pill.addEventListener('click', () => {
        closeBuildingPanel();
        setFloor(f);
      });
      bpFloorPillsEl.appendChild(pill);
    }
  } else {
    bpIndoorBoxEl.classList.add('hidden');
    bpFloorPillsEl.innerHTML = '';
  }

  bpSpecsEl.innerHTML = '';
  specs.forEach((text, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sheet__num">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(text)}</span>`;
    bpSpecsEl.appendChild(li);
  });

  bpPrevNameEl.textContent = getBuildingShortLabel(prevFeat.properties);
  bpNextNameEl.textContent = getBuildingShortLabel(nextFeat.properties);

  setPlacesPanelOpen(false);
  buildingPanelEl.classList.remove('hidden');
  document.body.classList.add('is-sheet-open');
  tourWrapEl.classList.add('hidden');
  hudBottomCenterEl.classList.add('hidden');
  if (colophonEl) colophonEl.classList.add('is-hidden');
  btnResetViewEl.setAttribute('data-label', 'Về chế độ tổng quan');
  btnResetViewEl.setAttribute('aria-label', 'Về chế độ tổng quan');

  updateBuildingMarker();

  btnPlacesToggleEl.classList.add('is-selected');
  placesCountEl.classList.add('hidden');
  placesTitleEl.textContent = getBuildingShortLabel(p);
  placesSummaryEl.textContent = `${floors} TẦNG · ĐANG CHỌN`;

  updateBuildingWallColors();
  setOrbit(false);
  map.easeTo({ ...focusCamera(feat), duration: 1700 });
  map.once('moveend', () => {
    if (state.selectedBuildingIndex === normIdx) startSpin(SPIN_SELECTED);
  });
}

function getAmenitiesForBuilding(feat) {
  if (!allAmenitiesList.length || !feat || !feat.properties) return [];
  const p = feat.properties;
  const code = String(p.building_code || '').toUpperCase();
  const bId = p.id != null ? Number(p.id) : null;
  const center = getFeatureCenter(feat);
  const cosLat = Math.cos((center[1] * Math.PI) / 180);

  return allAmenitiesList.filter((am) => {
    const ap = am.properties || {};
    if (bId != null && ap.building_id != null) {
      return Number(ap.building_id) === bId;
    }
    const name = String(ap.name || '').toUpperCase();
    if (code && name.includes(`TÒA ${code}`)) return true;
    const coords = am.geometry && am.geometry.coordinates;
    if (!coords) return false;
    const dist = Math.hypot((coords[0] - center[0]) * 111320 * cosLat, (coords[1] - center[1]) * 110540);
    return dist <= 32;
  });
}

export function filterBuildingsList(query = '') {
  buildingsListEl.innerHTML = '';
  if (!state.buildingsList.length) {
    const li = document.createElement('li');
    li.className = 'result-empty';
    li.textContent = 'Chưa có dữ liệu công trình';
    buildingsListEl.appendChild(li);
    return;
  }
  const q = query.trim().toLowerCase();
  const matches = state.buildingsList
    .map((feat, idx) => ({ feat, idx, amenities: getAmenitiesForBuilding(feat) }))
    .filter(({ feat, amenities }) => {
      if (!q) return true;
      const p = feat.properties || {};
      const matchBld =
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.building_code || '').toLowerCase().includes(q);
      const matchAm = amenities.some((am) =>
        String((am.properties && am.properties.name) || '').toLowerCase().includes(q)
      );
      return matchBld || matchAm;
    });
  if (!matches.length) {
    if (!q || !searchResultsEl.children.length) {
      const li = document.createElement('li');
      li.className = 'result-empty';
      li.textContent = 'Không tìm thấy công trình';
      buildingsListEl.appendChild(li);
    }
    return;
  }
  matches.forEach(({ feat, idx, amenities }) => {
    const p = feat.properties || {};
    const li = document.createElement('li');
    li.className = 'explorer__group-item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'loc';
    if (idx === state.selectedBuildingIndex) btn.classList.add('is-selected');
    const floorsText = p.total_floors ? `${p.total_floors} TẦNG` : '— TẦNG';
    btn.innerHTML = `
      <span class="loc__num">${String(idx + 1).padStart(2, '0')}</span>
      <span class="loc__body">
        <span class="loc__name">${escapeHtml(p.name || p.building_code)}</span>
        <span class="eyebrow loc__meta">${escapeHtml(floorsText)}</span>
      </span>
      <span class="loc__arrow" aria-hidden="true">→</span>
    `;
    btn.addEventListener('click', () => {
      selectBuildingByIndex(idx);
    });
    li.appendChild(btn);

    if (amenities.length) {
      const amWrap = document.createElement('div');
      amWrap.className = 'amenity-group';
      const amHead = document.createElement('div');
      amHead.className = 'eyebrow amenity-group__title';
      amHead.textContent = 'TIỆN ÍCH TRONG TÒA';
      amWrap.appendChild(amHead);

      amenities.forEach((am) => {
        const ap = am.properties || {};
        const amBtn = document.createElement('button');
        amBtn.type = 'button';
        amBtn.className = 'amenity-link';
        const parentLabel = p.name || (p.building_code ? `TÒA ${p.building_code}` : '');
        amBtn.innerHTML = `
          <span class="amenity-link__dot" aria-hidden="true"></span>
          <span class="amenity-link__body">
            <span class="amenity-link__name">${escapeHtml(ap.name || 'Tiện ích')}</span>
            <span class="eyebrow amenity-link__parent">${escapeHtml(parentLabel)}</span>
          </span>
          <span class="amenity-link__arrow" aria-hidden="true">→</span>
        `;
        amBtn.addEventListener('click', () => {
          setPlacesPanelOpen(false);
          const coords = am.geometry && am.geometry.coordinates;
          if (coords) {
            map.flyTo({ center: [coords[0], coords[1]], zoom: 19, pitch: 58, duration: 1200 });
            if (state.activePopup) state.activePopup.remove();
            state.activePopup = new maplibregl.Popup()
              .setLngLat([coords[0], coords[1]])
              .setHTML(`
                <div class="popup-content">
                  <h4>${escapeHtml(ap.name)}</h4>
                  <p><strong>Loại:</strong> ${escapeHtml(ap.category || 'Tiện ích')}</p>
                  <p><strong>Giờ mở cửa:</strong> ${escapeHtml(ap.open_hours || 'Chưa có dữ liệu')}</p>
                </div>
              `)
              .addTo(map);
          }
        });
        amWrap.appendChild(amBtn);
      });
      li.appendChild(amWrap);
    }

    buildingsListEl.appendChild(li);
  });
}

export function renderBuildingsList(buildingsFc, amenitiesFc = null) {
  state.buildingsList = buildingsFc.features || [];
  if (amenitiesFc && Array.isArray(amenitiesFc.features)) {
    allAmenitiesList = amenitiesFc.features;
  }
  filterBuildingsList(searchInputEl.value);
}

btnPlacesToggleEl.addEventListener('click', () => {
  const isHidden = placesPanelEl.classList.contains('hidden');
  setPlacesPanelOpen(isHidden);
});

btnPlacesCloseEl.addEventListener('click', () => {
  setPlacesPanelOpen(false);
});

bpCloseEl.addEventListener('click', closeBuildingPanel);
bpPrevEl.addEventListener('click', () => {
  if (state.buildingsList.length) selectBuildingByIndex(state.selectedBuildingIndex - 1);
});
bpNextEl.addEventListener('click', () => {
  if (state.buildingsList.length) selectBuildingByIndex(state.selectedBuildingIndex + 1);
});
bpViewIndoorEl.addEventListener('click', () => {
  closeBuildingPanel();
  applyLod(3);
});

tourCardEl.addEventListener('click', () => {
  if (!state.buildingsList.length) return;
  const idx = state.buildingsList.findIndex((b) => b.properties && b.properties.building_code === 'A');
  selectBuildingByIndex(idx >= 0 ? idx : 0);
});
