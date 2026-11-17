// Gọi API, thông báo, tiện ích nhỏ
import { API, DEFAULT_CENTER } from './config.js';
import { loadingEl, toastEl } from './dom.js';

let toastTimer = null;
let loadingCount = 0;
export function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3500);
}

export async function api(path, signal) {
  loadingCount += 1;
  loadingEl.classList.remove('hidden');
  try {
    const res = await fetch(`${API}${path}`, signal ? { signal } : undefined);
    if (!res.ok) {
      let detail = `Lỗi máy chủ (${res.status})`;
      try {
        const body = await res.json();
        if (body && body.detail) detail = body.detail;
      } catch (err) {
        console.error(err);
      }
      throw new Error(detail);
    }
    return await res.json();
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast(err.message || 'Không thể kết nối máy chủ', true);
    }
    throw err;
  } finally {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) loadingEl.classList.add('hidden');
  }
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getFeatureCenter(feature) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  function walk(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number') {
      if (coords[0] < minLng) minLng = coords[0];
      if (coords[0] > maxLng) maxLng = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
    } else {
      coords.forEach(walk);
    }
  }
  walk(feature.geometry && feature.geometry.coordinates);
  if (!Number.isFinite(minLng)) return DEFAULT_CENTER;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}
