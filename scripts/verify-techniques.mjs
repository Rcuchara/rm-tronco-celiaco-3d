import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { directionVectors, voxelToWorld, worldToVoxel } from '../src/ear-math.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceOnly = process.argv.includes('--source-only');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const close = (a, b, tolerance = 1e-5) => {
  assert.equal(a.length, b.length);
  a.forEach((value, i) => assert.ok(Number.isFinite(value) && Math.abs(value - b[i]) <= tolerance,
    `Geometry differs at axis ${i}: ${value} versus ${b[i]}`));
};
const safeFile = file => {
  assert.equal(typeof file, 'string');
  assert.match(file, /^[\w.-]+$/, 'Asset must be a file in its own dataset directory');
  assert.ok(file !== '.' && file !== '..');
  return file;
};
const assertInVolume = (volume, point, tolerance = 0.51) => {
  const ijk = worldToVoxel(volume, point);
  assert.ok(ijk.every((v, axis) => Number.isFinite(v) && v >= -tolerance && v <= volume.dimensions[axis] - 1 + tolerance),
    `Physical point is outside its source image: ${point.join(', ')}`);
  close(voxelToWorld(volume, ijk), point);
  return ijk;
};

async function verifyGrid(directory, grid, { mask = false } = {}) {
  assert.equal(grid.dtype, 'uint8');
  assert.equal(grid.encoding, 'gzip');
  assert.equal(grid.order, 'x-fastest');
  assert.equal(grid.units, 'mm');
  assert.equal(grid.dimensions.length, 3);
  assert.ok(grid.dimensions.every(n => Number.isInteger(n) && n > 0));
  assert.equal(grid.spacing.length, 3);
  assert.ok(grid.spacing.every(n => Number.isFinite(n) && n > 0));
  assert.equal(grid.origin.length, 3);
  assert.ok(grid.origin.every(Number.isFinite));
  const directions = directionVectors(grid);
  assert.equal(directions.length, 3);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    assert.equal(directions[a].length, 3);
    const dot = directions[a].reduce((sum, value, i) => sum + value * directions[b][i], 0);
    assert.ok(Math.abs(dot - (a === b ? 1 : 0)) < 1e-5, 'Axes must be orthonormal');
  }
  const bytes = await readFile(join(directory, safeFile(grid.file)));
  const pixels = gunzipSync(bytes);
  assert.equal(pixels.length, grid.dimensions.reduce((a, b) => a * b, 1));
  assert.equal(hash(bytes), grid.sha256Compressed || grid.sha256);
  assert.equal(hash(pixels), grid.sha256Raw);
  if (grid.bytes !== undefined) assert.equal(bytes.length, grid.bytes);
  if (!mask) assert.ok(new Set(pixels).size > 100, 'The acquired image must retain a grayscale range');
  if (grid.affine) {
    assert.equal(grid.affine.length, 4);
    grid.affine.slice(0, 3).forEach((row, axis) => close(row,
      [...directions.map((d, j) => d[axis] * grid.spacing[j]), grid.origin[axis]]));
    close(grid.affine[3], [0, 0, 0, 1]);
  }
  for (let bits = 0; bits < 8; bits++) {
    const ijk = grid.dimensions.map((n, axis) => bits & (1 << axis) ? n - 1 : 0);
    close(worldToVoxel(grid, voxelToWorld(grid, ijk)), ijk);
  }
  return pixels;
}

async function verifyDataset(relative, publishedRelative) {
  const directory = join(root, relative);
  const manifestBytes = await readFile(join(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.source.license, 'CC BY 4.0');
  assert.equal(new URL(manifest.source.license_url).hostname, 'creativecommons.org');
  assert.equal(new URL(manifest.source.url).protocol, 'https:');
  assert.ok(manifest.source.doi && manifest.source.citation && manifest.source.download_url);
  assert.ok(Array.isArray(manifest.limitations) && manifest.limitations.length > 0);
  assert.equal(manifest.display_resolution.resampled, false);
  close(manifest.volume.spacing, manifest.source_resolution.spacing_mm);
  close(manifest.volume.spacing, manifest.display_resolution.spacing_mm);
  assert.deepEqual(manifest.volume.dimensions, manifest.display_resolution.dimensions);
  const pixels = await verifyGrid(directory, manifest.volume);
  assert.ok(Number.isInteger(manifest.defaultSlice) && manifest.defaultSlice >= 0 && manifest.defaultSlice < manifest.volume.dimensions[2]);
  for (const landmark of manifest.landmarks || []) {
    assert.ok(landmark.source && landmark.derivation, 'Every anatomical landmark needs provenance');
    const point = landmark.positionRAS || landmark.position_mm || landmark.position;
    const voxel = assertInVolume(manifest.volume, point);
    if (landmark.voxel) close(voxel, landmark.voxel);
    if (landmark.sliceIndex !== undefined) assert.ok(Math.abs(landmark.sliceIndex - voxel[2]) <= 0.51);
  }
  const entries = await readdir(directory, { withFileTypes: true });
  assert.ok(entries.every(entry => entry.isFile()), 'Dataset publication should contain only declared flat assets');
  for (const [file, expected] of Object.entries(manifest.files)) {
    const data = await readFile(join(directory, safeFile(file)));
    assert.equal(data.length, expected.bytes, `Size: ${file}`);
    assert.equal(hash(data), expected.sha256, `SHA-256: ${file}`);
  }
  assert.ok(manifest.files[manifest.volume.file], 'Image must be included in the file checksum table');
  if (!sourceOnly) {
    const published = join(root, publishedRelative);
    const sourceNames = entries.map(entry => entry.name).sort();
    assert.deepEqual((await readdir(published)).sort(), sourceNames, `Published file set differs: ${publishedRelative}`);
    for (const file of sourceNames) {
      const [a, b] = await Promise.all([readFile(join(directory, file)), readFile(join(published, file))]);
      assert.equal(a.length, b.length, `Published size: ${file}`);
      assert.equal(hash(a), hash(b), `Published bytes: ${file}`);
    }
  }
  return { directory, manifest, pixels };
}

// Parse the binary glTF positions and triangle indices, including scene node
// transforms, instead of trusting bounding boxes copied into the manifest.
function meshGeometry(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'glTF 2');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  let offset = 12;
  let document, binary;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0);
    assert.ok(offset + 8 + length <= bytes.length);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) document = JSON.parse(chunk.toString('utf8').trim());
    else if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  assert.ok(document && binary);
  assert.equal(document.buffers.length, 1);
  assert.ok(!document.buffers[0].uri, 'The registered surface must be self contained');
  assert.ok(binary.length >= document.buffers[0].byteLength && binary.length - document.buffers[0].byteLength < 4);
  const readAccessor = index => {
    const accessor = document.accessors[index], view = document.bufferViews[accessor.bufferView];
    assert.ok(!accessor.sparse && !accessor.normalized);
    assert.equal(view.buffer || 0, 0);
    const channels = { SCALAR: 1, VEC3: 3 }[accessor.type];
    const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    assert.ok(channels && size && Number.isInteger(accessor.count) && accessor.count > 0);
    const stride = view.byteStride || channels * size;
    const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const end = start + (accessor.count - 1) * stride + channels * size;
    assert.ok(stride >= channels * size && end <= (view.byteOffset || 0) + view.byteLength && end <= binary.length);
    const read = { 5121: p => binary.readUInt8(p), 5123: p => binary.readUInt16LE(p), 5125: p => binary.readUInt32LE(p), 5126: p => binary.readFloatLE(p) }[accessor.componentType];
    return { accessor, values: Array.from({ length: accessor.count }, (_, i) => Array.from({ length: channels }, (_, c) => read(start + i * stride + c * size))) };
  };
  const points = [];
  let triangles = 0;
  const active = new Set();
  const visit = (index, parent) => {
    assert.ok(!active.has(index), 'GLB scene cycle');
    active.add(index);
    const node = document.nodes[index];
    assert.ok(node && node.skin === undefined && node.weights === undefined, 'Only a static original surface is supported');
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3(...(node.translation || [0, 0, 0])), new Quaternion(...(node.rotation || [0, 0, 0, 1])), new Vector3(...(node.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of document.meshes[node.mesh].primitives) {
      assert.equal(primitive.mode ?? 4, 4, 'Triangular surface required');
      assert.ok(!primitive.targets && !primitive.extensions, 'Unexpected surface deformation/compression');
      const positions = readAccessor(primitive.attributes.POSITION);
      assert.equal(positions.accessor.type, 'VEC3');
      assert.equal(positions.accessor.componentType, 5126);
      for (const point of positions.values) {
        assert.ok(point.every(Number.isFinite));
        points.push(new Vector3(...point).applyMatrix4(world).toArray());
      }
      const indices = primitive.indices === undefined ? Array.from({ length: positions.values.length }, (_, i) => [i]) : readAccessor(primitive.indices).values;
      assert.equal(indices.length % 3, 0);
      for (const index of indices) assert.ok(index.length === 1 && Number.isInteger(index[0]) && index[0] >= 0 && index[0] < positions.values.length);
      triangles += indices.length / 3;
    }
    for (const child of node.children || []) visit(child, world);
    active.delete(index);
  };
  for (const node of document.scenes[document.scene || 0].nodes) visit(node, new Matrix4());
  assert.ok(points.length > 0);
  return { points, triangles };
}

const ct = await verifyDataset('assets/celiac/ct', 'site/celiaco/tc/data/ct');
assert.equal(ct.manifest.modality, 'CT');
assert.equal(ct.manifest.patientId, 'C3L-02112');
assert.equal(ct.manifest.source.series_instance_uid, '1.3.6.1.4.1.14519.5.2.1.1078.3273.100695794070451892455483306265');
assert.equal(ct.manifest.volume.coordinateSystem, 'RAS');
assert.equal(ct.manifest.volume.window.units, 'HU');
close(ct.manifest.volume.spacing, [0.703125, 0.703125, 0.625]);
const celiacMRI = JSON.parse(await readFile(join(root, 'data/study_data.json')));
assert.notEqual(ct.manifest.patientId, celiacMRI.case, 'CT must retain its separate source patient identity');
const planes = ct.manifest.source_slices, grid = ct.manifest.volume;
assert.equal(planes.length, grid.dimensions[2]);
assert.equal(new Set(planes.map(p => p.SOPInstanceUID)).size, planes.length);
planes.forEach((plane, k) => {
  assert.equal(plane.index, k);
  assert.equal(plane.source_slice_index, grid.sourceIndexOffset[2] + k);
  assert.equal(plane.InstanceNumber, ct.manifest.sourceOriginalSliceNumbers[k]);
  close(plane.position_ras, plane.ImagePositionPatient.map((v, axis) => axis < 2 ? -v : v));
  const directions = directionVectors(grid);
  const cropOrigin = plane.position_ras.map((value, axis) => value +
    directions[0][axis] * grid.spacing[0] * grid.sourceIndexOffset[0] +
    directions[1][axis] * grid.spacing[1] * grid.sourceIndexOffset[1]);
  close(cropOrigin, voxelToWorld(grid, [0, 0, k]));
  close(cropOrigin, plane.crop_origin_ras);
});
const provenance = JSON.parse(await readFile(join(ct.directory, 'provenance.json')));
assert.equal(provenance.series_instance_uid, ct.manifest.source.series_instance_uid);
assert.deepEqual(provenance.source_instances.map(p => p.SOPInstanceUID), planes.map(p => p.SOPInstanceUID));
for (const instance of provenance.source_instances) assert.match(instance.sha256, /^[a-f0-9]{64}$/);
console.log(`Celiac CT: ${grid.dimensions.join(' × ')} voxels; DICOM geometry, source identities and checksums verified.`);

const ear = await verifyDataset('assets/ear/reference', 'site/oido/data/reference');
const { manifest } = ear;
assert.equal(manifest.modality, 'microCT');
assert.equal(manifest.exVivo, true);
assert.equal(manifest.patientId, null);
assert.equal(manifest.specimenId, 'F01');
assert.equal(manifest.registeredToMRI, false);
assert.equal(manifest.source.doi, '10.5281/zenodo.3355272');
assert.match(manifest.source.archive_sha256, /^[a-f0-9]{64}$/);
assert.equal(manifest.volume.coordinateSystem, 'specimen');
assert.deepEqual(manifest.volume.dimensions, manifest.source_resolution.dimensions);
assert.ok(manifest.volume.spacing.every(n => n > 0.06069 && n < 0.06071), 'Preserve acquired F01 microCT sampling');
const mask = await verifyGrid(ear.directory, manifest.mask, { mask: true });
for (const key of ['dimensions', 'origin', 'spacing', 'directions', 'affine', 'coordinateSystem', 'units', 'order']) {
  assert.deepEqual(manifest.mask[key], manifest.volume[key], `Mask/image mismatch: ${key}`);
}
const labels = new Set([manifest.mask.background, ...manifest.mask.labels.map(label => label.value)]);
let foreground = 0;
for (const value of mask) {
  assert.ok(labels.has(value), `Undeclared mask label ${value}`);
  if (value !== manifest.mask.background) foreground++;
}
assert.equal(foreground, manifest.mask.foregroundVoxelCount);
assert.ok(foreground > 0 && foreground < mask.length);
assert.equal(manifest.surface.registeredToVolume, true);
assert.equal(manifest.surface.coordinateSystem, manifest.volume.coordinateSystem);
assert.equal(manifest.surface.units, 'mm');
assert.ok(manifest.mask.labels.some(label => label.value === manifest.surface.segmentationLabel));
const surfaceBytes = await readFile(join(ear.directory, safeFile(manifest.surface.file)));
assert.equal(hash(surfaceBytes), manifest.surface.sha256);
assert.equal(surfaceBytes.length, manifest.surface.bytes);
const surface = meshGeometry(surfaceBytes);
assert.equal(surface.points.length, manifest.surface.vertices);
assert.equal(surface.triangles, manifest.surface.triangles);
const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
const [nx, ny, nz] = manifest.volume.dimensions;
let boundaryMatches = 0;
for (const point of surface.points) {
  point.forEach((v, axis) => { bounds[0][axis] = Math.min(bounds[0][axis], v); bounds[1][axis] = Math.max(bounds[1][axis], v); });
  const voxel = assertInVolume(manifest.volume, point).map(Math.round);
  let foundLabel = false, foundBackground = false;
  for (let z = voxel[2] - 1; z <= voxel[2] + 1; z++) for (let y = voxel[1] - 1; y <= voxel[1] + 1; y++) for (let x = voxel[0] - 1; x <= voxel[0] + 1; x++) {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
    const value = mask[x + nx * (y + ny * z)];
    foundLabel ||= value === manifest.surface.segmentationLabel;
    foundBackground ||= value === manifest.mask.background;
  }
  if (foundLabel && foundBackground) boundaryMatches++;
}
close(bounds[0], manifest.surface.bounds[0]);
close(bounds[1], manifest.surface.bounds[1]);
assert.equal(boundaryMatches, surface.points.length, 'Every surface vertex must lie within one mask voxel of its source boundary');
console.log(`Ear microCT: ${manifest.volume.dimensions.join(' × ')} acquired voxels; ${foreground.toLocaleString('en-US')} mask voxels; ${surface.points.length.toLocaleString('en-US')} GLB vertices coincide with the original mask boundary.`);
console.log(sourceOnly ? 'Source assets verified. Published copies intentionally not checked (--source-only).' : 'Both published datasets are exact byte-for-byte copies of the verified source assets.');
