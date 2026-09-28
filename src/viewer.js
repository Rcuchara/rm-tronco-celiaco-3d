import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createViewerTools, installViewerTools } from './webmcp.js';

const study = JSON.parse(document.getElementById('study-data').textContent);
const stage = document.getElementById('stage');
const layer = document.getElementById('label-layer');
const sliceRange = document.getElementById('slice-range');
const radiusRange = document.getElementById('radius-range');
const opacityRange = document.getElementById('opacity-range');
const zRange = document.getElementById('z-range');
const selectedImage = document.getElementById('selected-image');
const selectedTitle = document.getElementById('selected-title');
const sliceValue = document.getElementById('slice-value');
const radiusValue = document.getElementById('radius-value');
const opacityValue = document.getElementById('opacity-value');
const zValue = document.getElementById('z-value');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const viewButtons = [...document.querySelectorAll('[data-view]')];
const referenceToggle = document.getElementById('reference-toggle');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07131d');
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
camera.up.set(0, 0, 1);
camera.position.set(145, -205, 150);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 80;
controls.maxDistance = 650;
controls.target.set(0, 0, 0);

const crop = study.crop;
const rowSpacing = study.pixel_spacing_mm[0];
const colSpacing = study.pixel_spacing_mm[1];
const width = (crop.x2 - crop.x1) * colSpacing;
const height = (crop.y2 - crop.y1) * rowSpacing;
const midCol = (crop.x1 + crop.x2) / 2;
const midRow = (crop.y1 + crop.y2) / 2;
const minZ = study.planes[study.planes.length - 1].z_mm;
const maxZ = study.planes[0].z_mm;
const midZ = (minZ + maxZ) / 2;
const geometry = new THREE.PlaneGeometry(width, height);
const textureLoader = new THREE.TextureLoader();
let selected = study.planes.findIndex(p => p.index === 54);
if (selected < 0) selected = Math.floor(study.planes.length / 2);
sliceRange.min = 0;
sliceRange.max = study.planes.length - 1;
sliceRange.value = selected;
radiusRange.max = study.planes.length - 1;
radiusRange.value = study.planes.length - 1;
let mode = 'vessels';
const initialSlice = study.planes[selected].index;
let currentView = 'oblique';
let focusedReference = null;

const planes = study.planes.map((p, i) => {
  const opaque = textureLoader.load(p.opaque);
  const highlight = textureLoader.load(p.highlight);
  opaque.colorSpace = THREE.SRGBColorSpace;
  highlight.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: highlight, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = p.z_mm - midZ;
  scene.add(mesh);

  const framePoints = [
    [-width / 2, -height / 2, 0], [width / 2, -height / 2, 0],
    [width / 2, -height / 2, 0], [width / 2, height / 2, 0],
    [width / 2, height / 2, 0], [-width / 2, height / 2, 0],
    [-width / 2, height / 2, 0], [-width / 2, -height / 2, 0],
  ];
  const frameGeom = new THREE.BufferGeometry();
  frameGeom.setAttribute('position', new THREE.Float32BufferAttribute(framePoints.flat(), 3));
  const frame = new THREE.LineSegments(frameGeom, new THREE.LineBasicMaterial({ color: 0x66d7cf, transparent: true, opacity: 0.85, depthTest: false }));
  frame.position.z = mesh.position.z;
  scene.add(frame);
  return { mesh, frame, opaque, highlight };
});

const refObjects = study.references.map(ref => {
  const color = new THREE.Color(ref.color);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(3.3, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  sphere.renderOrder = 1000;
  sphere.position.set((ref.column - midCol) * colSpacing, (midRow - ref.row) * rowSpacing, 0);
  scene.add(sphere);
  const label = document.createElement('div');
  label.className = 'world-label';
  label.style.setProperty('--marker', ref.color);
  label.textContent = ref.short;
  layer.appendChild(label);
  return { ref, sphere, label };
});

// Short, manually placed pointer along the proximal splenic artery seen in
// slice 54. Keep it visible through the translucent planes for orientation.
const splenicGuide = new THREE.Group();
const guidePoints = study.splenic_guide.map(point => {
  const plane = study.planes.find(p => p.index === point.slice_index);
  return new THREE.Vector3(
    (point.column - midCol) * colSpacing,
    (midRow - point.row) * rowSpacing,
    plane.z_mm - midZ
  );
});
const guideCurve = new THREE.CatmullRomCurve3(guidePoints);
const guideMaterial = new THREE.MeshBasicMaterial({ color: 0xf7c568, depthTest: false, depthWrite: false });
const guideTube = new THREE.Mesh(new THREE.TubeGeometry(guideCurve, 48, 1.1, 8, false), guideMaterial);
guideTube.renderOrder = 1001;
splenicGuide.add(guideTube);
const guideTip = guideCurve.getPoint(1);
const guideDirection = guideCurve.getTangent(1).normalize();
const arrow = new THREE.Mesh(new THREE.ConeGeometry(2.8, 7, 12), guideMaterial);
arrow.position.copy(guideTip).addScaledVector(guideDirection, -3.5);
arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), guideDirection);
arrow.renderOrder = 1001;
splenicGuide.add(arrow);
scene.add(splenicGuide);

const axisGeometry = new THREE.BufferGeometry();
axisGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -width / 2, -height / 2, minZ - midZ - 7,
  width / 2, -height / 2, minZ - midZ - 7,
  width / 2, -height / 2, minZ - midZ - 7,
  width / 2, height / 2, minZ - midZ - 7,
  -width / 2, -height / 2, minZ - midZ - 7,
  -width / 2, -height / 2, maxZ - midZ + 7,
], 3));
const axes = new THREE.LineSegments(axisGeometry, new THREE.LineBasicMaterial({ color: 0x547081, transparent: true, opacity: 0.55 }));
scene.add(axes);

function currentScale() { return Number(zRange.value); }

function updateScene() {
  selected = Number(sliceRange.value);
  const radius = Number(radiusRange.value);
  const opacity = Number(opacityRange.value) / 100;
  const zScale = currentScale();
  planes.forEach((p, i) => {
    const visible = Math.abs(i - selected) <= radius;
    p.mesh.visible = visible;
    p.frame.visible = visible && i === selected;
    p.mesh.position.z = (study.planes[i].z_mm - midZ) * zScale;
    p.frame.position.z = p.mesh.position.z;
    p.mesh.material.map = mode === 'vessels' ? p.highlight : p.opaque;
    p.mesh.material.opacity = mode === 'vessels' ? opacity * (i === selected ? 1 : 0.65) : (i === selected ? Math.max(opacity, 0.7) : opacity * 0.12);
    p.mesh.material.needsUpdate = true;
  });
  refObjects.forEach(o => {
    const plane = study.planes.find(p => p.index === o.ref.slice_index);
    o.sphere.position.z = (plane.z_mm - midZ) * zScale;
    o.sphere.visible = referenceToggle.checked;
    o.label.style.display = referenceToggle.checked ? 'block' : 'none';
  });
  splenicGuide.visible = referenceToggle.checked;
  splenicGuide.scale.z = zScale;
  const selectedPlane = study.planes[selected];
  selectedImage.src = selectedPlane.opaque;
  selectedTitle.textContent = `Corte ${selectedPlane.index} · z = ${selectedPlane.z_mm.toFixed(1)} mm`;
  sliceValue.textContent = `${selectedPlane.index} / ${study.planes[study.planes.length - 1].index}`;
  radiusValue.textContent = radius === study.planes.length - 1 ? 'Todos' : `±${radius}`;
  opacityValue.textContent = `${Math.round(opacity * 100)} %`;
  zValue.textContent = `${zScale.toFixed(1)}×`;
}

function setView(view) {
  currentView = view;
  focusedReference = null;
  // Finish any pending orbit damping before applying an exact preset.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  if (view === 'oblique') {
    camera.up.set(0, 0, 1);
    camera.position.set(145, -205, 150);
  } else if (view === 'axial') {
    camera.up.set(0, 1, 0);
    camera.position.set(0, 0, 270);
  } else {
    camera.up.set(0, 0, 1);
    camera.position.set(0, -280, 35);
  }
  controls.target.set(0, 0, 0);
  camera.lookAt(controls.target);
  controls.update();
  controls.enableDamping = damping;
  viewButtons.forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

function getViewerState() {
  const plane = study.planes[selected];
  return {
    slice: plane.index, z_mm: plane.z_mm, mode, view: currentView,
    radius: Number(radiusRange.value), opacity: Number(opacityRange.value),
    spacing: currentScale(), references: referenceToggle.checked,
    visible_slices: study.planes.filter((_, i) => Math.abs(i - selected) <= Number(radiusRange.value)).map(p => p.index),
    focused_reference: focusedReference,
    camera: { position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray() },
  };
}

function applySettings(settings) {
  focusedReference = null;
  if (settings.slice !== undefined) sliceRange.value = study.planes.findIndex(p => p.index === settings.slice);
  if (settings.radius !== undefined) radiusRange.value = settings.radius;
  if (settings.opacity !== undefined) opacityRange.value = settings.opacity;
  if (settings.spacing !== undefined) zRange.value = settings.spacing;
  if (settings.references !== undefined) referenceToggle.checked = settings.references;
  if (settings.mode !== undefined) {
    mode = settings.mode;
    modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }
  if (settings.view !== undefined) setView(settings.view);
  updateScene();
}

function focusReference(name) {
  const object = refObjects.find(o => o.ref.name === name);
  applySettings({ slice: object.ref.slice_index, radius: 0, mode: 'anatomy', view: 'axial', references: true });
  const offset = camera.position.clone().sub(controls.target);
  controls.target.copy(object.sphere.position);
  camera.position.copy(controls.target).add(offset);
  controls.update();
  focusedReference = name;
}

function resetViewer() {
  applySettings({ slice: initialSlice, radius: study.planes.length - 1, mode: 'vessels', view: 'oblique', opacity: 72, spacing: 1, references: true });
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

for (const slider of [sliceRange, radiusRange, opacityRange, zRange]) slider.addEventListener('input', () => {
  focusedReference = null;
  updateScene();
});
referenceToggle.addEventListener('change', () => { focusedReference = null; updateScene(); });
modeButtons.forEach(button => button.addEventListener('click', () => {
  applySettings({ mode: button.dataset.mode });
}));
viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
controls.addEventListener('start', () => {
  currentView = 'custom';
  focusedReference = null;
  viewButtons.forEach(b => b.classList.remove('active'));
});
document.getElementById('reset-view').addEventListener('click', resetViewer);
document.getElementById('save-image').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `RM_celiaco_3D_corte_${study.planes[selected].index}.png`;
  a.click();
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  refObjects.forEach(o => {
    if (!referenceToggle.checked) return;
    const projected = o.sphere.position.clone().project(camera);
    const onScreen = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15;
    o.label.style.visibility = onScreen ? 'visible' : 'hidden';
    o.label.style.left = `${(projected.x + 1) * w / 2 + 11}px`;
    o.label.style.top = `${(-projected.y + 1) * h / 2 - 15}px`;
  });
}
setView('oblique');
updateScene();
animate();
window.viewerReady = true;

const assistantStatus = document.getElementById('assistant-status');
const assistantAction = document.getElementById('assistant-action');
const webmcp = installViewerTools({
  tools: createViewerTools({
    study, getState: getViewerState, applySettings, focusReference, reset: resetViewer,
    reportAction: (title, state) => {
      assistantAction.textContent = `Última acción: ${title}. Corte ${state.slice}, opacidad ${state.opacity} %${state.focused_reference ? `, ${state.focused_reference}` : ''}.`;
    },
  }),
  onStatus: status => {
    assistantStatus.dataset.status = status;
    assistantStatus.textContent = {
      connecting: 'Conectando con el asistente…',
      ready: 'Disponible para un asistente compatible · 4 herramientas',
      unavailable: 'Este navegador no ofrece la conexión con asistentes. Puedes usar todos los controles manuales.',
      error: 'No se pudo activar la conexión. Puedes reintentar y seguir usando los controles manuales.',
    }[status];
  },
});
document.getElementById('assistant-retry').addEventListener('click', () => { void webmcp.refresh(); });
