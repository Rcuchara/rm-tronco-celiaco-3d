import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { axisName, directionVectors, fitBoxDistance, flipSliceRows, slicePixels, voxelToWorld, worldToVoxel } from './ear-math.js';
import { installViewerTools } from './webmcp.js';

const $ = id => document.getElementById(id);
const config = JSON.parse($('viewer-config').textContent);
let technique = config.datasets.find(item => item.id === new URL(location.href).searchParams.get('tecnica') && item.manifest) || config.datasets.find(item => item.id === config.defaultDataset);
for (const item of config.datasets) {
  const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; $('dataset-select').append(option);
}
$('dataset-select').value = technique.id;
$(config.anatomy === 'ear' ? 'nav-ear' : 'nav-celiac').setAttribute('aria-current', 'page');
const modalityLabel = () => manifest?.modality === 'MR' ? 'RM' : technique.modalityLabel || 'TC';
const specimenCoordinates = () => volume?.coordinateSystem === 'specimen' || volume?.coordinate_system === 'specimen';
function orientationName(vector) {
  if (!specimenCoordinates()) return axisName(vector);
  const axis = vector.map(Math.abs).indexOf(Math.max(...vector.map(Math.abs)));
  return `${vector[axis] >= 0 ? '+' : '−'}${['X','Y','Z'][axis]}`;
}
const stage = $('stage');
const scene = new THREE.Scene(); scene.background = new THREE.Color('#08151e');
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5000); camera.up.set(0, 0, 1);
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
catch (error) { $('load-error').hidden = false; $('load-error-message').textContent = 'El navegador no pudo iniciar WebGL. Activa la aceleración gráfica y vuelve a cargar.'; throw error; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
const group = new THREE.Group(); scene.add(group);
scene.add(new THREE.HemisphereLight(0xecf8ff, 0x26343c, 2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4); keyLight.position.set(1, -2, 3); scene.add(keyLight);
let controls;
let manifest, volume, voxels, aborter, registration, ready = false;
let selected = 0, initialSlice = 0, activeView = 'oblique';
let previewZoom = 1;
let center = new THREE.Vector3(), bounds = new THREE.Box3(), priorBoundsCenter;
let slices = new Map(), references = [], referenceObjects = [], contours = [];
let frame;
let surfaceRoot = null, surfaceBounds = null, mipRecord = null, mipKey = '';

function installControls() {
  controls?.dispose();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.2; controls.maxDistance = 10000;
  controls.addEventListener('start', () => { activeView = 'custom'; updateViewButtons(); });
}
installControls();

function updateViewButtons() {
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === activeView;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}
function status(text, progress) {
  $('load-status').textContent = text;
  if (progress !== undefined) $('load-progress').value = progress;
}
function inputsEnabled(enabled) {
  document.querySelectorAll('main button, main input, main select').forEach(element => { element.disabled = !enabled; });
  $('retry-load').disabled = false;
  $('dataset-select').disabled = false;
}
function dispose() {
  group.traverse(object => {
    object.geometry?.dispose();
    if (object.material) for (const material of [object.material].flat()) { material.map?.dispose(); material.dispose(); }
  });
  group.clear(); slices.clear(); referenceObjects = []; references = []; contours = [];
  $('label-layer').replaceChildren(); voxels = null; frame = null; priorBoundsCenter = null;
  surfaceRoot = null; surfaceBounds = null; mipRecord = null; mipKey = ''; $('representation-section').hidden = true;
}
function normalizeVolume(data) {
  const source = data.volume;
  if (!source) throw new Error('El manifiesto no contiene un volumen de imagen.');
  const result = { ...source, origin: source.origin || source.originRAS || source.origin_ras_mm };
  for (const key of ['dimensions', 'spacing', 'origin']) if (!Array.isArray(result[key]) || result[key].length !== 3 || !result[key].every(Number.isFinite)) throw new Error(`Geometría incompleta: ${key}.`);
  if (!result.dimensions.every(n => Number.isInteger(n) && n > 0) || !result.spacing.every(n => n > 0)) throw new Error('Dimensiones o espaciado inválidos.');
  if (source.dtype && !['uint8', 'u8'].includes(source.dtype)) throw new Error('El visor espera un volumen de visualización uint8.');
  if (source.order && !['x-fastest', 'i-fastest'].includes(source.order)) throw new Error('El orden de los vóxeles no es compatible.');
  result.directions = directionVectors(result);
  if (result.directions.length !== 3 || result.directions.some(d => d.length !== 3 || !d.every(Number.isFinite))) throw new Error('Direcciones del volumen inválidas.');
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    const dot = result.directions[a].reduce((s, value, i) => s + value * result.directions[b][i], 0);
    if (Math.abs(dot - (a === b ? 1 : 0)) > 1e-5) throw new Error('La orientación del volumen no es ortonormal.');
  }
  return result;
}
function normalizeReferences() {
  references = (manifest.landmarks || manifest.references || []).flatMap((ref, index) => {
    const point = ref.position || ref.position_mm || ref.positionRAS;
    let ijk = ref.voxel_ijk || ref.voxel;
    if (!ijk && Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)) ijk = worldToVoxel(volume, point);
    if (!Array.isArray(ijk) || ijk.length !== 3 || !ijk.every(Number.isFinite) || ijk.some((value, axis) => value < -0.5 || value > volume.dimensions[axis] - 0.5)) return [];
    const slice = Number.isInteger(ref.sliceIndex) ? ref.sliceIndex : Math.round(ijk[2]);
    return [{ ...ref, id: ref.id || `reference-${index + 1}`, name: ref.name || ref.label || `Referencia ${index + 1}`, ijk, slice: Math.max(0, Math.min(volume.dimensions[2] - 1, slice)), color: ref.color || ['#f4ce86', '#7be0d1', '#a7c7ff', '#eaa7b8'][index % 4] }];
  });
}
async function loadContours(base, signal) {
  const file = manifest.contours?.file || manifest.contours?.url;
  if (!file) return;
  const url = new URL(file, base);
  if (url.origin !== base.origin) throw new Error('La ruta de los contornos no es válida.');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`No se pudieron cargar los contornos originales (${response.status}).`);
  const data = await response.json();
  if (signal.aborted) return;
  if (!Array.isArray(data)) throw new Error('El archivo de contornos no tiene el formato esperado.');
  for (const roi of data) for (const path of roi.paths || []) {
    if (path.geometry !== 'CLOSED_PLANAR' || !Number.isInteger(path.sliceIndex) || path.sliceIndex < 0 || path.sliceIndex >= volume.dimensions[2] || !Array.isArray(path.points) || path.points.length < 3 || path.points.some(point => !Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite))) throw new Error('Un contorno original tiene geometría inválida.');
    const points = path.points.map(point => worldToVoxel(volume, point));
    if (points.some(point => Math.abs(point[2] - path.sliceIndex) > 0.01)) throw new Error('Un contorno no coincide con su corte de imagen.');
    const color = roi.color || '#7be0d1';
    const line = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
    line.renderOrder = 1000; group.add(line);
    contours.push({ id: roi.id, color, slice: path.sliceIndex, points, line });
  }
}
async function loadSurface(base, signal) {
  if (!manifest.surface?.file) return;
  if (!manifest.surface.registeredToVolume || JSON.stringify(manifest.surface.transform?.flat()) !== JSON.stringify([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])) throw new Error('La superficie requiere un registro físico verificado con estas imágenes.');
  const url = new URL(manifest.surface.file, base);
  if (url.origin !== base.origin) throw new Error('Ruta de superficie no válida.');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('No se pudo cargar la superficie segmentada.');
  const bytes = await response.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, base.href);
  if (signal.aborted) { gltf.scene.traverse(object => { object.geometry?.dispose(); for (const material of [object.material].flat().filter(Boolean)) material.dispose(); }); return; }
  surfaceRoot = gltf.scene;
  surfaceRoot.position.sub(center);
  surfaceRoot.traverse(object => { if (object.isMesh) { for (const material of [object.material].flat()) material?.dispose(); object.material = new THREE.MeshStandardMaterial({ color: '#91ddd4', roughness: 0.68, metalness: 0, side: THREE.DoubleSide }); } });
  group.add(surfaceRoot); surfaceRoot.updateMatrixWorld(true);
  surfaceBounds = new THREE.Box3().setFromObject(surfaceRoot);
}
function originalSliceNumber(index = selected) {
  const mapping = manifest?.sourceOriginalSliceNumbers || manifest?.source_original_slice_numbers || volume?.sourceOriginalSliceNumbers || volume?.source_original_slice_numbers;
  return Array.isArray(mapping) && mapping.length === volume.dimensions[2] ? mapping[index] : null;
}
function sourceDetails() {
  const source = manifest.source || {};
  $('viewer-title').textContent = `${config.title} · ${modalityLabel()} en 3D`;
  document.title = `${config.title} · ${modalityLabel()} en 3D`;
  $('dataset-subtitle').textContent = manifest.subtitle || manifest.title || 'Cortes reales apilados';
  $('dataset-context').textContent = technique.context;
  $('orientation-canvas').setAttribute('aria-label', specimenCoordinates() ? 'Ejes X, Y, Z del espécimen' : 'Brújula de orientación: derecha, anterior y superior');
  $('reference-note').textContent = manifest.contours ? 'Los trazos siguen los contornos originales publicados; los puntos indican el centro de cada región. Se muestran cuando sus cortes están visibles.' : manifest.exVivo ? 'Referencias de la fuente en las coordenadas de la pieza anatómica. No están registradas con el paciente de RM.' : 'No se han añadido contornos ni etiquetas anatómicas sin una segmentación de la fuente.';
  $('dataset-summary').textContent = manifest.summary || manifest.description || 'Volumen médico; los planos 3D proceden de sus cortes.';
  const sequence = typeof manifest.sequence === 'string' ? manifest.sequence : typeof source.sequence === 'string' ? source.sequence : '';
  $('modality-badge').textContent = `${modalityLabel()} · ${volume.dimensions[2]} cortes`;
  $('dataset-resolution').textContent = `${volume.dimensions.join(' × ')} vóxeles · ${volume.spacing.map(n => n.toLocaleString('es', { maximumFractionDigits: 4 })).join(' × ')} mm`;
  const container = $('source-details'); container.replaceChildren();
  const paragraph = text => { if (!text) return; const p = document.createElement('p'); p.textContent = text; container.append(p); };
  paragraph(source.citation || manifest.citation || manifest.title);
  if (source.url) { const url = new URL(source.url); if (url.protocol === 'https:') { const a = document.createElement('a'); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Consultar datos originales'; container.append(a); } }
  paragraph(`Modalidad: ${modalityLabel()}${sequence ? ` (${sequence})` : ''}. Licencia: ${source.license || manifest.license || 'consultar la fuente'}.`);
  for (const text of [manifest.limitations, manifest.orientation_note, volume.processing].flat(2).filter(Boolean)) paragraph(typeof text === 'string' ? text : JSON.stringify(text));
  if (manifest.processing) {
    paragraph(manifest.processing.geometry);
    paragraph(manifest.processing.intensityWindow);
    paragraph([manifest.processing.planeReader, manifest.processing.openslideRole].filter(Boolean).join('. '));
  }
  paragraph('La separación visual mayor que 1× es una ayuda de exploración. No modifica la resolución ni añade detalle a la adquisición.');
}

function localPoint(ijk) {
  const point = new THREE.Vector3(...voxelToWorld(volume, ijk)).sub(center);
  const separation = +$('spacing-range').value;
  point.addScaledVector(new THREE.Vector3(...volume.directions[2]), (ijk[2] - (volume.dimensions[2] - 1) / 2) * volume.spacing[2] * (separation - 1));
  return point;
}
function planeCorners(index) {
  const [width, height] = volume.dimensions;
  // UVs span pixel edges; DICOM geometry and references identify pixel centers.
  return [[-0.5, -0.5], [width - 0.5, -0.5], [width - 0.5, height - 0.5], [-0.5, height - 0.5]].map(([i, j]) => localPoint([i, j, index]));
}
function visibleInterval() {
  const radius = +$('radius-range').value;
  return [Math.max(0, selected - radius), Math.min(volume.dimensions[2] - 1, selected + radius)];
}
function createSlice(index) {
  const { pixels, width, height } = slicePixels(voxels, volume.dimensions, 2, index);
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false }));
  group.add(mesh);
  return { mesh, texture, pixels, threshold: null };
}
function updateTexture(record) {
  const threshold = $('intensity-toggle').checked ? +$('threshold-range').value : -1;
  if (record.threshold === threshold) return;
  for (let p = 0; p < record.pixels.length; p += 4) record.pixels[p + 3] = threshold < 0 ? 255 : Math.max(0, Math.round((record.pixels[p] - threshold) * 255 / (255 - threshold)));
  record.threshold = threshold; record.texture.needsUpdate = true;
}
function updateFrame() {
  if (!frame) {
    frame = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#7fe8d8', transparent: true, opacity: 0.9, depthTest: false }));
    frame.renderOrder = 1000; group.add(frame);
  }
  frame.geometry.setFromPoints(planeCorners(selected));
}
function updateReferences() {
  const [first, last] = visibleInterval();
  for (const contour of contours) {
    contour.line.visible = $('references-toggle').checked && contour.slice >= first && contour.slice <= last;
    if (contour.line.visible) contour.line.geometry.setFromPoints(contour.points.map(localPoint));
  }
  for (const object of referenceObjects) {
    object.marker.position.copy(localPoint(object.ref.ijk));
    object.marker.visible = $('references-toggle').checked && (surfaceRoot?.visible || object.ref.slice >= first && object.ref.slice <= last);
    object.label.style.display = object.marker.visible ? '' : 'none';
  }
}
function buildReferences() {
  const list = $('reference-list'); list.replaceChildren();
  if (!references.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Este conjunto no incluye referencias anatómicas localizadas. El visor no añade etiquetas por detección automática.'; list.append(p); $('references-toggle').checked = false; return; }
  for (const ref of references) {
    const button = document.createElement('button'); button.type = 'button'; button.style.setProperty('--marker', ref.color); button.textContent = ref.name;
    const detail = document.createElement('span'); detail.className = 'reference-note'; detail.textContent = `Posición ${ref.slice + 1}${originalSliceNumber(ref.slice) === null ? '' : ` · corte original ${originalSliceNumber(ref.slice)}`}${ref.placement === 'manual' ? ' · referencia manual' : ''}`; button.append(detail);
    if (ref.derivation) { const provenance = document.createElement('span'); provenance.className = 'reference-note'; provenance.textContent = ref.derivation; button.append(provenance); }
    button.addEventListener('click', () => focusReference(ref.id)); list.append(button);
    const radius = Math.max(Math.min(...volume.spacing) * 1.2, 0.25);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({ color: ref.color, depthTest: false })); marker.renderOrder = 1001; group.add(marker);
    const label = document.createElement('div'); label.className = 'world-label'; label.style.setProperty('--marker', ref.color); label.textContent = ref.name; $('label-layer').append(label);
    referenceObjects.push({ ref, marker, label });
  }
}
function updatePreview() {
  const { pixels, width, height } = slicePixels(voxels, volume.dimensions, 2, selected);
  const canvas = $('selected-canvas'), displayScale = Math.max(1, Math.ceil(384 / width));
  canvas.width = width * displayScale; canvas.height = height * displayScale;
  $('preview-frame').style.aspectRatio = `${width * volume.spacing[0]} / ${height * volume.spacing[1]}`;
  const image = document.createElement('canvas'); image.width = width; image.height = height;
  image.getContext('2d').putImageData(new ImageData(flipSliceRows(pixels, width, height), width, height), 0, 0);
  const ctx = canvas.getContext('2d'); ctx.scale(displayScale, displayScale); ctx.drawImage(image, 0, 0);
  const fontSize = Math.max(4, width / 26);
  ctx.font = `600 ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [text, x, y] of [
    [orientationName(volume.directions[0].map(n => -n)), fontSize, height / 2],
    [orientationName(volume.directions[0]), width - fontSize, height / 2],
    [orientationName(volume.directions[1]), width / 2, fontSize],
    [orientationName(volume.directions[1].map(n => -n)), width / 2, height - fontSize],
  ]) {
    ctx.fillStyle = '#03111ccc'; ctx.fillRect(x - fontSize * .65, y - fontSize * .7, fontSize * 1.3, fontSize * 1.4);
    ctx.fillStyle = '#a9fff0'; ctx.fillText(text, x, y);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if ($('references-toggle').checked) {
    for (const contour of contours.filter(item => item.slice === selected)) {
      ctx.beginPath();
      contour.points.forEach((point, index) => ctx[index ? 'lineTo' : 'moveTo'](point[0] + 0.5, height - 0.5 - point[1]));
      ctx.closePath(); ctx.strokeStyle = contour.color; ctx.lineWidth = Math.max(0.45, width / 400); ctx.stroke();
    }
    for (const ref of references.filter(r => r.slice === selected)) {
      ctx.beginPath(); ctx.arc(ref.ijk[0] + 0.5, height - 0.5 - ref.ijk[1], Math.max(1, width / 130), 0, Math.PI * 2); ctx.strokeStyle = ref.color; ctx.lineWidth = Math.max(0.5, width / 300); ctx.stroke();
    }
  }
  const scaleMm = [1, 2, 5, 10, 20, 50].filter(n => n <= width * volume.spacing[0] * 0.25).at(-1);
  if (scaleMm) {
    const scalePixels = scaleMm / volume.spacing[0], x = width * 0.04, y = height * 0.92;
    ctx.strokeStyle = '#e8ffff'; ctx.lineWidth = Math.max(1, width / 220); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + scalePixels, y); ctx.stroke();
    ctx.fillStyle = '#e8ffff'; ctx.font = `${Math.max(3, width / 25)}px sans-serif`; ctx.fillText(`${scaleMm} mm`, x, y - height * 0.035);
  }
  const original = originalSliceNumber();
  $('selected-title').textContent = original === null ? `Corte ${selected + 1} · imagen 2D` : `Corte original ${original} · imagen 2D`;
  $('selected-position').textContent = `Centro del corte: ${voxelToWorld(volume, [(width - 1) / 2, (height - 1) / 2, selected]).map(n => n.toFixed(2)).join(', ')} mm en las coordenadas de la fuente.`;
  sizePreview();
}
function sizePreview() {
  const frame = $('preview-frame');
  $('preview-content').style.width = `${frame.clientWidth * previewZoom}px`;
  $('preview-content').style.height = `${frame.clientHeight * previewZoom}px`;
  frame.dataset.zoomed = String(previewZoom > 1);
  $('zoom-2d-value').textContent = `${previewZoom.toLocaleString('es', { maximumFractionDigits: 2 })}×`;
  $('zoom-2d-out').disabled = !ready || previewZoom <= 1; $('zoom-2d-in').disabled = !ready || previewZoom >= 6;
}
function setPreviewZoom(value) {
  const frame = $('preview-frame');
  const centerX = (frame.scrollLeft + frame.clientWidth / 2) / previewZoom;
  const centerY = (frame.scrollTop + frame.clientHeight / 2) / previewZoom;
  previewZoom = Math.max(1, Math.min(6, Math.round(value * 4) / 4)); sizePreview();
  frame.scrollLeft = centerX * previewZoom - frame.clientWidth / 2;
  frame.scrollTop = centerY * previewZoom - frame.clientHeight / 2;
}
function updateStack({ follow = true } = {}) {
  if (!voxels) return;
  const mode = $('representation-select').value;
  const showSlices = mode === 'slices' || mode === 'combined';
  $('spacing-range').disabled = mode !== 'slices';
  if (mode !== 'slices') $('spacing-range').value = 1;
  selected = +$('slice-range').value - 1;
  const [first, last] = visibleInterval();
  for (const [index, record] of slices) if (!showSlices || index < first || index > last) {
    group.remove(record.mesh); record.mesh.geometry.dispose(); record.texture.dispose(); record.mesh.material.dispose(); slices.delete(index);
  }
  bounds.makeEmpty();
  for (let index = first; showSlices && index <= last; index++) {
    if (!slices.has(index)) slices.set(index, createSlice(index));
    const record = slices.get(index), corners = planeCorners(index), position = record.mesh.geometry.attributes.position;
    corners.forEach((point, i) => { position.setXYZ(i, point.x, point.y, point.z); bounds.expandByPoint(point); });
    position.needsUpdate = true; record.mesh.geometry.computeBoundingSphere();
    const opacity = +$('opacity-range').value / 100;
    record.mesh.material.opacity = opacity * (index === selected ? 1 : $('intensity-toggle').checked ? 0.65 : 0.18);
    updateTexture(record);
  }
  if (surfaceRoot) {
    surfaceRoot.visible = mode === 'surface' || mode === 'combined';
    if (surfaceRoot.visible) bounds.union(surfaceBounds);
    surfaceRoot.traverse(object => { if (object.isMesh) { object.material.opacity = mode === 'surface' ? +$('opacity-range').value / 100 : 1; object.material.transparent = object.material.opacity < 1; object.material.depthWrite = !object.material.transparent; } });
  }
  if (mipRecord) mipRecord.mesh.visible = mode === 'mip';
  if (mode === 'mip') {
    if (!mipRecord) mipRecord = createSlice(selected);
    mipRecord.mesh.visible = true;
    const key = `${first}:${last}`;
    if (key !== mipKey) {
      const count = volume.dimensions[0] * volume.dimensions[1];
      for (let pixel = 0; pixel < count; pixel++) {
        let value = 0;
        for (let k = first; k <= last; k++) value = Math.max(value, voxels[k * count + pixel]);
        const p = pixel * 4; mipRecord.pixels[p] = mipRecord.pixels[p + 1] = mipRecord.pixels[p + 2] = value;
      }
      mipRecord.threshold = null; mipKey = key;
    }
    const position = mipRecord.mesh.geometry.attributes.position;
    planeCorners(selected).forEach((point, i) => { position.setXYZ(i, point.x, point.y, point.z); bounds.expandByPoint(point); });
    position.needsUpdate = true; mipRecord.mesh.geometry.computeBoundingSphere(); mipRecord.mesh.material.opacity = +$('opacity-range').value / 100; updateTexture(mipRecord);
  }
  $('surface-note').textContent = mode === 'mip' ? `Máximo de intensidad de los cortes ${first + 1}–${last + 1}, proyectado sobre un plano. Muestra señales superpuestas; no es una segmentación de los vasos.` : mode === 'surface' || mode === 'combined' ? 'Laberinto óseo: superficie original de los autores, derivada de la segmentación de estas mismas imágenes micro-TC. En la vista combinada se mantiene la escala física 1×. No incluye nervios ni huesecillos separados.' : 'Cortes reales colocados según la geometría de la adquisición. La imagen 2D permite revisar el corte seleccionado.';
  const nextCenter = bounds.getCenter(new THREE.Vector3());
  if (follow && priorBoundsCenter) { const shift = nextCenter.clone().sub(priorBoundsCenter); controls.target.add(shift); camera.position.add(shift); }
  priorBoundsCenter = nextCenter;
  updateFrame(); updateReferences(); updatePreview();
  frame.visible = mode !== 'surface';
  if (mode === 'mip') { for (const item of contours) item.line.visible = false; for (const item of referenceObjects) item.marker.visible = false; }
  $('slice-value').textContent = `${selected + 1} / ${volume.dimensions[2]}${originalSliceNumber() === null ? '' : ` · orig. ${originalSliceNumber()}`}`;
  $('radius-value').textContent = +$('radius-range').value === volume.dimensions[2] - 1 ? 'Todos' : `±${$('radius-range').value}`;
  $('visible-count').textContent = mode === 'surface' ? 'Superficie completa; el control de posición recorre los cortes en la imagen 2D.' : `${last - first + 1} cortes ${mode === 'mip' ? 'proyectados' : 'visibles'}: ${first + 1} a ${last + 1}.`;
  $('opacity-value').textContent = `${$('opacity-range').value} %`;
  $('spacing-value').textContent = `${(+$('spacing-range').value).toLocaleString('es', { minimumFractionDigits: 1 })}×`;
  $('threshold-value').textContent = `${$('threshold-range').value} / 255`;
  $('threshold-range').disabled = !$('intensity-toggle').checked;
}
function fitView(view = activeView) {
  if (!volume || bounds.isEmpty()) return;
  const d = volume.directions.map(v => new THREE.Vector3(...v));
  const direction = view === 'custom' ? camera.position.clone().sub(controls.target).normalize()
    : view === 'axial' ? d[2].clone().addScaledVector(d[1], -0.00001)
    : view === 'lateral' ? d[1].clone().multiplyScalar(-1.7).addScaledVector(d[2], 0.1)
    : d[0].clone().addScaledVector(d[1], -1.6).addScaledVector(d[2], 0.85);
  direction.normalize();
  const distance = fitBoxDistance(bounds.min.toArray(), bounds.max.toArray(), direction.toArray(), camera.up.toArray(), camera.aspect, camera.fov, 1.13);
  const damping = controls.enableDamping; controls.enableDamping = false; controls.update();
  controls.target.copy(bounds.getCenter(new THREE.Vector3()));
  camera.position.copy(controls.target).addScaledVector(direction, Math.max(distance, 0.5));
  camera.near = Math.max(0.001, distance / 10000); camera.far = Math.max(1000, distance * 15); camera.updateProjectionMatrix();
  camera.lookAt(controls.target); controls.update(); controls.enableDamping = damping;
  activeView = view; updateViewButtons();
}
function focusReference(id) {
  const ref = references.find(item => item.id === id); if (!ref) throw new Error('Referencia no disponible.');
  $('representation-select').value = 'slices';
  $('slice-range').value = ref.slice + 1; $('radius-range').value = 0; $('references-toggle').checked = true;
  updateStack(); fitView('axial');
}
function resetView() {
  if (!ready) return;
  $('representation-select').value = technique.defaultRepresentation || 'slices';
  $('slice-range').value = initialSlice + 1; $('radius-range').value = Math.min(technique.defaultRadius ?? manifest.defaultRadius ?? 10, volume.dimensions[2] - 1);
  $('opacity-range').value = technique.defaultOpacity ?? 72; $('spacing-range').value = 1; $('intensity-toggle').checked = false; $('threshold-range').value = 110;
  $('references-toggle').checked = references.length > 0;
  setPreviewZoom(1); updateStack(); fitView(technique.defaultView || 'oblique');
}

async function load() {
  aborter?.abort(); const controller = new AbortController(); aborter = controller;
  registration?.dispose(); ready = false; window.earMriReady = false; controls.enabled = false; inputsEnabled(false); dispose();
  manifest = null; volume = null;
  $('viewer-title').textContent = `${config.title} · ${technique.modalityLabel}`;
  $('dataset-subtitle').textContent = 'Cargando el conjunto seleccionado…'; $('dataset-context').textContent = technique.context;
  $('dataset-summary').textContent = ''; $('dataset-resolution').textContent = ''; $('source-details').replaceChildren();
  $('reference-list').replaceChildren(); $('reference-note').textContent = '';
  $('selected-title').textContent = 'Corte seleccionado · 2D'; $('selected-position').textContent = '';
  $('slice-value').textContent = '—'; $('visible-count').textContent = 'Preparando los cortes del conjunto seleccionado…';
  $('assistant-status').textContent = 'Disponible después de cargar este conjunto.'; $('assistant-action').textContent = '';
  $('modality-badge').textContent = technique.modalityLabel;
  $('selected-canvas').getContext('2d').clearRect(0, 0, $('selected-canvas').width, $('selected-canvas').height);
  $('load-error').hidden = true; $('load-progress').hidden = false; status('Cargando la información de las imágenes…', 0);
  try {
    const manifestUrl = new URL(technique.manifest, location.href), base = new URL('./', manifestUrl);
    const response = await fetch(manifestUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`No se pudo cargar el manifiesto (${response.status}).`);
    const data = await response.json(); if (controller.signal.aborted) return;
    if (data.modality !== technique.modality) throw new Error('La modalidad de las imágenes no coincide con la técnica seleccionada.');
    manifest = data; volume = normalizeVolume(data); sourceDetails();
    status(`Descargando los cortes de ${modalityLabel()}…`, 15);
    const file = volume.file || volume.url;
    if (typeof file !== 'string' || !file || new URL(file, base).origin !== base.origin) throw new Error('La ruta del volumen no es válida.');
    const image = await fetch(new URL(file, base), { signal: controller.signal });
    if (!image.ok) throw new Error(`No se pudo descargar el volumen (${image.status}).`);
    status('Preparando los planos de imagen…', 60);
    let buffer;
    if (file.endsWith('.gz') || volume.encoding === 'gzip') {
      if (!globalThis.DecompressionStream) throw new Error('Actualiza el navegador para descomprimir este volumen.');
      buffer = await new Response(image.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    } else buffer = await image.arrayBuffer();
    if (controller.signal.aborted) return;
    const expected = volume.dimensions.reduce((a, b) => a * b, 1);
    if (buffer.byteLength !== expected) throw new Error(`El volumen está incompleto: ${buffer.byteLength} bytes de ${expected}.`);
    voxels = new Uint8Array(buffer);
    center.set(...voxelToWorld(volume, volume.dimensions.map(n => (n - 1) / 2)));
    camera.up.set(...volume.directions[2]); installControls();
    normalizeReferences(); await loadContours(base, controller.signal);
    if (controller.signal.aborted) return;
    await loadSurface(base, controller.signal);
    if (controller.signal.aborted) return;
    for (const option of $('representation-select').options) { option.hidden = option.disabled = ['surface','combined'].includes(option.value) && !surfaceRoot; }
    $('representation-section').hidden = false;
    buildReferences();
    const candidate = manifest.defaultSlice ?? manifest.initial_slice_index ?? manifest.initial_slice ?? references[0]?.slice ?? Math.floor(volume.dimensions[2] / 2);
    initialSlice = Number.isInteger(candidate) ? Math.max(0, Math.min(volume.dimensions[2] - 1, candidate)) : Math.floor(volume.dimensions[2] / 2);
    $('slice-range').max = volume.dimensions[2]; $('radius-range').max = volume.dimensions[2] - 1;
    ready = true; inputsEnabled(true); $('references-toggle').disabled = references.length === 0; resetView();
    status(`${manifest.title || 'Imágenes'} · listo`, 100); $('load-progress').hidden = true;
    registerTools(); window.earMriReady = true;
  } catch (error) {
    if (controller.signal.aborted) return;
    ready = false; window.earMriReady = false;
    $('load-error').hidden = false; $('load-error-message').textContent = error.message;
    inputsEnabled(false); $('load-progress').hidden = true; status('Las imágenes no se han cargado. Puedes reintentar o elegir otra técnica.', 0);
    console.error('Visor de imágenes médicas:', error);
  }
}
function getState() {
  const [first, last] = ready ? visibleInterval() : [0, -1];
  return { dataset: manifest?.id || technique.id, modality: manifest?.modality || technique.modality, representation: $('representation-select').value, ex_vivo: !!manifest?.exVivo, ready, slice: selected + 1, source_slice_number: originalSliceNumber(), slice_count: volume?.dimensions[2], visible_slices: Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i + 1), radius: +$('radius-range').value, opacity_percent: +$('opacity-range').value, visual_spacing: +$('spacing-range').value, zoom_2d: previewZoom, view: activeView, references_visible: $('references-toggle').checked, intensity_filter: { enabled: $('intensity-toggle').checked, threshold: +$('threshold-range').value } };
}
function registerTools() {
  const prefix = config.anatomy === 'celiac' ? 'ct_celiaco' : manifest.modality === 'MR' ? 'mri_oido' : 'microct_oido';
  const schema = properties => ({ type: 'object', properties, additionalProperties: false });
  const make = (name, description, properties, action, readOnlyHint = false) => ({ name, description, inputSchema: schema(properties), annotations: { readOnlyHint, untrustedContentHint: true }, execute: async input => {
    if (!ready) throw new Error('Las imágenes todavía no están listas.');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(properties, key))) throw new Error('Parámetros no válidos.');
    for (const [key, value] of Object.entries(input)) {
      const rule = properties[key];
      if ((rule.type === 'integer' ? !Number.isInteger(value) : typeof value !== rule.type) || (rule.enum && !rule.enum.includes(value)) || (typeof value === 'number' && (!Number.isFinite(value) || value < rule.minimum || value > rule.maximum))) throw new Error(`Valor no válido: ${key}.`);
      if (rule.multipleOf && Math.abs(value / rule.multipleOf - Math.round(value / rule.multipleOf)) > 1e-8) throw new Error(`Incremento no válido: ${key}.`);
    }
    const result = action(input);
    if (!readOnlyHint) $('assistant-action').textContent = `Última acción: ${description.split('.')[0]}.`;
    return JSON.stringify({ ...result, state: getState() });
  } });
  const tools = [
    make(`${prefix}_obtener_contexto`, 'Consulta la fuente, modalidad, resolución, referencias proporcionadas y estado del apilado de cortes.', {}, () => ({ title: manifest.title, source: manifest.source, sequence: manifest.sequence, surface: manifest.surface || null, limitations: manifest.limitations, volume: { dimensions: volume.dimensions, spacing_mm: volume.spacing, origin: volume.origin, directions: volume.directions }, references: references.map(({ id, name, slice, placement, derivation }) => ({ id, name, slice: slice + 1, source_slice_number: originalSliceNumber(slice), placement, derivation, original_contour_count: contours.filter(contour => contour.id === id).length })) }), true),
    make(`${prefix}_ajustar_cortes`, 'Ajusta los cortes reales apilados: posición desde 1 en este volumen, vecinos, opacidad, separación visual, zoom2D y filtro de intensidad 3D. La posición no es necesariamente el número original DICOM.', { representation: { type: 'string', enum: surfaceRoot ? ['slices','mip','surface','combined'] : ['slices','mip'] }, slice: { type: 'integer', minimum: 1, maximum: volume.dimensions[2] }, radius: { type: 'integer', minimum: 0, maximum: volume.dimensions[2] - 1 }, opacity: { type: 'integer', minimum: 5, maximum: 100 }, spacing: { type: 'number', minimum: 1, maximum: 3, multipleOf: 0.1 }, zoom_2d: { type: 'number', minimum: 1, maximum: 6, multipleOf: 0.25 }, view: { type: 'string', enum: ['oblique', 'axial', 'lateral'] }, references: { type: 'boolean' }, intensity_filter: { type: 'boolean' }, threshold: { type: 'integer', minimum: 0, maximum: 245 } }, input => {
      if (!Object.keys(input).length) throw new Error('Indica al menos un ajuste.');
      for (const [key, id] of [['slice', 'slice-range'], ['radius', 'radius-range'], ['opacity', 'opacity-range'], ['spacing', 'spacing-range']]) if (input[key] !== undefined) $(id).value = input[key];
      if (input.references !== undefined) $('references-toggle').checked = input.references && references.length > 0;
      if (input.intensity_filter !== undefined) $('intensity-toggle').checked = input.intensity_filter;
      if (input.threshold !== undefined) $('threshold-range').value = input.threshold;
      if (input.zoom_2d !== undefined) setPreviewZoom(input.zoom_2d);
      if (input.representation) $('representation-select').value = input.representation;
      updateStack(); if (input.representation || input.view || input.radius !== undefined || input.spacing !== undefined) fitView(input.view || activeView);
    }),
    make(`${prefix}_enfocar_referencia`, 'Muestra el corte de una referencia proporcionada para estas imágenes; no detecta ni segmenta anatomía.', { reference: { type: 'string', ...(references.length ? { enum: references.map(ref => ref.id) } : {}) } }, ({ reference }) => { if (!reference) throw new Error('Indica una referencia disponible.'); focusReference(reference); }),
    make(`${prefix}_restaurar_vista`, 'Restablece el apilado inicial de cortes de imagen.', {}, () => resetView()),
  ];
  registration = installViewerTools({ tools, onStatus: value => { $('assistant-status').textContent = { ready: 'WebMCP disponible para un asistente compatible.', unavailable: 'Este navegador no ofrece WebMCP. Todos los controles manuales están disponibles.', connecting: 'Comprobando compatibilidad…', error: 'No se pudo activar WebMCP. Puedes seguir usando los controles manuales.' }[value]; } });
}

$('dataset-select').addEventListener('change', () => {
  const item = config.datasets.find(entry => entry.id === $('dataset-select').value);
  if (item.href) { location.assign(item.href); return; }
  technique = item;
  const url = new URL(location.href);
  if (item.id === config.defaultDataset) url.searchParams.delete('tecnica'); else url.searchParams.set('tecnica', item.id);
  history.replaceState(null, '', url); load();
});
$('representation-select').addEventListener('change', () => { if (!ready) return; updateStack({ follow: false }); fitView(); });
$('slice-range').addEventListener('input', () => updateStack());
for (const id of ['radius-range', 'spacing-range']) $(id).addEventListener('input', () => { updateStack(); fitView(); });
for (const id of ['opacity-range', 'references-toggle', 'intensity-toggle', 'threshold-range']) $(id).addEventListener('input', () => updateStack());
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => ready && fitView(button.dataset.view)));
$('fit-view').addEventListener('click', () => fitView()); $('reset-view').addEventListener('click', resetView); $('retry-load').addEventListener('click', load);
$('zoom-2d-out').addEventListener('click', () => setPreviewZoom(previewZoom - 0.25));
$('zoom-2d-in').addEventListener('click', () => setPreviewZoom(previewZoom + 0.25));
$('zoom-2d-reset').addEventListener('click', () => setPreviewZoom(1));
$('preview-frame').addEventListener('wheel', event => { if (!ready) return; event.preventDefault(); setPreviewZoom(previewZoom + (event.deltaY < 0 ? 0.25 : -0.25)); }, { passive: false });
let drag2d;
$('preview-frame').addEventListener('pointerdown', event => {
  if (!ready || previewZoom <= 1 || event.pointerType === 'touch') return;
  const frame = $('preview-frame'); drag2d = [event.clientX, event.clientY, frame.scrollLeft, frame.scrollTop]; frame.setPointerCapture(event.pointerId); frame.classList.add('dragging'); event.preventDefault();
});
$('preview-frame').addEventListener('pointermove', event => { if (!drag2d) return; $('preview-frame').scrollLeft = drag2d[2] + drag2d[0] - event.clientX; $('preview-frame').scrollTop = drag2d[3] + drag2d[1] - event.clientY; });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('preview-frame').addEventListener(name, () => { drag2d = null; $('preview-frame').classList.remove('dragging'); });
$('fullscreen').addEventListener('click', async () => { if (document.fullscreenElement) await document.exitFullscreen(); else await $('viewer-shell').requestFullscreen(); });
$('save-image').addEventListener('click', () => {
  if (!ready) return;
  renderer.render(scene, camera);
  const canvas = document.createElement('canvas'); canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(renderer.domElement, 0, 0); const ratio = canvas.width / stage.clientWidth;
  ctx.save(); ctx.scale(ratio, ratio); ctx.font = '12px system-ui';
  for (const object of referenceObjects) if (object.label.style.display !== 'none') {
    const x = parseFloat(object.label.style.left), y = parseFloat(object.label.style.top); if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    ctx.fillStyle = '#07131de6'; ctx.fillRect(x, y, object.label.offsetWidth, object.label.offsetHeight); ctx.fillStyle = '#e8ffff'; ctx.fillText(object.ref.name, x + 7, y + 16);
  }
  ctx.fillStyle = '#07131de6'; ctx.fillRect(6, stage.clientHeight - 42, stage.clientWidth - 12, 36); ctx.fillStyle = '#d6eef0';
  ctx.fillText(`${config.title} · ${modalityLabel()} · ${$('representation-select').selectedOptions[0].text} · corte ${selected + 1} · separación ${$('spacing-range').value}× · ${manifest.source?.license || 'fuente en el visor'}`, 14, stage.clientHeight - 19); ctx.restore();
  canvas.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `imagen-${config.anatomy}-${technique.id}-${selected + 1}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
});

let priorAspect;
new ResizeObserver(() => {
  const width = stage.clientWidth, height = stage.clientHeight; if (!width || !height) return;
  camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  if (ready && priorAspect && Math.abs(camera.aspect / priorAspect - 1) > 0.1) fitView();
  priorAspect = camera.aspect;
}).observe(stage);
new ResizeObserver(sizePreview).observe($('preview-frame'));
const projected = new THREE.Vector3();
function drawOrientation() {
  const canvas = $('orientation-canvas'), ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 100, 100);
  if (!ready) return;
  const rotation = camera.quaternion.clone().invert();
  const axes = [[new THREE.Vector3(1, 0, 0), 'R', '#ffb5b4'], [new THREE.Vector3(0, 1, 0), 'A', '#89e7d7'], [new THREE.Vector3(0, 0, 1), 'S', '#a5caff']].map(([vector, name, color]) => ({ vector: vector.applyQuaternion(rotation), name: specimenCoordinates() ? ({R:'+X',A:'+Y',S:'+Z'})[name] : name, color })).sort((a, b) => a.vector.z - b.vector.z);
  ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const { vector, name, color } of axes) {
    const x = 50 + vector.x * 29, y = 49 - vector.y * 29;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(50, 49); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = color; ctx.fillText(name, 50 + vector.x * 39, 49 - vector.y * 39);
  }
}
function animate() {
  requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); drawOrientation();
  const used = [];
  for (const object of referenceObjects) {
    projected.copy(object.marker.position).project(camera);
    const visible = ready && object.marker.visible && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
    object.label.style.display = visible ? '' : 'none'; if (!visible) continue;
    const w = object.label.offsetWidth, h = object.label.offsetHeight;
    const x = Math.max(6, Math.min(stage.clientWidth - w - 6, (projected.x + 1) * stage.clientWidth / 2 + 9));
    const y = Math.max(6, Math.min(stage.clientHeight - h - 25, (1 - projected.y) * stage.clientHeight / 2 - 12));
    if (used.some(box => x < box.x + box.w + 3 && x + w + 3 > box.x && y < box.y + box.h + 3 && y + h + 3 > box.y)) { object.label.style.display = 'none'; continue; }
    object.label.style.left = `${x}px`; object.label.style.top = `${y}px`; used.push({ x, y, w, h });
  }
}
animate(); load();
