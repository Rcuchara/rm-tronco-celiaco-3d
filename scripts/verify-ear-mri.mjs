import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { directionVectors, voxelToWorld, worldToVoxel } from '../src/ear-math.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'assets', 'ear', 'mri');
const publishedDir = join(root, 'site', 'oido', 'data', 'mri');
const manifestBytes = await readFile(join(sourceDir, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.modality, 'MR', 'Only the genuine MRI dataset may be published here');
assert.equal(manifest.source.patient_id, 'VS-SEG-023');
assert.equal(manifest.source.series_instance_uid, '1.3.6.1.4.1.14519.5.2.1.239006515845888908570518896552813145905');
assert.equal(manifest.source.license, 'CC BY 4.0');
assert.deepEqual(manifest.source_resolution.dimensions, [448, 448, 80]);
assert.equal(manifest.display_resolution.resampled, false);
assert.match(manifest.processing.planeReader, /OpenSlide ImageSlide.read_region/);
const volume = manifest.volume;
assert.equal(volume.dtype, 'uint8');
assert.equal(volume.encoding, 'gzip');
assert.equal(volume.order, 'x-fastest');
assert.ok(volume.dimensions.every(n => Number.isInteger(n) && n > 0));
assert.deepEqual(volume.spacing, [0.46875, 0.46875, 1], 'Keep the actual CISS acquisition spacing');
assert.equal(volume.dimensions.length, 3);
assert.ok(volume.origin.every(Number.isFinite));
const directions = directionVectors(volume);
for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
  assert.ok(Math.abs(directions[a].reduce((sum, v, i) => sum + v * directions[b][i], 0) - (a === b ? 1 : 0)) < 1e-5);
}
assert.ok(/^[\w.-]+\.gz$/.test(volume.file), 'Volume must be a local prepared asset');
const compressed = await readFile(join(sourceDir, volume.file));
const pixels = gunzipSync(compressed);
assert.equal(pixels.length, volume.dimensions.reduce((a, b) => a * b, 1));
assert.ok(new Set(pixels).size > 100, 'MRI must retain a nonempty grayscale signal');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(compressed), volume.sha256Compressed);
assert.equal(hash(pixels), volume.sha256Raw);
const close = (actual, expected, tolerance = 1e-5) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < tolerance));
assert.equal(manifest.source_slices.length, volume.dimensions[2]);
assert.equal(new Set(manifest.source_slices.map(p => p.SOPInstanceUID)).size, volume.dimensions[2]);
manifest.source_slices.forEach((plane, k) => {
  assert.equal(plane.index, k);
  assert.equal(manifest.sourceOriginalSliceNumbers[k], plane.InstanceNumber);
  close(plane.position_ras, plane.ImagePositionPatient.map((v, a) => a < 2 ? -v : v));
  const cropOrigin = plane.position_ras.map((v, a) => v + directions[0][a] * volume.spacing[0] * volume.sourceIndexOffset[0] + directions[1][a] * volume.spacing[1] * volume.sourceIndexOffset[1]);
  close(cropOrigin, voxelToWorld(volume, [0, 0, k]));
});
for (const ref of manifest.landmarks || manifest.references || []) {
  const point = ref.positionRAS || ref.position_mm || ref.position;
  assert.ok(Array.isArray(point) && point.length === 3 && point.every(Number.isFinite));
  const ijk = worldToVoxel(volume, point);
  assert.ok(ijk.every((value, axis) => value >= -0.5 && value <= volume.dimensions[axis] - 0.5), `Reference ${ref.name} must belong to this crop`);
  voxelToWorld(volume, ijk).forEach((value, i) => assert.ok(Math.abs(value - point[i]) < 1e-4));
}
const contours = JSON.parse(await readFile(join(sourceDir, manifest.contours.file)));
assert.ok(contours.some(c => c.source_name === 'Cochlea'));
for (const contour of contours) for (const path of contour.paths) {
  const sourceSlice = manifest.source_slices[path.sliceIndex];
  assert.ok(sourceSlice, 'Contour must reference an acquired slice in the crop');
  assert.ok(path.referencedSOPInstanceUIDs.includes(sourceSlice.SOPInstanceUID), 'Contour source must be the exact MRI instance');
  for (const point of path.points) {
    const ijk = worldToVoxel(volume, point);
    assert.ok(Math.abs(ijk[2] - path.sliceIndex) < 1e-5, 'Contour must lie on its physical MRI plane');
    assert.ok(ijk.every((v, a) => v >= -0.5 && v <= volume.dimensions[a] - 0.5), 'Contour must stay inside the prepared field');
  }
}
for (const [file, expected] of Object.entries(manifest.files)) {
  assert.ok(/^[\w.-]+$/.test(file));
  const actual = await readFile(join(sourceDir, file));
  assert.equal(actual.length, expected.bytes);
  assert.equal(hash(actual), expected.sha256);
  assert.equal(hash(await readFile(join(publishedDir, file))), expected.sha256);
}
assert.deepEqual(await readFile(join(publishedDir, 'manifest.json')), manifestBytes);
assert.equal(hash(await readFile(join(publishedDir, volume.file))), hash(compressed));
assert.deepEqual(await readdir(join(root, 'site', 'oido', 'data')), ['mri', 'reference'], 'MRI and ex vivo reference remain separate datasets');
const html = await readFile(join(root, 'site', 'oido', 'index.html'), 'utf8');
assert.ok(!html.includes('__EAR_MRI_') && !html.includes('file:///'));
for (const id of ['stage', 'selected-canvas', 'slice-range', 'radius-range', 'opacity-range', 'spacing-range', 'reference-list']) {
  assert.ok(html.includes(`id="${id}"`), `Missing viewer control: ${id}`);
}
assert.ok(html.includes('mri_oido'));
console.log(`Auditory MRI: ${volume.dimensions.join(' × ')} voxels, physical geometry, reference positions, grayscale signal and published bytes verified.`);
