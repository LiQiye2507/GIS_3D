/*
 * Lớp 3D toàn khuôn viên (MapLibre custom layer + Three.js).
 * Mô hình "University of Information Technology - UIT" của Heli Ton (CC BY 4.0), tách theo tòa (node Root_*)
 * bằng Models_3D/scripts. Nắn về WGS84 bằng phép đồng dạng ngang trong geo.js; độ cao mô hình tính bằng mét.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { DEG, GEO, SAT_ALIGN, SAT_PIVOT, hull, lngLatToModel, modelBearing, modelToLngLat, pointInRing, rot } from './geo.js';
import { MODE_SECONDS, MODE_T, NIGHT_ALBEDO, NIGHT_EMISSIVE, PALETTE, dir, lerpN, roleOf, smooth, tri, triColor } from './palette.js';

const MODEL_URL = 'models/uit_campus.glb';
const DRACO_PATH = 'https://unpkg.com/three@0.165.0/examples/jsm/libs/draco/gltf/';

// Node gốc của từng tòa trong mô hình -> building_code
const ROOT_NODES = {
  A: 'Root_Toa_A', B: 'Root_Toa_B', C: 'Root_Toa_C', D: 'Root_Toa_D', E: 'Root_Toa_E',
  NHA_PVSV: 'Root_Nha_PVSV', CAFE_VOI: 'Root_Cafe_Voi',
};
// Sơ đồ model giữ vị trí gốc của mô hình; chế độ vệ tinh dời, xoay từng tòa theo SAT_ALIGN (geo.js).
// Footprint nhận vào (setFootprints) luôn ở hệ mô hình gốc.
const ZERO = [0, 0];
// (mét Đông, mét Bắc) -> (x, z) trong hệ mô hình
const metersToModel = ([e, n]) => [(e * Math.cos(rot) + n * Math.sin(rot)) / GEO.scale, (e * Math.sin(rot) - n * Math.cos(rot)) / GEO.scale];
// Nhà xe phía Bắc Tòa A (mái dài + mái nhỏ) nằm trong lưới nền nên bị ẩn cùng nền ở chế độ vệ tinh.
// Khung mái trong hệ mô hình (x, z), nới 0.6 m; tam giác có tâm trong khung được tách ra node riêng.
const PARKING_RINGS = [
  [[-138.2, -91.7], [-128.6, -82.1], [-54.3, -156.5], [-63.8, -166.2]],
  [[-53.9, -177.1], [-64.8, -166.4], [-50.5, -152.2], [-39.6, -162.9]],
];
// Ở chế độ vệ tinh dời nhà xe (mét Đông, mét Bắc) cho khớp mái xanh thật trên ảnh Esri World Imagery.
const PARKING_SAT_SHIFT_M = [-11.5, -47];

export function create(map, { onReady, onError, onProgress } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const sun = new THREE.DirectionalLight('#ffefdc', 4.9);
  const rim = new THREE.DirectionalLight('#c9dcec', 0.35);
  const fill = new THREE.DirectionalLight('#8ea6be', 0.15);
  const ambient = new THREE.HemisphereLight('#c9dcec', '#2f363d', 0.08);
  const clipUniform = { value: 1e6 };
  const buildingRoots = {};
  let hiddenCode = null; // nhớ tòa đang ẩn để áp lại khi model nạp xong (mở bằng ?room=)
  const applyHidden = () => Object.entries(buildingRoots).forEach(([c, node]) => { node.visible = c !== hiddenCode; });
  const tuned = [];
  let depthMatClipped = null;
  const pickMeshes = [];
  const mvp = new THREE.Matrix4();
  const mvpInv = new THREE.Matrix4();
  const tmp4 = new THREE.Vector4();
  const tmpV = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  // Lưới các tam giác "mặt thấp" (cao 0.05–2 m: quảng trường, bậc thềm, vỉa hè) theo ô 2 m trên mặt phẳng x-z,
  // dựng 1 lần khi cần; tra độ cao 1 điểm chỉ xét vài tam giác trong ô (bắn tia vào cả model mất ~10 ms/điểm).
  const LOW_MAX = 2;
  const CELL = 2;
  let lowTris = null;
  const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  function buildLowTris() {
    lowTris = new Map();
    if (!modelRoot) return;
    modelRoot.updateMatrixWorld(true);
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const bb = new THREE.Box3();
    modelRoot.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !shown(o)) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      bb.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
      if (bb.min.y > LOW_MAX || bb.max.y < 0.05) return;
      const pos = g.getAttribute('position');
      const idx = g.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i + 2 < n; i += 3) {
        for (let k = 0; k < 3; k += 1) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
        const ymax = Math.max(v[0].y, v[1].y, v[2].y);
        if (ymax > LOW_MAX || ymax < 0.05) continue; // mái / tầng trên, hoặc mặt đất phẳng
        const area = (v[1].x - v[0].x) * (v[2].z - v[0].z) - (v[2].x - v[0].x) * (v[1].z - v[0].z);
        if (Math.abs(area) < 1e-4) continue; // mặt đứng (thành bậc, tường)
        const t = [v[0].x, v[0].y, v[0].z, v[1].x, v[1].y, v[1].z, v[2].x, v[2].y, v[2].z, area];
        const [x0, x1] = [Math.min(t[0], t[3], t[6]), Math.max(t[0], t[3], t[6])];
        const [z0, z1] = [Math.min(t[2], t[5], t[8]), Math.max(t[2], t[5], t[8])];
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx += 1) {
          for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz += 1) {
            const key = `${cx},${cz}`;
            if (!lowTris.has(key)) lowTris.set(key, []);
            lowTris.get(key).push(t);
          }
        }
      }
    });
  }

  const origin = maplibregl.MercatorCoordinate.fromLngLat([GEO.lng, GEO.lat], 0);
  const mv = origin.meterInMercatorCoordinateUnits();
  const ms = mv * GEO.scale;
  // Ngang: GEO.scale mét/đơn vị; đứng (trục z sau khi xoay): 1 mét/đơn vị
  const modelMatrix = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .scale(new THREE.Vector3(ms, -ms, mv))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeRotationY(rot));

  let renderer = null;
  let modelRoot = null;
  let footprintRings = [];
  const anchors = {};
  let ready = false;
  // Chế độ vệ tinh: chỉ giữ các tòa (Root_*). Nền sa bàn cách điệu rộng hơn khuôn viên thật
  // và đế dày ~17 m nằm dưới mặt bản đồ, nên ẩn đi để ảnh vệ tinh làm mặt đất.
  let satellite = false;
  const plinth = [];
  let parkingNode = null;
  const base = {}; // vị trí, hướng gốc của node Root_* trong mô hình
  const yAxis = new THREE.Vector3(0, 1, 0);
  // Góc xoay (rad, quanh trục y của mô hình) của tòa ở chế độ hiện tại; độ trong SAT_ALIGN theo chiều kim đồng hồ
  const turnOf = (code) => (satellite && SAT_ALIGN[code] ? -(SAT_ALIGN[code][2] || 0) * DEG : 0);
  // Điểm (x, z) của mô hình gốc -> vị trí hiển thị: xoay quanh SAT_PIVOT rồi dời (chỉ ở chế độ vệ tinh)
  const toShown = (code, x, z) => {
    const s = satellite && SAT_ALIGN[code];
    if (!s) return [x, z];
    const [dx, dz] = metersToModel(s);
    const t = turnOf(code);
    const c = SAT_PIVOT[code] ? lngLatToModel(...SAT_PIVOT[code]) : { x, z };
    const rx = x - c.x;
    const rz = z - c.z;
    return [c.x + rx * Math.cos(t) + rz * Math.sin(t) + dx, c.z - rx * Math.sin(t) + rz * Math.cos(t) + dz];
  };
  // atModel = true: đặt tòa ở vị trí mô hình gốc (để dò mái, tách lưới nền); false: theo chế độ hiện tại
  const placeNodes = (atModel) => {
    Object.entries(base).forEach(([code, b]) => {
      const node = buildingRoots[code];
      const [x, z] = atModel ? [b.pos.x, b.pos.z] : toShown(code, b.pos.x, b.pos.z);
      node.position.set(x, b.pos.y, z);
      node.quaternion.setFromAxisAngle(yAxis, atModel ? 0 : turnOf(code)).multiply(b.quat);
    });
    if (modelRoot) modelRoot.updateMatrixWorld(true);
    lowTris = null; // tòa vừa dời / ẩn hiện: dựng lại lưới mặt thấp khi cần
  };
  const applySatellite = () => {
    if (modelRoot) modelRoot.children.forEach((o) => { if (!o.name.startsWith('Root_')) o.visible = !satellite; });
    plinth.forEach((o) => { o.visible = !satellite; });
    if (parkingNode) {
      const [dx, dz] = metersToModel(satellite ? PARKING_SAT_SHIFT_M : ZERO);
      parkingNode.position.set(dx, 0, dz);
    }
    placeNodes(false);
    // khối chọn dựng ở hệ mô hình gốc: v -> toShown(v) = xoay(v) + ảnh của gốc tọa độ
    pickMeshes.forEach((m) => {
      const { code } = m.userData;
      const [x, z] = toShown(code, 0, 0);
      m.position.set(x, 0, z);
      m.quaternion.setFromAxisAngle(yAxis, turnOf(code));
      m.updateMatrixWorld();
    });
  };
  let envDone = false;
  let center = new THREE.Vector3();
  let radius = 1;
  let modeT = 0;
  let modeFrom = 0;
  let modeTarget = 0;
  let modeStart = -1;
  let introStart = -1;
  let introMs = 0;
  let onFrame = null;

  // Tòa nhà (dưới node Root_*) bị mặt cắt ngang bỏ phần cao hơn uClipY; mặt đất, đường, cây thì không
  const isBuildingPart = (o) => {
    for (let p = o; p; p = p.parent) if (Object.values(buildingRoots).includes(p)) return true;
    return false;
  };

  function patchMaterial(mat, grade, clip = true) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uClipY = clipUniform;
      shader.vertexShader = 'varying vec3 vCampusPos;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n vCampusPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
      let frag = 'uniform float uClipY;\nvarying vec3 vCampusPos;\n' + shader.fragmentShader.replace(
        'void main() {',
        clip ? `void main() {
          if (vCampusPos.y > uClipY) discard;` : 'void main() {'
      );
      if (grade) {
        frag = frag.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          { float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, ${grade[0].toFixed(3)}) * ${grade[1].toFixed(3)}; }`
        );
      }
      shader.fragmentShader = frag;
    };
    mat.customProgramCacheKey = () => `campus-${mat.type}-${grade ? grade.join('-') : 'plain'}-${clip}`;
  }

  function tuneMaterials(root) {
    const seen = new Set();
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // Vật liệu bóng đổ cũng bỏ phần bị cắt ngang
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchMaterial(depthMat, null);
    depthMatClipped = depthMat;
    const groundDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchMaterial(groundDepthMat, null, false);
    // Vật liệu dùng chung giữa nhà và nền: phần nền dùng bản sao không bị cắt
    const groundCopies = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.customDepthMaterial = depthMat;
      if (!isBuildingPart(o) && o.material && !Array.isArray(o.material)) {
        if (!groundCopies.has(o.material)) {
          const copy = o.material.clone();
          copy.userData.clipped = o.material;
          groundCopies.set(o.material, copy);
        }
        o.material = groundCopies.get(o.material);
        o.customDepthMaterial = groundDepthMat;
      }
      // tinh chỉnh cả vật liệu gốc của bản sao: adoptStrays có thể chạy sau và dùng lại nó
      (Array.isArray(o.material) ? o.material : [o.material, o.material && o.material.userData.clipped]).forEach((mat) => {
        if (!mat || seen.has(mat) || !mat.color) return;
        seen.add(mat);
        if (mat.map) mat.map.anisotropy = aniso;
        const role = roleOf(mat.name);
        let grade = null;
        if (role === 'glass') {
          const n = mat.name.toLowerCase();
          mat.color.lerp(new THREE.Color(n.includes('main') ? '#2c4a55' : n.includes('supporting') ? '#6f939e' : '#547785'), 0.55);
          mat.emissive.set('#0d1f27');
          mat.emissiveIntensity = 0.55;
          mat.envMapIntensity = 2.4;
          mat.roughness = n.includes('main') ? 0.055 : 0.09;
          mat.metalness = 0.1;
          mat.transparent = false;
          mat.opacity = 1;
        } else if (role === 'grass') {
          grade = [0.72, 0.74];
          mat.color.setRGB(0.63, 0.68, 0.52);
          mat.roughness = 0.72;
          mat.metalness = 0;
          mat.envMapIntensity = 0.5;
        } else if (role === 'road') {
          grade = [0.9, 0.9];
          mat.color.setRGB(0.63, 0.625, 0.6);
          mat.roughness = THREE.MathUtils.clamp(mat.roughness, 0.42, 0.6);
          mat.metalness = 0;
          mat.envMapIntensity = 1.15;
        } else if (role === 'wallWhite') {
          mat.color.setRGB(0.86, 0.86, 0.855);
          mat.envMapIntensity = 0.5;
        } else if (role === 'kerb') {
          grade = [0.55, 0.9];
          mat.color.setRGB(0.93, 0.92, 0.89);
          mat.envMapIntensity = 0.5;
          mat.roughness = 0.5;
        } else if (role === 'roofMetal') {
          mat.envMapIntensity = 1.6;
        } else {
          mat.envMapIntensity = role === 'prop' ? 0.55 : 0.65;
        }
        patchMaterial(mat, mat.map ? grade : null, !mat.userData.clipped);
        tuned.push({
          mat,
          role,
          base: mat.color.clone(),
          baseEmissive: mat.emissive.clone(),
          baseEmissiveIntensity: mat.emissiveIntensity,
          baseEnv: mat.envMapIntensity,
        });
        mat.needsUpdate = true;
      });
    });
  }

  // Đế sa bàn: thành bên theo bao lồi của mặt đất mô hình
  function buildPlinth(root, box, size) {
    const limit = box.min.y + size.y * 0.05;
    const pts = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.getAttribute('position');
      const step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y <= limit) pts.push(new THREE.Vector2(v.x, v.z));
      }
    });
    const outline = hull(pts);
    const top = box.min.y;
    const bottom = top - Math.max(size.x, size.z) * 0.035;
    const positions = [];
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      positions.push(a.x, top, a.y, b.x, top, b.y, b.x, bottom, b.y, a.x, top, a.y, b.x, bottom, b.y, a.x, bottom, a.y);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const sides = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#2f363d', roughness: 0.85, side: THREE.DoubleSide }));
    sides.receiveShadow = true;
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outline.map((p) => new THREE.Vector3(p.x, top + 0.002, p.y))),
      new THREE.LineBasicMaterial({ color: '#4f545a' })
    );
    scene.add(sides, edge);
    plinth.push(sides, edge);
  }

  function buildLights(box) {
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const cam = sun.shadow.camera;
    cam.left = -span * 0.75;
    cam.bottom = -span * 0.75;
    cam.right = span * 0.75;
    cam.top = span * 0.75;
    cam.near = 0.1;
    cam.far = radius * 8;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 1.4;
    [sun, rim, fill].forEach((light) => {
      light.target.position.copy(center);
      scene.add(light, light.target);
    });
    rim.position.copy(center).addScaledVector(dir(312, 22), radius * 2.6);
    fill.position.copy(center).addScaledVector(dir(150, 16), radius * 2.4);
    scene.add(ambient);
  }

  // Môi trường phản chiếu kiểu studio: vỏ chuyển màu + tấm sáng ấm (key) và lạnh (rim)
  function buildEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'varying vec3 vDir; void main(){ float h = vDir.y; vec3 hz = vec3(0.243,0.267,0.29), zn = vec3(0.055,0.067,0.078), fl = vec3(0.063,0.071,0.082);' +
          'gl_FragColor = vec4(h > 0.0 ? mix(hz, zn, h) : mix(hz, fl, -h * 4.0), 1.0); }',
      })
    ));
    const panel = (color, k, az, el, w, h) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })
      );
      m.position.copy(dir(az, el)).multiplyScalar(34);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel('#fff3e2', 3, 58, 27, 40, 26);
    panel('#b9d3ea', 1.4, 312, 36, 10, 44);
    panel('#dfe7ee', 1, 208, 74, 52, 52);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.02, 1, 200).texture;
    pmrem.dispose();
    env.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }

  // Lưới chung của nền khuôn viên (Campus_Base_*) có vài mảnh nằm trong tòa (vd. vòng bát giác giữa Tòa A).
  // Chúng không thuộc node Root_* nên không ẩn theo tòa ở LOD 3 và đâm xuyên mặt cắt tầng.
  // Tách tam giác cao hơn mặt đất có tâm nằm trong footprint, gắn vào node của tòa đó (chạy một lần).
  let straysAdopted = false;
  function adoptStrays() {
    if (straysAdopted || !modelRoot || !footprintRings.length) return;
    straysAdopted = true;
    const strays = [];
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.geometry.index) return; // shortcut: lưới Draco luôn có index
      if (isBuildingPart(o)) return;
      strays.push(o);
    });
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    strays.forEach((o) => {
      const pos = o.geometry.getAttribute('position');
      const idx = o.geometry.index.array;
      const keep = [];
      const moved = {};
      for (let t = 0; t < idx.length; t += 3) {
        a.fromBufferAttribute(pos, idx[t]).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, idx[t + 1]).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, idx[t + 2]).applyMatrix4(o.matrixWorld);
        const x = (a.x + b.x + c.x) / 3;
        const y = (a.y + b.y + c.y) / 3;
        const z = (a.z + b.z + c.z) / 3;
        const hit = y > 0.5 && footprintRings.find(({ code, ring, box }) => buildingRoots[code]
          && x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3] && pointInRing(x, z, ring));
        (hit ? (moved[hit.code] = moved[hit.code] || []) : keep).push(idx[t], idx[t + 1], idx[t + 2]);
      }
      Object.entries(moved).forEach(([code, tris]) => {
        const geo = o.geometry.clone();
        geo.setIndex(tris);
        // nếu nền đã đổi sang vật liệu không cắt thì phần thuộc tòa lấy lại vật liệu gốc (bị cắt)
        const part = new THREE.Mesh(geo, o.material.userData.clipped || o.material);
        part.castShadow = o.castShadow;
        part.receiveShadow = o.receiveShadow;
        part.customDepthMaterial = o.material.userData.clipped ? depthMatClipped : o.customDepthMaterial;
        o.add(part);
        buildingRoots[code].attach(part); // giữ nguyên vị trí thế giới
      });
      if (keep.length < idx.length) o.geometry.setIndex(keep);
    });
  }

  // Tách mái, cột của nhà xe (tâm tam giác trong PARKING_RINGS, cao hơn mặt đường) khỏi lưới nền
  // vào node Root_Nha_Xe: chế độ vệ tinh giữ mọi node Root_* nên nhà xe vẫn hiện. Chạy một lần khi nạp model.
  function splitParking(root) {
    parkingNode = new THREE.Group();
    parkingNode.name = 'Root_Nha_Xe';
    const meshes = [];
    root.traverse((o) => { if (o.isMesh && o.geometry.index && !isBuildingPart(o)) meshes.push(o); });
    root.add(parkingNode);
    const v = new THREE.Vector3();
    meshes.forEach((o) => {
      const pos = o.geometry.getAttribute('position');
      const idx = o.geometry.index.array;
      const keep = [];
      const moved = [];
      for (let t = 0; t < idx.length; t += 3) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let k = 0; k < 3; k += 1) {
          v.fromBufferAttribute(pos, idx[t + k]).applyMatrix4(o.matrixWorld);
          x += v.x / 3;
          y += v.y / 3;
          z += v.z / 3;
        }
        const hit = y > 0.3 && PARKING_RINGS.some((ring) => pointInRing(x, z, ring));
        (hit ? moved : keep).push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (!moved.length) return;
      const geo = o.geometry.clone();
      geo.setIndex(moved);
      const part = new THREE.Mesh(geo, o.material);
      o.add(part);
      parkingNode.attach(part); // giữ nguyên vị trí thế giới
      o.geometry.setIndex(keep);
    });
  }

  // Tâm và đỉnh mái thật của từng tòa trong mô hình: lấy các đỉnh lưới cao hơn mặt đất nằm trong footprint CSDL
  function computeAnchors() {
    if (!modelRoot || !footprintRings.length) return;
    const acc = {};
    const v = new THREE.Vector3();
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.getAttribute('position');
      const step = Math.max(1, Math.floor(pos.count / 20000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y < 1.0) continue;
        footprintRings.forEach(({ code, ring, box }) => {
          if (v.x < box[0] || v.x > box[2] || v.z < box[1] || v.z > box[3] || !pointInRing(v.x, v.z, ring)) return;
          const a = acc[code] || (acc[code] = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, top: 0 });
          a.minX = Math.min(a.minX, v.x);
          a.maxX = Math.max(a.maxX, v.x);
          a.minZ = Math.min(a.minZ, v.z);
          a.maxZ = Math.max(a.maxZ, v.z);
          a.top = Math.max(a.top, v.y);
        });
      }
    });
    Object.entries(acc).forEach(([code, a]) => {
      const x = (a.minX + a.maxX) / 2;
      const z = (a.minZ + a.maxZ) / 2;
      anchors[code] = { lngLat: modelToLngLat(x, z), topM: a.top, x, z };
    });
  }

  function restingExposure() {
    return tri(PALETTE.exposure, modeT, lerpN);
  }

  function applyMode(t) {
    modeT = t;
    const [az, el] = tri(PALETTE.keyAngle, t, (a, b, k) => [lerpN(a[0], b[0], k), lerpN(a[1], b[1], k)]);
    sun.position.copy(center).addScaledVector(dir(az, el), radius * 3);
    sun.color.copy(triColor(PALETTE.key, t));
    sun.intensity = tri(PALETTE.keyIntensity, t, lerpN);
    rim.intensity = tri(PALETTE.rim, t, lerpN);
    fill.intensity = tri(PALETTE.fill, t, lerpN);
    ambient.color.copy(triColor(PALETTE.ambSky, t));
    ambient.groundColor.copy(triColor(PALETTE.ambGround, t));
    ambient.intensity = tri(PALETTE.ambIntensity, t, lerpN);
    const envK = tri(PALETTE.env, t, lerpN);
    const night = smooth(t, 0.45, 0.95);
    tuned.forEach((tm) => {
      tm.mat.envMapIntensity = tm.baseEnv * envK;
      tm.mat.color.copy(tm.base);
      const albedo = NIGHT_ALBEDO[tm.role];
      if (albedo) tm.mat.color.lerp(new THREE.Color(albedo.color), albedo.mix * night);
      const glow = NIGHT_EMISSIVE[tm.mat.name];
      if (glow) {
        const k = smooth(t, glow.ramp[0], glow.ramp[1]);
        tm.mat.emissive.copy(tm.baseEmissive).lerp(new THREE.Color(glow.color), k);
        tm.mat.emissiveIntensity = lerpN(tm.baseEmissiveIntensity, glow.intensity, k);
      }
    });
    if (renderer) renderer.shadowMap.needsUpdate = true;
  }

  function loadModel() {
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    loader.load(
      MODEL_URL,
      (gltf) => {
        draco.dispose();
        const root = gltf.scene;
        modelRoot = root;
        scene.add(root);
        Object.entries(ROOT_NODES).forEach(([code, name]) => {
          const node = root.getObjectByName(name);
          if (!node) return;
          buildingRoots[code] = node;
          base[code] = { pos: node.position.clone(), quat: node.quaternion.clone() };
        });
        applyHidden();
        placeNodes(true);
        splitParking(root);
        adoptStrays();
        computeAnchors();
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        center = box.getCenter(new THREE.Vector3());
        radius = box.getBoundingSphere(new THREE.Sphere()).radius;
        tuneMaterials(root);
        buildPlinth(root, box, size);
        buildLights(box);
        applySatellite();
        applyMode(modeT);
        ready = true;
        map.triggerRepaint();
        if (onReady) onReady();
      },
      (e) => {
        if (onProgress && e.total) onProgress(e.loaded / e.total);
      },
      (err) => {
        draco.dispose();
        console.error(err);
        if (onError) onError(err);
      }
    );
  }

  function toScreen(v) {
    tmp4.set(v.x, v.y, v.z, 1).applyMatrix4(mvp);
    if (tmp4.w <= 0) return null;
    const canvas = map.getCanvas();
    return {
      x: (tmp4.x / tmp4.w * 0.5 + 0.5) * canvas.clientWidth,
      y: (-tmp4.y / tmp4.w * 0.5 + 0.5) * canvas.clientHeight,
    };
  }

  const layer = {
    id: 'campus-model',
    type: 'custom',
    renderingMode: '3d',
    onAdd(mapInstance, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: mapInstance.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = PALETTE.exposure[0];
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Cảnh tĩnh: chỉ vẽ lại bản đồ bóng khi mặt trời đổi hướng
      renderer.shadowMap.autoUpdate = false;
      loadModel();
    },
    onRemove() {
      ready = false;
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((mat) => {
          Object.values(mat).forEach((v) => { if (v && v.isTexture) v.dispose(); });
          mat.dispose();
        });
      });
      if (scene.environment) scene.environment.dispose();
      if (renderer) renderer.dispose();
    },
    render(gl, matrix) {
      if (!ready) return;
      const now = performance.now();
      let animating = false;
      if (modeStart >= 0) {
        const duration = Math.max(350, MODE_SECONDS * 1000 * Math.abs(modeTarget - modeFrom));
        const k = Math.min(1, (now - modeStart) / duration);
        applyMode(lerpN(modeFrom, modeTarget, smooth(k, 0, 1)));
        if (k >= 1) modeStart = -1;
        else animating = true;
      }
      let exposure = restingExposure();
      if (introStart >= 0) {
        const k = Math.min(1, (now - introStart) / introMs);
        exposure = lerpN(exposure * 0.42, exposure, smooth(k, 0, 0.62));
        if (k >= 1) introStart = -1;
        else animating = true;
      }
      renderer.toneMappingExposure = exposure;

      mvp.fromArray(matrix).multiply(modelMatrix);
      mvpInv.copy(mvp).invert();
      // Tâm chiếu của camera trong hệ mô hình: điểm có ảnh (0,0,1,0) qua ma trận chiếu
      tmp4.set(0, 0, 1, 0).applyMatrix4(mvpInv);
      camera.position.set(tmp4.x / tmp4.w, tmp4.y / tmp4.w, tmp4.z / tmp4.w);
      camera.quaternion.identity();
      camera.updateMatrixWorld(true);
      camera.projectionMatrix.copy(mvp).multiply(camera.matrixWorld);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      renderer.resetState();
      renderer.setViewport(0, 0, gl.drawingBufferWidth / renderer.getPixelRatio(), gl.drawingBufferHeight / renderer.getPixelRatio());
      if (!envDone) {
        buildEnvironment();
        envDone = true;
        renderer.shadowMap.needsUpdate = true;
        renderer.resetState();
      }
      renderer.render(scene, camera);
      if (onFrame) onFrame();
      if (animating) map.triggerRepaint();
    },
  };

  return {
    layer,
    lngLatToModel,
    modelToLngLat,
    modelBearing,
    get ready() {
      return ready;
    },
    get center() {
      return center;
    },
    setOnFrame(fn) {
      onFrame = fn;
    },
    setMode(mode) {
      const target = MODE_T[mode] ?? 0;
      if (!ready) {
        modeT = target;
        return;
      }
      modeFrom = modeT;
      modeTarget = target;
      modeStart = performance.now();
      map.triggerRepaint();
    },
    playIntro(ms) {
      introStart = performance.now();
      introMs = ms;
      map.triggerRepaint();
    },
    setSatellite(on) {
      satellite = on;
      applySatellite();
      if (renderer) renderer.shadowMap.needsUpdate = true;
      map.triggerRepaint();
    },
    // Ẩn vỏ một tòa (xem trong nhà); null = hiện tất cả
    setHidden(code) {
      hiddenCode = code;
      applyHidden();
      lowTris = null;
      if (renderer) renderer.shadowMap.needsUpdate = true;
      map.triggerRepaint();
    },
    // Mặt cắt ngang: bỏ phần mô hình cao hơn heightM mét (null = tắt)
    setClip(heightM) {
      clipUniform.value = heightM == null ? 1e6 : heightM;
      if (renderer) renderer.shadowMap.needsUpdate = true;
      map.triggerRepaint();
    },
    // Khối chọn (vô hình) dựng từ footprint tòa nhà trong CSDL
    setFootprints(buildingsFc) {
      pickMeshes.length = 0;
      footprintRings = [];
      const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      (buildingsFc.features || []).forEach((f) => {
        const g = f.geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        const h = Number(f.properties.height_m) || 10;
        polys.forEach((poly) => {
          const shape = new THREE.Shape(poly[0].map(([lng, lat]) => {
            const p = lngLatToModel(lng, lat);
            return new THREE.Vector2(p.x, p.z);
          }));
          const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
          geo.rotateX(Math.PI / 2);
          geo.translate(0, h, 0);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.userData.code = f.properties.building_code;
          mesh.updateMatrixWorld();
          pickMeshes.push(mesh);
          const ring = shape.getPoints().map((p) => [p.x, p.y]);
          const xs = ring.map((p) => p[0]);
          const zs = ring.map((p) => p[1]);
          footprintRings.push({
            code: f.properties.building_code,
            ring,
            box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
          });
        });
      });
      placeNodes(true);
      adoptStrays();
      computeAnchors();
      applySatellite();
    },
    // Tâm & độ cao mái (m) của tòa nhà theo vị trí đang hiển thị; null nếu chưa dò được
    anchor(code) {
      const a = anchors[code];
      return a ? { lngLat: modelToLngLat(...toShown(code, a.x, a.z)), topM: a.topM } : null;
    },
    // Trả về mã tòa nhà dưới điểm ảnh (px theo CSS) hoặc null
    pick(point) {
      if (!ready) return null;
      const canvas = map.getCanvas();
      const x = (point.x / canvas.clientWidth) * 2 - 1;
      const y = 1 - (point.y / canvas.clientHeight) * 2;
      const near = new THREE.Vector3(x, y, -1).applyMatrix4(mvpInv);
      const far = new THREE.Vector3(x, y, 1).applyMatrix4(mvpInv);
      raycaster.set(near, far.sub(near).normalize());
      const hit = raycaster.intersectObjects(pickMeshes, false)[0];
      return hit ? hit.object.userData.code : null;
    },
    // Độ cao (m) bề mặt mô hình tại (lng, lat theo hệ đang hiển thị): mặt cao nhất thấp hơn maxM (quảng trường,
    // bậc thềm, vỉa hè; bỏ mái nhà / tán cây / tầng trên). 0 nếu model chưa nạp. Dùng để tuyến không chìm dưới mặt sân.
    groundHeight(lngLat, maxM = 2) {
      if (!ready || !modelRoot) return 0;
      if (!lowTris) buildLowTris();
      const p = lngLatToModel(lngLat[0], lngLat[1]);
      let best = 0;
      (lowTris.get(cellKey(p.x, p.z)) || []).forEach((t) => {
        // tọa độ trọng tâm của (x, z) trong tam giác, nội suy độ cao
        const w1 = ((p.x - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (p.z - t[2])) / t[9];
        const w2 = ((t[3] - t[0]) * (p.z - t[2]) - (p.x - t[0]) * (t[5] - t[2])) / t[9];
        if (w1 < -1e-6 || w2 < -1e-6 || w1 + w2 > 1 + 1e-6) return;
        const y = t[1] + w1 * (t[4] - t[1]) + w2 * (t[7] - t[1]);
        if (y <= maxM && y > best) best = y;
      });
      return best;
    },
    // Vị trí màn hình của điểm (lng, lat) ở độ cao altM mét
    project(lngLat, altM = 0) {
      const p = lngLatToModel(lngLat[0], lngLat[1]);
      return toScreen(tmpV.set(p.x, altM, p.z));
    },
  };
}
