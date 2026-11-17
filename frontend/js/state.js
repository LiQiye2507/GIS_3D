// Trạng thái dùng chung giữa các module
import { DEFAULT_CENTER } from './config.js';

export const state = {
  currentLod: 2,
  campusLoadFailed: false,
  currentLighting: 'day',
  roomsByCode: new Map(),
  roomFeatures: [],
  indoorCode: 'A',
  selectedRoom: null,
  activePopup: null,
  isPickingLocation: false,
  measureMode: null,
  userPos: null,
  buildingsList: [],
  selectedBuildingIndex: -1,
  defaultPlacesCount: '00',
  defaultPlacesSummary: '0 ĐỊA ĐIỂM · 0 TIỆN ÍCH',
  hoveredCode: null,
  campusCenter: DEFAULT_CENTER,
};
