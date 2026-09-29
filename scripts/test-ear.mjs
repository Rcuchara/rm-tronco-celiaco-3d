import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import * as math from '../src/ear-math.js';

const close = (actual, expected, tolerance = 1e-9) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= tolerance, `${value} != ${expected[i]} at ${i}`));
};
const volume = {
  dimensions: [3, 4, 5], spacing: [0.2, 0.5, 1.2], origin: [-50, 100, -30],
  directions: [[0, -1, 0], [0, 0, 1], [1, 0, 0]],
};

test('anisotropic voxel coordinates use direction columns and a millimetre origin', () => {
  close(math.voxelToWorld(volume, [0, 0, 0]), [-50, 100, -30]);
  close(math.voxelToWorld(volume, [2, 3, 4]), [-45.2, 99.6, -28.5]);
  close(math.worldToVoxel(volume, [-45.2, 99.6, -28.5]), [2, 3, 4]);
  close(math.voxelToWorld({ ...volume, directions: volume.directions.flat() }, [2, 3, 4]), [-45.2, 99.6, -28.5]);
});

test('world and voxel transforms round-trip fractional coordinates and reflected axes', () => {
  const transforms = [volume, { ...volume, directions: [[-1, 0, 0], [0, 1, 0], [0, 0, -1]] }];
  for (const transform of transforms) {
    for (const ijk of [[0, 0, 0], [2, 3, 4], [1.25, 2.5, 0.75], [-2, 7, 1]]) {
      close(math.worldToVoxel(transform, math.voxelToWorld(transform, ijk)), ijk);
    }
  }
  close(math.voxelToWorld(transforms[1], [2, 3, 4]), [-50.4, 101.5, -34.8]);
});

test('oblique orthonormal orientation preserves lengths and invertibility', () => {
  const c = Math.sqrt(0.5);
  const transform = { ...volume, directions: [[c, c, 0], [-c, c, 0], [0, 0, 1]] };
  const a = math.voxelToWorld(transform, [0, 0, 0]);
  const b = math.voxelToWorld(transform, [1, 1, 1]);
  assert.ok(Math.abs(Math.hypot(...b.map((v, i) => v - a[i])) - Math.hypot(...volume.spacing)) < 1e-9);
  close(math.worldToVoxel(transform, b), [1, 1, 1]);
});

const dimensions = [2, 3, 2];
// Intensity encodes 100*k + 10*j + i. An incorrect stride is immediately visible.
const voxels = Uint8Array.from([0, 1, 10, 11, 20, 21, 100, 101, 110, 111, 120, 121]);
const intensities = pixels => Array.from(pixels.filter((_, i) => i % 4 === 0));

test('all three slice axes use x-fastest voxel indexing without transposition', () => {
  for (const [axis, index, width, height, expected] of [
    [0, 1, 3, 2, [1, 11, 21, 101, 111, 121]],
    [1, 1, 2, 2, [10, 11, 110, 111]],
    [2, 1, 2, 3, [100, 101, 110, 111, 120, 121]],
  ]) {
    const slice = math.slicePixels(voxels, dimensions, axis, index);
    assert.equal(slice.width, width);
    assert.equal(slice.height, height);
    assert.deepEqual(intensities(slice.pixels), expected);
    for (let i = 0; i < slice.pixels.length; i += 4) {
      assert.equal(slice.pixels[i], slice.pixels[i + 1]);
      assert.equal(slice.pixels[i], slice.pixels[i + 2]);
      assert.equal(slice.pixels[i + 3], 255);
    }
  }
});

test('slice plane axes and millimetre extents agree under anisotropic rotated geometry', () => {
  const expected = [
    { axes: [1, 2], width: 4, height: 5, horizontalMm: 1.5, verticalMm: 4.8 },
    { axes: [0, 2], width: 3, height: 5, horizontalMm: 0.4, verticalMm: 4.8 },
    { axes: [0, 1], width: 3, height: 4, horizontalMm: 0.4, verticalMm: 1.5 },
  ];
  expected.forEach(({ axes, width, height, horizontalMm, verticalMm }, axis) => {
    assert.deepEqual(math.sliceLayout(volume.dimensions, axis), { axes, width, height });
    const corner = [0, 0, 0]; corner[axis] = 1;
    const horizontal = corner.slice(); horizontal[axes[0]] = width - 1;
    const vertical = corner.slice(); vertical[axes[1]] = height - 1;
    const p = new Vector3(...math.voxelToWorld(volume, corner));
    assert.ok(Math.abs(p.distanceTo(new Vector3(...math.voxelToWorld(volume, horizontal))) - horizontalMm) < 1e-9);
    assert.ok(Math.abs(p.distanceTo(new Vector3(...math.voxelToWorld(volume, vertical))) - verticalMm) < 1e-9);
  });
});

test('first and last slice indices are valid; fractional or outside indices are rejected', () => {
  for (let axis = 0; axis < 3; axis++) {
    math.slicePixels(voxels, dimensions, axis, 0);
    math.slicePixels(voxels, dimensions, axis, dimensions[axis] - 1);
    for (const index of [-1, dimensions[axis], 0.5, NaN]) {
      assert.throws(() => math.slicePixels(voxels, dimensions, axis, index), RangeError);
    }
  }
  assert.throws(() => math.slicePixels(voxels.subarray(1), dimensions, 0, 0), RangeError);
});

test('contrast preserves neutral midpoint and clamps intensities', () => {
  const data = Uint8Array.from([0, 64, 128, 192, 255]);
  assert.deepEqual(intensities(math.slicePixels(data, [5, 1, 1], 2, 0, 2).pixels), [0, 0, 128, 255, 255]);
  assert.deepEqual(intensities(math.slicePixels(data, [5, 1, 1], 2, 0, 0).pixels), [128, 128, 128, 128, 128]);
});

test('canvas row flip puts the positive second voxel axis at the top without mirroring left/right', () => {
  const slice = math.slicePixels(voxels, dimensions, 2, 1);
  const original = slice.pixels.slice();
  const flipped = math.flipSliceRows(slice.pixels, slice.width, slice.height);
  assert.deepEqual(intensities(flipped), [120, 121, 110, 111, 100, 101]);
  assert.deepEqual(slice.pixels, original, '3D DataTexture rows must remain unchanged');
  assert.deepEqual(math.flipSliceRows(flipped, slice.width, slice.height), original);
  assert.throws(() => math.flipSliceRows(slice.pixels, slice.width + 1, slice.height), RangeError);
});

test('patient orientation labels follow signed RAS axes', () => {
  for (const [vector, name] of [
    [[1, 0, 0], 'R'], [[-1, 0, 0], 'L'], [[0, 1, 0], 'A'],
    [[0, -1, 0], 'P'], [[0, 0, 1], 'S'], [[0, 0, -1], 'I'],
  ]) assert.equal(math.axisName(vector), name);
  assert.equal(math.sliceName(volume, 0), 'Coronal · I');
  assert.equal(math.sliceName(volume, 1), 'Axial · J');
  assert.equal(math.sliceName(volume, 2), 'Sagital · K');
});

test('camera fitting keeps a sphere inside narrow, square and wide viewports', () => {
  for (const aspect of [0.25, 0.5, 1, 2, 3]) {
    const radius = 35;
    const distance = math.fitDistance(radius, aspect, 38);
    assert.ok(Number.isFinite(distance) && distance > radius);
    const camera = new PerspectiveCamera(38, aspect, 0.01, 10000);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // Check projected actual points, not a copy of the fitting formula.
    for (let phi = 0; phi <= 40; phi++) {
      for (let theta = 0; theta < 80; theta++) {
        const p = new Vector3().setFromSphericalCoords(radius, phi * Math.PI / 40, theta * Math.PI / 40).project(camera);
        assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, `Clipped at aspect ${aspect}: ${p.toArray()}`);
      }
    }
  }
  assert.ok(math.fitDistance(35, 0.25, 38) > math.fitDistance(35, 1, 38));
  assert.equal(math.fitDistance(35, 2, 38), math.fitDistance(35, 1, 38));
});

test('box fitting projects every corner inside the requested margin for all viewer orientations', () => {
  const min = [-13.807, -87.345, -66.3904];
  const max = [-4.095, -72.4178, -50.1268];
  const target = new Vector3(...min.map((value, i) => (value + max[i]) / 2));
  const padding = 1.12;
  for (const direction of [[1, -1.6, 0.85], [0, 1, 0], [-1, 0, 0], [1, 0, 0], [0, -1e-5, 1]]) {
    for (const aspect of [0.22, 0.6, 1, 2.8]) {
      const distance = math.fitBoxDistance(min, max, direction, [0, 0, 1], aspect, 38, padding);
      assert.ok(Number.isFinite(distance) && distance > 0);
      const camera = new PerspectiveCamera(38, aspect, 0.01, 10000);
      camera.up.set(0, 0, 1);
      camera.position.copy(target).addScaledVector(new Vector3(...direction).normalize(), distance);
      camera.lookAt(target); camera.updateMatrixWorld();
      let largestProjection = 0;
      for (let bits = 0; bits < 8; bits++) {
        const p = new Vector3(...min.map((lo, i) => bits & (1 << i) ? max[i] : lo)).project(camera);
        const projectedExtent = Math.max(Math.abs(p.x), Math.abs(p.y));
        assert.ok(projectedExtent <= 1 / padding + 1e-6, `Clipping/margin failure: aspect=${aspect}, direction=${direction}, corner=${bits}`);
        assert.ok(p.z > -1 && p.z < 1, 'The fitted model must stay between the near and far planes');
        largestProjection = Math.max(largestProjection, projectedExtent);
      }
      assert.ok(largestProjection > 1 / padding - 1e-6, 'Fit must use the available viewport, not introduce excess empty space');
    }
  }
});

test('box fitting is independent of world translation and adapts to a narrow panel', () => {
  const min = [-10, -7, -3], max = [10, 7, 3];
  const shift = [123.5, -78.3, 450.9];
  const options = [[1, -1.6, 0.85], [0, 0, 1], 0.4, 38];
  const distance = math.fitBoxDistance(min, max, ...options);
  assert.ok(Math.abs(distance - math.fitBoxDistance(min.map((v, i) => v + shift[i]), max.map((v, i) => v + shift[i]), ...options)) < 1e-9);
  assert.ok(distance > math.fitBoxDistance(min, max, options[0], options[1], 2, 38));
});
