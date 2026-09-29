// Physical coordinates are millimetres in RAS: right, anterior, superior.
export function directionVectors(volume) {
  const d = volume.directions || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return Array.isArray(d[0]) ? d : [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)];
}

export function voxelToWorld(volume, ijk) {
  const d = directionVectors(volume);
  return [0, 1, 2].map(axis => volume.origin[axis] + ijk.reduce((sum, index, j) => sum + index * volume.spacing[j] * d[j][axis], 0));
}

export function worldToVoxel(volume, point) {
  // Orthonormal direction cosines are checked during data preparation.
  const delta = point.map((v, i) => v - volume.origin[i]);
  return directionVectors(volume).map((d, i) => d.reduce((sum, value, j) => sum + value * delta[j], 0) / volume.spacing[i]);
}

export function sliceLayout(dimensions, axis) {
  const axes = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  return { axes, width: dimensions[axes[0]], height: dimensions[axes[1]] };
}

export function slicePixels(data, dimensions, axis, index, contrast = 1) {
  const { axes, width, height } = sliceLayout(dimensions, axis);
  if (!Number.isInteger(index) || index < 0 || index >= dimensions[axis]) throw new RangeError('Corte fuera del volumen.');
  if (data.length !== dimensions.reduce((a, b) => a * b, 1)) throw new RangeError('Tamaño de volumen incorrecto.');
  const pixels = new Uint8ClampedArray(width * height * 4);
  const xyz = [0, 0, 0]; xyz[axis] = index;
  for (let v = 0; v < height; v++) {
    xyz[axes[1]] = v;
    for (let u = 0; u < width; u++) {
      xyz[axes[0]] = u;
      const value = Math.max(0, Math.min(255, (data[xyz[0] + dimensions[0] * (xyz[1] + dimensions[1] * xyz[2])] - 128) * contrast + 128));
      const p = 4 * (u + width * v);
      pixels[p] = pixels[p + 1] = pixels[p + 2] = value;
      pixels[p + 3] = 255;
    }
  }
  return { pixels, width, height };
}

export function fitDistance(radius, aspect, verticalFovDegrees, padding = 1.14) {
  const halfVertical = verticalFovDegrees * Math.PI / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  return padding * radius / Math.sin(Math.min(halfVertical, halfHorizontal));
}

export function flipSliceRows(pixels, width, height) {
  if (pixels.length !== width * height * 4) throw new RangeError('Dimensiones de imagen incorrectas.');
  const flipped = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) flipped.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  return flipped;
}

export function fitBoxDistance(min, max, direction, up, aspect, fov, padding = 1.12) {
  const norm = v => { const length = Math.hypot(...v); return v.map(x => x / length); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const z = norm(direction), x = norm(cross(up, z)), y = norm(cross(z, x));
  const tanY = Math.tan(fov * Math.PI / 360), tanX = tanY * aspect;
  let distance = 0;
  for (let bits = 0; bits < 8; bits++) {
    const offset = min.map((lo, i) => (bits & (1 << i) ? max[i] : lo) - (lo + max[i]) / 2);
    distance = Math.max(distance, Math.abs(dot(offset, x)) * padding / tanX + dot(offset, z), Math.abs(dot(offset, y)) * padding / tanY + dot(offset, z));
  }
  return distance;
}

export function axisName(vector) {
  const abs = vector.map(Math.abs);
  const dominant = abs.indexOf(Math.max(...abs));
  return [['L', 'R'], ['P', 'A'], ['I', 'S']][dominant][vector[dominant] >= 0 ? 1 : 0];
}

export function sliceName(volume, axis) {
  const vector = directionVectors(volume)[axis];
  const dominant = vector.map(Math.abs).indexOf(Math.max(...vector.map(Math.abs)));
  const aligned = Math.abs(vector[dominant]) > 0.999;
  return `${['Sagital', 'Coronal', 'Axial'][dominant]}${aligned ? '' : ' oblicuo'} · ${['I', 'J', 'K'][axis]}`;
}
