import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'site', 'index.html'), 'utf8');
const match = html.match(/<script type="application\/json" id="study-data">([\s\S]*?)<\/script>/);
assert.ok(match, 'Embedded study JSON is missing');
const study = JSON.parse(match[1]);
assert.equal(study.planes.length, 21);
assert.equal(study.references.find(ref => ref.name === 'Arteria esplénica')?.column, 190);
assert.ok(study.splenic_guide.length >= 2);
assert.ok(html.includes('Ver DICOM en IDC'));
assert.ok(html.includes('RM_tronco_celiaco_anotada.png'));
assert.ok(!html.includes('RM_CPTAC-PDA_C3L-03129_DICOM.zip'));
assert.ok(!html.includes('file:///'));
assert.ok(!html.includes('__STUDY_DATA__') && !html.includes('__VIEWER_BUNDLE__'));
for (const image of ['RM_tronco_celiaco_anotada.png', 'RM_tronco_celiaco_3D_vista.png']) {
  assert.ok((await stat(join(root, 'site', image))).size > 100_000);
}
console.log('Published site data, references, links and images: OK');
