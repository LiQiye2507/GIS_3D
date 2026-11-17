/*
 * Lớp 3D toàn khuôn viên (MapLibre custom layer + Three.js).
 * Mô hình "University of Information Technology - UIT" của Heli Ton (CC BY 4.0).
 * Mô hình được nắn về WGS84 bằng phép biến đổi đồng dạng (7 điểm đối chiếu với ảnh vệ tinh Esri, ưu tiên Tòa A).
 */
(function () {
  const DEG = Math.PI / 180;
  const MODEL_URL = 'models/campus.glb';
  const DRACO_PATH = 'https://unpkg.com/three@0.165.0/examples/jsm/libs/draco/gltf/';

  // Gốc (0,0,0) của mô hình, tỉ lệ (mét / đơn vị mô hình) và góc xoay ngược chiều kim đồng hồ so với hướng Đông
  const GEO = { lng: 106.8037076, lat: 10.8704966, scale: 24.865, rotDeg: 4.535 };
  const M_PER_DEG_LAT = 110574;
  const M_PER_DEG_LNG = 111320 * Math.cos(GEO.lat * DEG);

  // Khối bao Tòa A trong hệ mô hình: ẩn đi ở LOD 3 để thấy phòng bên trong
  const HIDE_BOXES = {
    A: { center: [-3.1535, 0.268, -0.0206], size: [4.5, 0.47, 2.55], rotY: 1.36 },
  };

  const MODE_T = { day: 0, sunset: 0.5, night: 1 };
  const MODE_SECONDS = 2.8;

  // Bảng màu ánh sáng theo thứ tự [ngày, hoàng hôn, đêm]
  const PALETTE = {
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
  const NIGHT_EMISSIVE = {
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
  const NIGHT_ALBEDO = {
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

  const dir = (az, el) => {
    const a = az * DEG;
    const e = el * DEG;
    const c = Math.cos(e);
    return new THREE.Vector3(Math.sin(a) * c, Math.sin(e), Math.cos(a) * c).normalize();
  };
  const lerpN = (a, b, k) => a + (b - a) * k;
  const tri = (arr, t, mix) => (t <= 0.5 ? mix(arr[0], arr[1], t * 2) : mix(arr[1], arr[2], (t - 0.5) * 2));
  const triColor = (arr, t) => tri(arr, t, (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k));
  const smooth = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

  function roleOf(name) {
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

  // Bao lồi (monotone chain) của tập điểm XZ
  function hull(points) {
    const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    const upper = [];
    for (const q of p) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
      lower.push(q);
    }
    for (const q of [...p].reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // Kinh/vĩ độ <-> hệ mô hình (x, z); trục y là độ cao (đơn vị mô hình)
  const rot = GEO.rotDeg * DEG;
  function lngLatToModel(lng, lat) {
    const east = (lng - GEO.lng) * M_PER_DEG_LNG;
    const north = (lat - GEO.lat) * M_PER_DEG_LAT;
    return {
      x: (east * Math.cos(rot) + north * Math.sin(rot)) / GEO.scale,
      z: (east * Math.sin(rot) - north * Math.cos(rot)) / GEO.scale,
    };
  }
  function modelToLngLat(x, z) {
    const east = GEO.scale * (x * Math.cos(rot) + z * Math.sin(rot));
    const north = GEO.scale * (x * Math.sin(rot) - z * Math.cos(rot));
    return [GEO.lng + east / M_PER_DEG_LNG, GEO.lat + north / M_PER_DEG_LAT];
  }
  // La bàn (độ, theo chiều kim đồng hồ từ Bắc) của một hướng trong hệ mô hình
  const modelBearing = (dx, dz) => Math.atan2(dx, -dz) / DEG - GEO.rotDeg;

  function pointInRing(x, z, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i];
      const [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  function create(map, { onReady, onError, onProgress } = {}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const sun = new THREE.DirectionalLight('#ffefdc', 4.9);
    const rim = new THREE.DirectionalLight('#c9dcec', 0.35);
    const fill = new THREE.DirectionalLight('#8ea6be', 0.15);
    const ambient = new THREE.HemisphereLight('#c9dcec', '#2f363d', 0.08);
    const hideUniforms = { uHide: { value: 0 }, uHideInv: { value: new THREE.Matrix4() } };
    const tuned = [];
    const pickMeshes = [];
    const mvp = new THREE.Matrix4();
    const mvpInv = new THREE.Matrix4();
    const tmp4 = new THREE.Vector4();
    const tmpV = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();

    const origin = maplibregl.MercatorCoordinate.fromLngLat([GEO.lng, GEO.lat], 0);
    const ms = origin.meterInMercatorCoordinateUnits() * GEO.scale;
    const modelMatrix = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(ms, -ms, ms))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY(rot));

    let renderer = null;
    let modelRoot = null;
    let footprintRings = [];
    const anchors = {};
    let ready = false;
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

    function patchMaterial(mat, grade) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uHide = hideUniforms.uHide;
        shader.uniforms.uHideInv = hideUniforms.uHideInv;
        shader.vertexShader = 'varying vec3 vCampusPos;\n' + shader.vertexShader.replace(
          '#include <project_vertex>',
          '#include <project_vertex>\n vCampusPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
        let frag = 'uniform float uHide;\nuniform mat4 uHideInv;\nvarying vec3 vCampusPos;\n' + shader.fragmentShader.replace(
          'void main() {',
          `void main() {
            if (uHide > 0.5) {
              vec3 q = (uHideInv * vec4(vCampusPos, 1.0)).xyz;
              if (all(lessThan(abs(q), vec3(0.5)))) discard;
            }`
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
      mat.customProgramCacheKey = () => `campus-${mat.type}-${grade ? grade.join('-') : 'plain'}`;
    }

    function tuneMaterials(root) {
      const seen = new Set();
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      // Vật liệu bóng đổ cũng bỏ phần bị ẩn, để Tòa A ẩn ở LOD 3 không còn đổ bóng
      const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      patchMaterial(depthMat, null);
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        o.customDepthMaterial = depthMat;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((mat) => {
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
          patchMaterial(mat, mat.map ? grade : null);
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
          if (v.y < 0.08) continue;
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
        anchors[code] = { lngLat: modelToLngLat(x, z), topM: a.top * GEO.scale, x, z };
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
      const draco = new THREE.DRACOLoader().setDecoderPath(DRACO_PATH);
      const loader = new THREE.GLTFLoader().setDRACOLoader(draco);
      loader.load(
        MODEL_URL,
        (gltf) => {
          draco.dispose();
          const root = gltf.scene;
          modelRoot = root;
          scene.add(root);
          root.updateMatrixWorld(true);
          computeAnchors();
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          center = box.getCenter(new THREE.Vector3());
          radius = box.getBoundingSphere(new THREE.Sphere()).radius;
          tuneMaterials(root);
          buildPlinth(root, box, size);
          buildLights(box);
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
      setHidden(code) {
        const box = code && HIDE_BOXES[code];
        hideUniforms.uHide.value = box ? 1 : 0;
        if (box) {
          hideUniforms.uHideInv.value.compose(
            new THREE.Vector3(...box.center),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), box.rotY),
            new THREE.Vector3(...box.size)
          ).invert();
        }
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
          const h = (Number(f.properties.height_m) || 10) / GEO.scale;
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
        computeAnchors();
      },
      // Tâm & độ cao mái (m) của tòa nhà trong mô hình; null nếu chưa dò được
      anchor(code) {
        return anchors[code] || null;
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
      // Vị trí màn hình của điểm (lng, lat) ở độ cao altM mét
      project(lngLat, altM = 0) {
        const p = lngLatToModel(lngLat[0], lngLat[1]);
        return toScreen(tmpV.set(p.x, altM / GEO.scale, p.z));
      },
    };
  }

  window.CampusScene = { create, GEO };
})();
