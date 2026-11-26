// Tìm tiện ích gần nhất theo loại (WC, căn tin, ATM...) tính từ vị trí hiện tại, mặc định Cổng A
import { AMENITY_TYPES, GATE_A, floorName } from './config.js';
import { state } from './state.js';
import { api, showToast } from './utils.js';
import { focusAmenity } from './amenities.js';
import { warpFc } from './frame.js';

document.querySelectorAll('[data-nearest]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const category = btn.dataset.nearest;
    const label = AMENITY_TYPES[category].label;
    const [lng, lat] = state.userPos || GATE_A;
    const origin = state.userPos ? 'vị trí của bạn' : 'Cổng A (chưa chọn vị trí)';
    try {
      const fc = warpFc(await api(`/api/amenities/nearby?lat=${lat}&lng=${lng}&radius=500&category=${category}`), 'nearest');
      // API xếp theo khoảng cách ngang; WC các tầng chồng lên nhau nên cộng chi phí leo cầu thang
      // (~6 m thang/tầng × hệ số 2.5 như campus_paths) để ưu tiên tầng thấp
      const score = (f) => Number(f.properties.distance_m) + ((Number(f.properties.floor_number) || 1) - 1) * 15;
      const nearest = [...fc.features].sort((a, b) => score(a) - score(b))[0];
      if (!nearest) {
        showToast(`Không có ${label} trong bán kính 500 m quanh ${origin}`, true);
        return;
      }
      focusAmenity(nearest);
      const { building_code: code, floor_number: fl } = nearest.properties;
      const floor = Number(fl) > 1 ? ` (${floorName(code, Number(fl)).toLowerCase()})` : '';
      showToast(`${label} gần nhất: ${nearest.properties.name}${floor}, cách ${origin} ${nearest.properties.distance_m} m`);
    } catch (err) {
      console.error(err);
    }
  });
});
