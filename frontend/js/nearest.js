// Tìm tiện ích gần nhất theo loại (WC, căn tin, ATM...) tính từ vị trí hiện tại, mặc định Cổng A
import { AMENITY_TYPES, GATE_A } from './config.js';
import { state } from './state.js';
import { api, showToast } from './utils.js';
import { focusAmenity } from './amenities.js';

document.querySelectorAll('[data-nearest]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const category = btn.dataset.nearest;
    const label = AMENITY_TYPES[category].label;
    const [lng, lat] = state.userPos || GATE_A;
    const origin = state.userPos ? 'vị trí của bạn' : 'Cổng A (chưa chọn vị trí)';
    try {
      const fc = await api(`/api/amenities/nearby?lat=${lat}&lng=${lng}&radius=500&category=${category}`);
      const nearest = fc.features[0];
      if (!nearest) {
        showToast(`Không có ${label} trong bán kính 500 m quanh ${origin}`, true);
        return;
      }
      focusAmenity(nearest);
      showToast(`${label} gần nhất: ${nearest.properties.name}, cách ${origin} ${nearest.properties.distance_m} m`);
    } catch (err) {
      console.error(err);
    }
  });
});
