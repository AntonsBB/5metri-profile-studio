import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = '5metri-profile-studio-v1';
const GRID_SIZE = 80;
const PROFILE_NAMES = {
  l: 'L profils',
  u: 'U profils',
  o: 'O profils',
  box: 'Kastes profils',
  custom: 'Custom profils'
};

const defaultState = {
  profile: 'l',
  width: 40,
  height: 40,
  thickness: 3,
  length: 2000,
  alloy: 'EN AW-6060 T66',
  finish: 'mill',
  holes: false,
  holeDiameter: 6.5,
  holeSpacing: 250,
  holeOffset: 50,
  holeFace: 'top',
  customPoints: [[10, 10], [50, 10], [50, 15], [15, 15], [15, 50], [10, 50]],
  contourClosed: true,
  projectId: createProjectId()
};

let state = loadInitialState();
let scene;
let camera;
let renderer;
let controls;
let profileAssembly;
let dieAssembly;
let floorGrid;
let extrusionAnimation = null;
let currentCamera = 'model';
let saveTimer;
let toastTimer;
let rebuildFrame;

const mount = $('#webglMount');
const sketchCanvas = $('#sketchCanvas');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

initScene();
bindInterface();
syncInterface();
renderSketch();
buildModel({ animate: true, refit: true });
animateScene();

function createProjectId() {
  const now = new Date();
  const date = [String(now.getFullYear()).slice(-2), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
  return `P-${date}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function loadInitialState() {
  const shared = readSharedState();
  if (shared) return normalizeState({ ...defaultState, ...shared, projectId: shared.projectId || createProjectId() });
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? normalizeState({ ...defaultState, ...saved }) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState(value) {
  const allowedProfiles = Object.keys(PROFILE_NAMES);
  const clean = { ...value };
  if (!allowedProfiles.includes(clean.profile)) clean.profile = 'l';
  clean.width = clamp(Number(clean.width) || 40, 10, 160);
  clean.height = clamp(Number(clean.height) || 40, 10, 160);
  clean.thickness = clamp(Number(clean.thickness) || 3, 1, 12);
  clean.length = clamp(Number(clean.length) || 2000, 100, 6000);
  clean.holeDiameter = clamp(Number(clean.holeDiameter) || 6.5, 2, 30);
  clean.holeSpacing = clamp(Number(clean.holeSpacing) || 250, 25, 2000);
  clean.holeOffset = clamp(Number(clean.holeOffset) || 50, 10, 500);
  clean.customPoints = Array.isArray(clean.customPoints)
    ? clean.customPoints.filter(point => Array.isArray(point) && point.length === 2).map(([x, y]) => [clamp(Math.round(x), 0, GRID_SIZE), clamp(Math.round(y), 0, GRID_SIZE)])
    : structuredClone(defaultState.customPoints);
  return clean;
}

function readSharedState() {
  if (!location.hash.startsWith('#design=')) return null;
  try {
    const encoded = location.hash.slice(8);
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x171b1f, 0.00036);

  camera = new THREE.PerspectiveCamera(33, 1, 0.1, 50000);
  camera.position.set(1250, 720, 1450);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), .04).texture;
  environmentGenerator.dispose();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.24;
  controls.target.set(0, 0, 0);
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  scene.add(new THREE.HemisphereLight(0xddeeff, 0x25282b, 1.75));
  const key = new THREE.DirectionalLight(0xffffff, 4.5);
  key.position.set(-450, 620, 350);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x9ec9ff, 3.2);
  rim.position.set(500, 160, -700);
  scene.add(rim);

  const warm = new THREE.PointLight(0xff6b55, 55, 1600, 2);
  warm.position.set(-300, 120, -500);
  scene.add(warm);

  const resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(mount);
  resizeRenderer();
}

function resizeRenderer() {
  const width = Math.max(1, mount.clientWidth);
  const height = Math.max(1, mount.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function bindInterface() {
  $$('#profileGrid [data-profile]').forEach(button => {
    button.addEventListener('click', () => {
      state.profile = button.dataset.profile;
      if (state.profile === 'o') state.height = state.width;
      syncInterface();
      buildModel({ animate: true, refit: true });
      saveState();
      if (state.profile === 'custom' && window.innerWidth <= 960) setMobilePanel('drawing');
    });
  });

  bindRange('#widthRange', value => {
    state.width = value;
    if (state.profile === 'o') state.height = value;
    clampThickness();
  });
  bindRange('#heightRange', value => { state.height = value; clampThickness(); });
  bindRange('#thicknessRange', value => { state.thickness = value; });
  bindRange('#lengthRange', value => { state.length = value; });

  $$('.length-presets button').forEach(button => {
    button.addEventListener('click', () => {
      state.length = Number(button.dataset.length);
      syncInterface();
      buildModel({ animate: true, refit: true });
      saveState();
    });
  });

  $('#alloySelect').addEventListener('change', event => { state.alloy = event.target.value; updateCopy(); saveState(); });
  $('#finishSelect').addEventListener('change', event => {
    state.finish = event.target.value;
    buildModel({ animate: false, refit: false });
    saveState();
  });

  $$('.view-switcher button').forEach(button => {
    button.addEventListener('click', () => {
      currentCamera = button.dataset.camera;
      $$('.view-switcher button').forEach(item => item.classList.toggle('active', item === button));
      fitCamera(currentCamera, true);
    });
  });

  $('#renderButton').addEventListener('click', () => buildModel({ animate: true, refit: true }));

  $$('.drawing-tabs button').forEach(button => {
    button.addEventListener('click', () => setDrawingTab(button.dataset.drawingTab));
  });

  sketchCanvas.addEventListener('pointerdown', addSketchPoint);
  $('#undoPointButton').addEventListener('click', () => {
    state.customPoints.pop();
    state.contourClosed = false;
    activateCustomDrawing();
  });
  $('#clearDrawingButton').addEventListener('click', () => {
    state.customPoints = [];
    state.contourClosed = false;
    activateCustomDrawing();
  });
  $('#closeContourButton').addEventListener('click', () => {
    if (state.customPoints.length < 3) return showToast('Kontūrai vajag vismaz 3 punktus.');
    if (polygonArea(state.customPoints) < 2) return showToast('Kontūras laukums ir pārāk mazs.');
    state.contourClosed = true;
    state.profile = 'custom';
    renderSketch();
    syncInterface();
    buildModel({ animate: true, refit: true });
    saveState();
    if (window.innerWidth <= 960) setMobilePanel('viewer');
  });

  $('#holesToggle').addEventListener('change', event => {
    state.holes = event.target.checked;
    syncMachining();
    buildModel({ animate: false, refit: false });
    saveState();
  });
  bindNumber('#holeDiameter', value => { state.holeDiameter = clamp(value, 2, 30); });
  bindNumber('#holeSpacing', value => { state.holeSpacing = clamp(value, 25, 2000); });
  bindNumber('#holeOffset', value => { state.holeOffset = clamp(value, 10, 500); });
  $('#holeFace').addEventListener('change', event => {
    state.holeFace = event.target.value;
    buildModel({ animate: false, refit: false });
    saveState();
  });

  $$('.mobile-tabs button').forEach(button => button.addEventListener('click', () => setMobilePanel(button.dataset.panel)));
  $('#openRfqButton').addEventListener('click', openRfq);
  $('#shareButton').addEventListener('click', shareDesign);
  $('#saveDraftButton').addEventListener('click', () => { saveState(true); showToast('Melnraksts saglabāts šajā ierīcē.'); });
  $('#helpButton').addEventListener('click', () => $('#helpDialog').showModal());
  $('#downloadSpecButton').addEventListener('click', downloadSpecification);
  $('#emailRfqButton').addEventListener('click', prepareEmail);
  $('#rfqForm').addEventListener('submit', event => event.preventDefault());

  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveState(true);
      showToast('Melnraksts saglabāts.');
    }
  });
}

function bindRange(selector, update) {
  const input = $(selector);
  input.addEventListener('input', () => {
    update(Number(input.value));
    syncInterface();
    scheduleModelRebuild();
    saveState();
  });
  input.addEventListener('change', () => buildModel({ animate: true, refit: true }));
}

function bindNumber(selector, update) {
  const input = $(selector);
  input.addEventListener('input', () => {
    update(Number(input.value));
    syncMachining();
    scheduleModelRebuild();
    saveState();
  });
}

function scheduleModelRebuild() {
  cancelAnimationFrame(rebuildFrame);
  rebuildFrame = requestAnimationFrame(() => buildModel({ animate: false, refit: false }));
}

function clampThickness() {
  const maximum = Math.max(1, Math.min(12, (Math.min(state.width, state.height) - 2) / 2));
  state.thickness = Math.min(state.thickness, maximum);
}

function syncInterface() {
  $$('#profileGrid [data-profile]').forEach(button => button.classList.toggle('active', button.dataset.profile === state.profile));
  const custom = state.profile === 'custom';
  const round = state.profile === 'o';

  $('#widthRange').value = state.width;
  $('#heightRange').value = state.height;
  $('#thicknessRange').value = state.thickness;
  $('#lengthRange').value = state.length;
  $('#alloySelect').value = state.alloy;
  $('#finishSelect').value = state.finish;

  $('#widthOutput').value = custom ? customBounds().width : round ? state.width : state.width;
  $('#heightOutput').value = custom ? customBounds().height : round ? state.width : state.height;
  $('#thicknessOutput').value = state.thickness.toFixed(1);
  $('#lengthOutput').value = state.length;

  $('#widthRange').disabled = custom;
  $('#heightRange').disabled = custom || round;
  $('#thicknessRange').disabled = custom;
  ['#widthControl', '#heightControl', '#thicknessControl'].forEach(selector => {
    const disabled = $(selector).querySelector('input').disabled;
    $(selector).style.opacity = disabled ? '.45' : '1';
  });

  $$('.length-presets button').forEach(button => button.classList.toggle('active', Number(button.dataset.length) === state.length));
  updateRangeProgress();
  syncMachining();
  updateCopy();
  renderSketch();
}

function updateRangeProgress() {
  $$('input[type="range"]').forEach(input => {
    const percent = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
    input.style.setProperty('--range-progress', `${percent}%`);
  });
}

function setMobilePanel(panel) {
  document.body.dataset.mobilePanel = panel;
  $$('.mobile-tabs button').forEach(button => button.classList.toggle('active', button.dataset.panel === panel));
  if (panel === 'viewer') requestAnimationFrame(() => { resizeRenderer(); fitCamera(currentCamera, false); });
}

function setDrawingTab(tab) {
  $$('.drawing-tabs button').forEach(button => {
    const active = button.dataset.drawingTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.drawing-view').forEach(view => view.classList.toggle('active', view.dataset.drawingView === tab));
}

function syncMachining() {
  $('#holesToggle').checked = state.holes;
  $('#machiningControls').classList.toggle('disabled', !state.holes);
  $('#holeDiameter').value = state.holeDiameter;
  $('#holeSpacing').value = state.holeSpacing;
  $('#holeOffset').value = state.holeOffset;
  $('#holeFace').value = state.holeFace;
  $('#zPreviewLength').textContent = `${formatNumber(state.length)} mm`;

  const count = holeCount();
  $('#holePreview').innerHTML = state.holes
    ? Array.from({ length: Math.min(count, 10) }, () => '<i></i>').join('')
    : '';
}

function addSketchPoint(event) {
  const rect = sketchCanvas.getBoundingClientRect();
  const x = clamp(Math.round(((event.clientX - rect.left) / rect.width) * GRID_SIZE), 0, GRID_SIZE);
  const y = clamp(Math.round((1 - (event.clientY - rect.top) / rect.height) * GRID_SIZE), 0, GRID_SIZE);

  if (state.contourClosed) {
    state.customPoints = [];
    state.contourClosed = false;
  }
  const last = state.customPoints.at(-1);
  if (last && last[0] === x && last[1] === y) return;
  state.customPoints.push([x, y]);
  state.profile = 'custom';
  activateCustomDrawing();
}

function activateCustomDrawing() {
  renderSketch();
  syncInterface();
  if (state.customPoints.length >= 3) buildModel({ animate: false, refit: false });
  saveState();
}

function renderSketch() {
  const points = state.customPoints || [];
  const svgPoints = points.map(([x, y]) => `${x},${GRID_SIZE - y}`).join(' ');
  const closed = state.contourClosed && points.length >= 3;

  sketchCanvas.innerHTML = `
    <defs>
      <pattern id="minorGrid" width="1" height="1" patternUnits="userSpaceOnUse">
        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dfe4e7" stroke-width="0.08"/>
      </pattern>
      <pattern id="majorGrid" width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill="url(#minorGrid)"/>
        <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#b7c0c6" stroke-width="0.18"/>
      </pattern>
      <linearGradient id="aluminiumFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7f9fa"/><stop offset=".36" stop-color="#aeb7bd"/><stop offset=".6" stop-color="#e8ecee"/><stop offset="1" stop-color="#929da4"/>
      </linearGradient>
    </defs>
    <rect width="80" height="80" fill="url(#majorGrid)"/>
    <line x1="0" y1="79.6" x2="80" y2="79.6" stroke="#d12630" stroke-width=".35"/>
    <line x1=".4" y1="0" x2=".4" y2="80" stroke="#d12630" stroke-width=".35"/>
    ${points.length ? `<polyline points="${svgPoints}${closed ? ` ${svgPoints.split(' ')[0]}` : ''}" fill="${closed ? 'url(#aluminiumFill)' : 'rgba(209,38,48,.07)'}" stroke="#d12630" stroke-width=".65" stroke-linejoin="round"/>` : ''}
    ${points.map(([x, y], index) => `<circle cx="${x}" cy="${GRID_SIZE - y}" r="${index === 0 ? 1.25 : 1}" fill="${index === 0 ? '#1e2328' : '#d12630'}" stroke="#fff" stroke-width=".45"/>`).join('')}
  `;

  $('#pointCount').textContent = `${points.length} ${points.length === 1 ? 'punkts' : 'punkti'}`;
  const bounds = customBounds();
  $('#customWidth').textContent = `${formatNumber(bounds.width)} mm`;
  $('#customHeight').textContent = `${formatNumber(bounds.height)} mm`;
  $('#customArea').textContent = `${formatNumber(polygonArea(points), 1)} mm²`;
  $('#closeContourButton').textContent = closed ? 'Kontūra slēgta ✓' : 'Slēgt kontūru';
}

function customBounds() {
  const points = state.customPoints;
  if (!points.length) return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { width: maxX - minX, height: maxY - minY, minX, minY, maxX, maxY };
}

function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function buildModel({ animate = false, refit = false } = {}) {
  if (profileAssembly) disposeObject(profileAssembly);
  if (dieAssembly) disposeObject(dieAssembly);
  if (floorGrid) disposeObject(floorGrid);

  const dimensions = activeDimensions();
  const shape = makeProfileShape();
  if (!shape) return;

  const bevel = Math.min(0.45, Math.max(0.12, Math.min(dimensions.width || 10, dimensions.height || 10) * 0.006));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: state.length,
    steps: 1,
    curveSegments: 48,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerY = (box.min.y + box.max.y) / 2;
  geometry.translate(-centerX, -centerY, 0);
  geometry.computeVertexNormals();

  profileAssembly = new THREE.Group();
  profileAssembly.position.z = -state.length / 2;
  scene.add(profileAssembly);

  const material = profileMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  profileAssembly.add(mesh);

  const edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: state.finish === 'black' ? 0x68727a : 0x6f787e, transparent: true, opacity: 0.62 });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  profileAssembly.add(edges);

  addMachiningMarkers(profileAssembly, dimensions);
  dieAssembly = createDie(dimensions);
  scene.add(dieAssembly);
  floorGrid = createFloor(dimensions);
  scene.add(floorGrid);

  if (animate && !reduceMotion) {
    profileAssembly.scale.z = 0.004;
    extrusionAnimation = { start: performance.now(), duration: Math.min(1450, 720 + state.length * .12), group: profileAssembly };
    setRenderStatus(true);
  } else {
    profileAssembly.scale.z = 1;
    extrusionAnimation = null;
    setRenderStatus(false);
  }

  updateMetrics();
  updateCopy();
  if (refit) fitCamera(currentCamera, true);
}

function makeProfileShape() {
  const w = state.width;
  const h = state.profile === 'o' ? state.width : state.height;
  const t = Math.min(state.thickness, Math.min(w, h) / 2 - .2);

  if (state.profile === 'l') return shapeFromPoints([[0, 0], [w, 0], [w, t], [t, t], [t, h], [0, h]]);
  if (state.profile === 'u') return shapeFromPoints([[0, 0], [w, 0], [w, h], [w - t, h], [w - t, t], [t, t], [t, h], [0, h]]);
  if (state.profile === 'o') {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, Math.max(.3, w / 2 - t), 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return shape;
  }
  if (state.profile === 'box') {
    const shape = shapeFromPoints([[0, 0], [w, 0], [w, h], [0, h]]);
    const hole = new THREE.Path();
    hole.moveTo(t, t);
    hole.lineTo(t, h - t);
    hole.lineTo(w - t, h - t);
    hole.lineTo(w - t, t);
    hole.lineTo(t, t);
    shape.holes.push(hole);
    return shape;
  }
  if (state.profile === 'custom') {
    if (state.customPoints.length < 3) return shapeFromPoints([[0, 0], [1, 0], [1, 1], [0, 1]]);
    return shapeFromPoints(state.customPoints);
  }
  return null;
}

function shapeFromPoints(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

function activeDimensions() {
  if (state.profile === 'custom') {
    const bounds = customBounds();
    return { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
  }
  if (state.profile === 'o') return { width: state.width, height: state.width };
  return { width: state.width, height: state.height };
}

function profileMaterial() {
  const finishes = {
    mill: { color: 0xdde2e5, metalness: .58, roughness: .19, emissive: 0x111416, emissiveIntensity: .12 },
    anodized: { color: 0xe4e7e9, metalness: .66, roughness: .27, emissive: 0x121416, emissiveIntensity: .1 },
    black: { color: 0x252a2e, metalness: .6, roughness: .34 },
    white: { color: 0xe9e9e6, metalness: .2, roughness: .36 }
  };
  return new THREE.MeshPhysicalMaterial({
    ...finishes[state.finish],
    clearcoat: .28,
    clearcoatRoughness: .2,
    side: THREE.DoubleSide,
    envMapIntensity: 1.4
  });
}

function createDie(dimensions) {
  const group = new THREE.Group();
  const dieWidth = Math.max(155, dimensions.width * 2.2);
  const dieHeight = Math.max(145, dimensions.height * 2.2);
  const geometry = new THREE.BoxGeometry(dieWidth, dieHeight, 28);
  const material = new THREE.MeshStandardMaterial({ color: 0x343a3e, metalness: .86, roughness: .4 });
  const die = new THREE.Mesh(geometry, material);
  die.position.z = -state.length / 2 - 20;
  die.castShadow = true;
  die.receiveShadow = true;
  group.add(die);

  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x687177, transparent: true, opacity: .6 }));
  rim.position.copy(die.position);
  group.add(rim);

  const badge = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 2), new THREE.MeshStandardMaterial({ color: 0xb51f28, metalness: .3, roughness: .55 }));
  badge.position.set(-dieWidth * .28, dieHeight * .35, -state.length / 2 - 35);
  group.add(badge);
  return group;
}

function createFloor(dimensions) {
  const group = new THREE.Group();
  const floorY = -Math.max(58, dimensions.height / 2 + 38);
  const gridSize = Math.max(1600, state.length * 1.55);
  const grid = new THREE.GridHelper(gridSize, 44, 0x596168, 0x30363a);
  grid.position.set(0, floorY, 0);
  grid.material.transparent = true;
  grid.material.opacity = .42;
  group.add(grid);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize, gridSize),
    new THREE.MeshStandardMaterial({ color: 0x171b1e, metalness: .25, roughness: .78, transparent: true, opacity: .72 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY - .8;
  floor.receiveShadow = true;
  group.add(floor);
  return group;
}

function addMachiningMarkers(group, dimensions) {
  if (!state.holes) return;
  const positions = holePositions();
  const radius = Math.min(state.holeDiameter / 2, Math.max(1, Math.min(dimensions.width, dimensions.height) * .22));
  const markerMaterial = new THREE.MeshStandardMaterial({ color: 0x15191c, metalness: .42, roughness: .38 });
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xe05259 });

  positions.slice(0, 48).forEach(z => {
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1.5, 20), markerMaterial);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.2, Math.max(.45, radius * .1), 8, 20), ringMaterial);
    if (state.holeFace === 'side') {
      marker.rotation.z = Math.PI / 2;
      marker.position.set(dimensions.width / 2 + .4, 0, z);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(dimensions.width / 2 + 1.2, 0, z);
    } else {
      marker.position.set(0, dimensions.height / 2 + .4, z);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, dimensions.height / 2 + 1.2, z);
    }
    marker.castShadow = true;
    group.add(marker, ring);
  });
}

function holePositions() {
  if (!state.holes || state.holeOffset * 2 > state.length) return [];
  const positions = [];
  for (let z = state.holeOffset; z <= state.length - state.holeOffset + .001; z += state.holeSpacing) positions.push(z);
  return positions;
}

function holeCount() { return holePositions().length; }

function fitCamera(mode = 'model', smooth = false) {
  if (!camera || !controls) return;
  const dimensions = activeDimensions();
  const cross = Math.max(24, dimensions.width, dimensions.height);
  let position;
  let target;

  if (mode === 'front') {
    target = new THREE.Vector3(0, 0, state.length / 2);
    position = new THREE.Vector3(0, 0, state.length / 2 + cross * 3.15);
    controls.autoRotate = false;
  } else {
    const span = Math.max(state.length, cross * 8);
    // Look mostly down the extrusion axis: the geometry remains true-scale,
    // while the front face stays legible even on long 6 m profiles.
    target = new THREE.Vector3(0, 0, -span * .1);
    position = new THREE.Vector3(span * .14, span * .18, span * .92);
  }

  camera.near = Math.max(.1, cross / 200);
  camera.far = Math.max(5000, state.length * 16);
  camera.updateProjectionMatrix();
  controls.minDistance = cross * .7;
  controls.maxDistance = Math.max(state.length * 4, cross * 18);

  if (smooth && !reduceMotion) tweenCamera(position, target);
  else {
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  }
}

function tweenCamera(destination, target) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const start = performance.now();
  const duration = 520;
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(startPosition, destination, eased);
    controls.target.lerpVectors(startTarget, target, eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function animateScene(now = performance.now()) {
  requestAnimationFrame(animateScene);
  if (extrusionAnimation && extrusionAnimation.group === profileAssembly) {
    const progress = Math.min(1, (now - extrusionAnimation.start) / extrusionAnimation.duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    extrusionAnimation.group.scale.z = Math.max(.004, eased);
    if (progress >= 1) {
      extrusionAnimation.group.scale.z = 1;
      extrusionAnimation = null;
      setRenderStatus(false);
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

function setRenderStatus(rendering) {
  const status = $('#renderState');
  status.classList.toggle('rendering', rendering);
  status.querySelector('b').textContent = rendering ? 'Profils tiek ekstrudēts…' : 'Modelis gatavs';
  status.querySelector('small').textContent = rendering ? `Virtuālais garums ${formatNumber(state.length)} mm` : 'Velc, lai pagrieztu · ritini, lai pietuvinātu';
}

function updateCopy() {
  const title = profileDescription();
  $('#headerProfileName').textContent = PROFILE_NAMES[state.profile];
  $('#viewerTitle').textContent = title;
  $('#projectId').textContent = state.projectId;
}

function profileDescription() {
  if (state.profile === 'custom') {
    const bounds = customBounds();
    return `Custom profils · ${formatNumber(bounds.width)} × ${formatNumber(bounds.height)} mm`;
  }
  if (state.profile === 'o') return `O profils · Ø${formatNumber(state.width)} × ${formatNumber(state.thickness, 1)} mm`;
  return `${PROFILE_NAMES[state.profile]} · ${formatNumber(state.width)} × ${formatNumber(state.height)} × ${formatNumber(state.thickness, 1)} mm`;
}

function crossSectionArea() {
  const w = state.width;
  const h = state.profile === 'o' ? state.width : state.height;
  const t = Math.min(state.thickness, Math.min(w, h) / 2);
  if (state.profile === 'l') return w * t + (h - t) * t;
  if (state.profile === 'u') return w * t + 2 * (h - t) * t;
  if (state.profile === 'o') return Math.PI * (Math.pow(w / 2, 2) - Math.pow(Math.max(0, w / 2 - t), 2));
  if (state.profile === 'box') return w * h - Math.max(0, w - 2 * t) * Math.max(0, h - 2 * t);
  return polygonArea(state.customPoints);
}

function updateMetrics() {
  const area = crossSectionArea();
  const weight = area * .0027;
  $('#metricLength').textContent = `${formatNumber(state.length)} mm`;
  $('#metricArea').textContent = `${formatNumber(area, 1)} mm²`;
  $('#metricWeight').textContent = `${formatNumber(weight, 2)} kg/m`;
  $('#metricMachining').textContent = state.holes ? `${holeCount()} × Ø${formatNumber(state.holeDiameter, 1)}` : 'Nav';
}

function disposeObject(object) {
  scene.remove(object);
  object.traverse(child => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
    else child.material?.dispose();
  });
}

function saveState(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    $('#headerSaveState').textContent = `Saglabāts ${new Date().toLocaleTimeString('lv-LV', { hour: '2-digit', minute: '2-digit' })}`;
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 450);
}

function specification() {
  const dimensions = activeDimensions();
  return {
    schema: '5metri-profile-studio/v1',
    projectId: state.projectId,
    profileType: state.profile,
    profileName: PROFILE_NAMES[state.profile],
    dimensionsMm: {
      width: dimensions.width,
      height: dimensions.height,
      wallThickness: state.profile === 'custom' ? null : state.thickness,
      length: state.length
    },
    customContourMm: state.profile === 'custom' ? state.customPoints : null,
    crossSectionAreaMm2: Number(crossSectionArea().toFixed(2)),
    theoreticalWeightKgM: Number((crossSectionArea() * .0027).toFixed(3)),
    alloy: state.alloy,
    finish: state.finish,
    machining: state.holes ? {
      operation: 'periodic-holes',
      diameterMm: state.holeDiameter,
      spacingMm: state.holeSpacing,
      endOffsetMm: state.holeOffset,
      face: state.holeFace,
      count: holeCount()
    } : null,
    note: 'Concept specification. Final manufacturability and tolerances must be approved by a technologist.',
    generatedAt: new Date().toISOString()
  };
}

function encodeSharedState() {
  const shareState = {
    profile: state.profile,
    width: state.width,
    height: state.height,
    thickness: state.thickness,
    length: state.length,
    alloy: state.alloy,
    finish: state.finish,
    holes: state.holes,
    holeDiameter: state.holeDiameter,
    holeSpacing: state.holeSpacing,
    holeOffset: state.holeOffset,
    holeFace: state.holeFace,
    customPoints: state.customPoints,
    contourClosed: state.contourClosed,
    projectId: state.projectId
  };
  const bytes = new TextEncoder().encode(JSON.stringify(shareState));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function shareDesign() {
  const url = `${location.origin}${location.pathname}#design=${encodeSharedState()}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `5 METRI profils ${state.projectId}`, text: profileDescription(), url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  await copyText(url);
  showToast('Dizaina saite nokopēta.');
}

function openRfq() {
  const summary = $('#rfqSummary');
  summary.innerHTML = `
    <span><small>Profils</small><b>${profileDescription()}</b></span>
    <span><small>Garums</small><b>${formatNumber(state.length)} mm</b></span>
    <span><small>Materiāls</small><b>${state.alloy}</b></span>
    <span><small>Masa</small><b>${formatNumber(crossSectionArea() * .0027, 2)} kg/m</b></span>
    <span><small>Apstrāde</small><b>${state.holes ? `${holeCount()} urbumi` : 'Bez urbumiem'}</b></span>
    <span><small>Projekts</small><b>${state.projectId}</b></span>
  `;
  $('#rfqDialog').showModal();
}

function downloadSpecification() {
  const payload = {
    ...specification(),
    customer: {
      company: $('#companyInput').value.trim(),
      email: $('#emailInput').value.trim(),
      phone: $('#phoneInput').value.trim(),
      quantity: Number($('#quantityInput').value) || null,
      note: $('#noteInput').value.trim()
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `5METRI_${state.projectId}_specifikacija.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Specifikācija lejupielādēta.');
}

function prepareEmail() {
  const company = $('#companyInput').value.trim();
  const email = $('#emailInput').value.trim();
  const phone = $('#phoneInput').value.trim();
  const quantity = $('#quantityInput').value.trim();
  const note = $('#noteInput').value.trim();
  const machining = state.holes ? `${holeCount()} × Ø${formatNumber(state.holeDiameter, 1)} mm; solis ${formatNumber(state.holeSpacing)} mm; atkāpe ${formatNumber(state.holeOffset)} mm` : 'nav norādīta';
  const shareUrl = `${location.origin}${location.pathname}#design=${encodeSharedState()}`;
  const body = [
    'Labdien!',
    '',
    `Lūdzu pārbaudīt alumīnija profila ${state.projectId} ražošanas iespējas un sagatavot nākamo soli.`,
    '',
    `Profils: ${profileDescription()}`,
    `Garums: ${formatNumber(state.length)} mm`,
    `Materiāls: ${state.alloy}`,
    `Apdare: ${finishName()}`,
    `Daudzums: ${quantity || 'nav norādīts'} gab.`,
    `Apstrāde: ${machining}`,
    `Teorētiskā masa: ${formatNumber(crossSectionArea() * .0027, 2)} kg/m`,
    '',
    `Uzņēmums: ${company || 'nav norādīts'}`,
    `Kontakts: ${email || '—'} ${phone || ''}`.trim(),
    `Piezīme: ${note || '—'}`,
    '',
    `Interaktīvais dizains: ${shareUrl}`,
    '',
    'Pielikumā pievienošu no Profilu studijas lejupielādēto specifikācijas failu.'
  ].join('\n');
  location.href = `mailto:abb@5metri.lv?subject=${encodeURIComponent(`Profila pieprasījums ${state.projectId}`)}&body=${encodeURIComponent(body)}`;
}

function finishName() {
  return ({ mill: 'Neapstrādāts alumīnijs', anodized: 'Anodēts, naturāls', black: 'Pulverkrāsa, melna', white: 'Pulverkrāsa, balta' })[state.finish];
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('lv-LV', { maximumFractionDigits, minimumFractionDigits: maximumFractionDigits }).format(Number(value) || 0);
}

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
