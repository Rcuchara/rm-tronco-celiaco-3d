import { build } from 'esbuild';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const data = await readFile(join(root, 'data', 'study_data.json'), 'utf8');
const template = await readFile(join(root, 'src', 'template.html'), 'utf8');
const result = await build({
  entryPoints: [join(root, 'src', 'viewer.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  write: false,
});
const bundle = result.outputFiles[0].text;
const study = JSON.parse(data);
if (study.planes.length !== 21 || study.splenic_guide.length < 2) {
  throw new Error('Study data is missing the expected planes or splenic guide.');
}
if (/<\/script/i.test(data) || /<\/script/i.test(bundle)) {
  throw new Error('Embedded content contains a closing script tag.');
}
const html = template
  .replace('__STUDY_DATA__', () => data)
  .replace('__VIEWER_BUNDLE__', () => bundle);
if (html.includes('__STUDY_DATA__') || html.includes('__VIEWER_BUNDLE__')) {
  throw new Error('Unreplaced template placeholder.');
}
await mkdir(site, { recursive: true });
await writeFile(join(site, 'index.html'), html, 'utf8');
for (const name of ['RM_tronco_celiaco_anotada.png', 'RM_tronco_celiaco_3D_vista.png']) {
  await copyFile(join(root, 'assets', name), join(site, name));
}
console.log(`Built ${join(site, 'index.html')} (${Buffer.byteLength(html)} bytes)`);

const earResult = await build({ entryPoints: [join(root, 'src', 'ear-mri-viewer.js')], bundle: true, minify: true, format: 'iife', platform: 'browser', write: false });
const earTemplate = await readFile(join(root, 'src', 'ear-mri-template.html'), 'utf8');
const earCss = await readFile(join(root, 'src', 'ear-mri.css'), 'utf8');
const pages = [
  { path: 'oido', celiacUrl: '../', earUrl: './', config: {
    anatomy: 'ear', title: 'Oído', defaultDataset: 'mri', datasets: [
      { id: 'mri', label: 'RM · CISS 3D', modality: 'MR', modalityLabel: 'RM', manifest: './data/mri/manifest.json', context: 'Paciente VS-SEG-023 · imágenes clínicas y contornos originales.' },
      { id: 'reference', label: 'Micro-TC · referencia ex vivo', modality: 'microCT', modalityLabel: 'Micro-TC', manifest: './data/reference/manifest.json', context: 'Espécimen F01 · referencia ex vivo. Es una muestra distinta del paciente de RM.', defaultRepresentation: 'combined', defaultRadius: 0 },
    ] }, assets: [['ear/mri','mri'], ['ear/reference','reference']] },
  { path: 'celiaco/tc', celiacUrl: '../../', earUrl: '../../oido/', config: {
    anatomy: 'celiac', title: 'Tronco celíaco', defaultDataset: 'ct', datasets: [
      { id: 'mri', label: 'RM · sustracción T1 postcontraste', href: '../../' },
      { id: 'ct', label: 'TC · arterial de cortes finos', modality: 'CT', modalityLabel: 'TC', manifest: './data/ct/manifest.json', context: 'Paciente C3L-02112 · caso diferente de la RM C3L-03129. TC clínica convencional; no es conteo de fotones.', defaultRepresentation: 'mip', defaultRadius: 15, defaultView: 'axial', defaultOpacity: 100 },
    ] }, assets: [['celiac/ct','ct']] },
];
for (const page of pages) {
  const serialized = JSON.stringify(page.config).replace(/</g, '\\u003c');
  const html = earTemplate.replaceAll('__PAGE_TITLE__', page.config.title).replace('__CELIAC_URL__', page.celiacUrl).replace('__EAR_URL__', page.earUrl).replace('__VIEWER_CONFIG__', () => serialized).replace('__EAR_MRI_CSS__', () => earCss).replace('__EAR_MRI_BUNDLE__', () => earResult.outputFiles[0].text);
  if (/__(?:PAGE_TITLE|CELIAC_URL|EAR_URL|VIEWER_CONFIG|EAR_MRI_CSS|EAR_MRI_BUNDLE)__/.test(html)) throw new Error('Unreplaced volume viewer template placeholder.');
  await mkdir(join(site, page.path), { recursive: true });
  await writeFile(join(site, page.path, 'index.html'), html, 'utf8');
  for (const [source, destination] of page.assets) await cp(join(root, 'assets', source), join(site, page.path, 'data', destination), { recursive: true });
  console.log(`Built ${page.config.title}: ${join(site, page.path, 'index.html')}`);
}
