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
const earHtml = earTemplate.replace('__EAR_MRI_CSS__', () => earCss).replace('__EAR_MRI_BUNDLE__', () => earResult.outputFiles[0].text);
if (/__EAR_MRI_/.test(earHtml)) throw new Error('Unreplaced auditory MRI template placeholder.');
await mkdir(join(site, 'oido'), { recursive: true });
await writeFile(join(site, 'oido', 'index.html'), earHtml, 'utf8');
await cp(join(root, 'assets', 'ear', 'mri'), join(site, 'oido', 'data', 'mri'), { recursive: true });
console.log(`Built auditory MRI viewer: ${join(site, 'oido', 'index.html')}`);
