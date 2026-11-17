// Bảng màu và vật liệu theo chế độ ánh sáng ngày / hoàng hôn / đêm
import * as THREE from 'three';
import { DEG } from './geo.js';

export const MODE_T = { day: 0, sunset: 0.5, night: 1 };
export const MODE_SECONDS = 2.8;

// Bảng màu ánh sáng theo thứ tự [ngày, hoàng hôn, đêm]
export const PALETTE = {
  key: ['#ffefdc', '#ffb375', '#c2cfe6'],
  keyIntensity: [4.9, 3.6, 2.05],
  keyAngle: [[58, 27], [2, 15], [-55, 32]],
  ambSky: ['#c9dcec', '#6c82bb', '#3d4b68'],
  ambGround: ['#2f363d', '#3d3038', '#101520'],
  ambIntensity: [0.08, 0.19, 0.3],
  rim: [0.35, 0.32, 0.3],
  fill: [0.15, 0.12, 0.09],
  env: [0.26, 0.19, 0.24],
  exposure: [1.14, 1.08, 0.94],
};

// Ban đêm: cửa sổ và đèn phát sáng, bề mặt tối dần theo vai trò vật liệu
export const NIGHT_EMISSIVE = {
  'UIT_glasswindow_main.004': { color: '#ffd7a8', intensity: 1.05, ramp: [0.3, 0.94] },
  'UIT_glasswindow_supporting.004': { color: '#ffd7a8', intensity: 0.86, ramp: [0.3, 0.94] },
  UIT_WindowGlass_Reflective_Web: { color: '#ffd4a2', intensity: 0.95, ramp: [0.32, 0.96] },
  UIT_window_glass: { color: '#ffd6a8', intensity: 0.88, ramp: [0.34, 0.96] },
  'Material.009': { color: '#ffcb92', intensity: 2.6, ramp: [0.38, 1] },
  L_UIT_Wall_Azure_PBR: { color: '#e6ecf8', intensity: 1.75, ramp: [0.4, 1] },
  L_uit_wall_azure_PBR: { color: '#ffeed2', intensity: 2.7, ramp: [0.42, 1] },
  L_M05_Graphite_Haze: { color: '#8fbfd6', intensity: 0.55, ramp: [0.46, 1] },
  uit_logo: { color: '#c6d9e4', intensity: 0.3, ramp: [0.46, 1] },
};
export const NIGHT_ALBEDO = {
  glass: { color: '#0b1219', mix: 0.62 },
  grass: { color: '#33413a', mix: 0.84 },
  deck: { color: '#26302b', mix: 0.95 },
  road: { color: '#79808c', mix: 0.92 },
  wallWhite: { color: '#39424f', mix: 0.44 },
  kerb: { color: '#39424f', mix: 0.44 },
  roofMetal: { color: '#3b424c', mix: 0.92 },
  roof: { color: '#2f2a2e', mix: 0.74 },
  wall: { color: '#2f3540', mix: 0.58 },
  court: { color: '#1f2530', mix: 0.82 },
  prop: { color: '#272d37', mix: 0.66 },
};

export const dir = (az, el) => {
  const a = az * DEG;
  const e = el * DEG;
  const c = Math.cos(e);
  return new THREE.Vector3(Math.sin(a) * c, Math.sin(e), Math.cos(a) * c).normalize();
};
export const lerpN = (a, b, k) => a + (b - a) * k;
export const tri = (arr, t, mix) => (t <= 0.5 ? mix(arr[0], arr[1], t * 2) : mix(arr[1], arr[2], (t - 0.5) * 2));
export const triColor = (arr, t) => tri(arr, t, (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k));
export const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

export function roleOf(name) {
  const n = name.toLowerCase();
  if (n.includes('glass') || n.includes('window')) return 'glass';
  if (n.includes('grass')) return 'grass';
  if (n.includes('road') || n.includes('asphalt')) return 'road';
  if (n.includes('wall_white')) return 'wallWhite';
  if (n.includes('vanilla_cream')) return 'kerb';
  if (n.includes('roof_metal')) return 'roofMetal';
  if (n.includes('roof_mint')) return 'deck';
  if (n.includes('roof')) return 'roof';
  if (n === 'uit_wall_azure_pbr') return 'court';
  if (n.includes('wall')) return 'wall';
  return 'prop';
}
