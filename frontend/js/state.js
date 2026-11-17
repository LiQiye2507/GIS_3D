// Trạng thái dùng chung giữa các module
import { DEFAULT_CENTER } from './config.js';

export const state = {
  currentLod: 2,
  campusLoadFailed: false,
  currentLighting: 'day',
  roomsByCode: new Map(),
  selectedRoom: null,
  activePopup: null,
  isPickingLocation: false,
  userPos: null,
  buildingsList: [],
  selectedBuildingIndex: -1,
  defaultPlacesCount: '00',
  defaultPlacesSummary: '0 ĐỊA ĐIỂM · 0 TIỆN ÍCH',
  isOrbiting: false,
  hoveredCode: null,
  campusCenter: DEFAULT_CENTER,
};
