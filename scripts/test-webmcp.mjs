import assert from 'node:assert/strict';
import test from 'node:test';
import { createViewerTools, installViewerTools } from '../src/webmcp.js';

const study = {
  case: 'C3L-03129', source: 'CPTAC-PDA / NCI Imaging Data Commons',
  study_uid: '1.2.3', series_uid: '1.2.3.4',
  pixel_spacing_mm: [1.25, 1.25], slice_thickness_mm: 2.5,
  planes: Array.from({ length: 21 }, (_, position) => ({
    index: 44 + position, z_mm: 100 - position * 2.5,
    opaque: 'data:image/png;base64,OPAQUE_IMAGE',
    highlight: 'data:image/png;base64,HIGHLIGHT_IMAGE',
  })),
  references: [
    { name: 'Aorta', slice_index: 56, color: '#ffffff' },
    { name: 'Arteria esplénica', slice_index: 54, color: '#f7c568' },
  ],
};

function createFixture() {
  const defaults = {
    slice: 54, radius: 20, opacity: 72, spacing: 1,
    mode: 'vessels', view: 'oblique', references: true,
    focused_reference: null,
  };
  let state = { ...defaults };
  let position = 10;
  const mutations = [];
  const reports = [];
  const getState = () => ({ ...state });
  const tools = createViewerTools({
    study, getState,
    applySettings(settings) {
      mutations.push({ kind: 'settings', settings: { ...settings } });
      if ('slice' in settings) position = study.planes.findIndex(p => p.index === settings.slice);
      state = { ...state, ...settings, focused_reference: null };
    },
    focusReference(reference) {
      mutations.push({ kind: 'focus', reference });
      const mark = study.references.find(ref => ref.name === reference);
      position = study.planes.findIndex(p => p.index === mark.slice_index);
      state = { ...state, slice: mark.slice_index, radius: 0, mode: 'anatomy', view: 'axial', references: true, focused_reference: reference };
    },
    reset() {
      mutations.push({ kind: 'reset' });
      state = { ...defaults };
      position = study.planes.findIndex(p => p.index === defaults.slice);
    },
    reportAction(title, result) { reports.push({ title, state: { ...result } }); },
  });
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
  return {
    tools, byName, mutations, reports, getState,
    getPosition: () => position,
    execute: async (name, args) => JSON.parse(await byName[name].execute(args)),
  };
}

function contextMock({ failAt = Infinity, sync = false } = {}) {
  const calls = [];
  const active = new Map();
  const context = {
    registerTool(tool, { signal }) {
      calls.push({ tool, signal });
      if (calls.length === failAt) return Promise.reject(new Error('Simulated registration failure'));
      assert.equal(signal.aborted, false);
      assert.equal(active.has(tool.name), false, `Duplicate registration: ${tool.name}`);
      active.set(tool.name, tool);
      signal.addEventListener('abort', () => active.delete(tool.name), { once: true });
      return sync ? undefined : Promise.resolve();
    },
  };
  return { context, calls, active };
}

const flushEvents = () => new Promise(resolve => setImmediate(resolve));

test('context exposes current state, original slice numbers and provenance without images', async () => {
  const f = createFixture();
  const raw = await f.byName.rm_obtener_contexto.execute({});
  assert.equal(typeof raw, 'string');
  assert.doesNotMatch(raw, /base64|OPAQUE_IMAGE|HIGHLIGHT_IMAGE|"opaque"|"highlight"/);
  const result = JSON.parse(raw);
  assert.deepEqual(result.state, f.getState());
  assert.deepEqual(result.study.planes.map(p => p.index), Array.from({ length: 21 }, (_, i) => 44 + i));
  assert.deepEqual(result.controls.slice.enum, result.study.planes.map(p => p.index));
  assert.equal(result.study.references[1].placement, 'manual');
  assert.equal(result.study.image_license, 'CC BY 4.0');
  assert.match(result.limitations, /manuales/);
  assert.match(result.study.dicom_url, /StudyInstanceUIDs=1\.2\.3/);
  assert.equal(f.mutations.length, 0);
  assert.equal(f.reports.length, 0);
  assert.equal(f.byName.rm_obtener_contexto.annotations.readOnlyHint, true);
});

test('valid combined adjustments return applied state and report one visible action', async () => {
  const f = createFixture();
  const settings = { slice: 64, mode: 'anatomy', view: 'coronal', radius: 0, opacity: 10, spacing: 2.3, references: false };
  const result = await f.execute('rm_ajustar_vista', settings);
  assert.deepEqual(result.state, { ...settings, focused_reference: null });
  assert.deepEqual(result.state, f.getState());
  assert.equal(f.getPosition(), 20);
  assert.equal(f.mutations.length, 1);
  assert.equal(f.reports.length, 1);
  assert.deepEqual(f.reports[0].state, result.state);
  assert.equal(f.byName.rm_ajustar_vista.annotations.readOnlyHint, false);
});

test('original slices 44 and 64 map to positions 0 and 20', async () => {
  const f = createFixture();
  for (const [slice, position] of [[44, 0], [54, 10], [64, 20]]) {
    const result = await f.execute('rm_ajustar_vista', { slice });
    assert.equal(result.state.slice, slice);
    assert.equal(f.getPosition(), position);
  }
  for (const slice of [0, 10, 20, 43, 65]) {
    const before = f.getState();
    await assert.rejects(f.byName.rm_ajustar_vista.execute({ slice }));
    assert.deepEqual(f.getState(), before);
  }
});

test('focus and reset return actual state and preserve the metadata contract', async () => {
  const f = createFixture();
  const initial = f.getState();
  const focused = await f.execute('rm_enfocar_referencia', { reference: 'Aorta' });
  assert.equal(focused.state.slice, 56);
  assert.equal(f.getPosition(), 12);
  assert.equal(focused.state.focused_reference, 'Aorta');
  assert.equal(focused.state.mode, 'anatomy');
  assert.equal(focused.state.radius, 0);
  assert.equal(focused.state.references, true);
  const restored = await f.execute('rm_restaurar_vista', {});
  assert.deepEqual(restored.state, initial);
  assert.equal(f.getPosition(), 10);
  assert.equal(f.reports.length, 2);
  assert.equal(f.byName.rm_restaurar_vista.annotations.readOnlyHint, false);
});

test('invalid settings reject before any partial mutation or action report', async t => {
  const invalidCases = [
    ['slice as text', { slice: '54' }], ['fractional slice', { slice: 54.5 }],
    ['unknown mode', { mode: 'segmentation' }], ['unknown view', { view: 'sagittal' }],
    ['negative radius', { radius: -1 }], ['large radius', { radius: 21 }],
    ['fractional radius', { radius: 0.5 }], ['opacity too low', { opacity: 9 }],
    ['opacity too high', { opacity: 101 }], ['fractional opacity', { opacity: 72.5 }],
    ['opacity as text', { opacity: '72' }], ['NaN opacity', { opacity: NaN }],
    ['infinite opacity', { opacity: Infinity }], ['spacing too low', { spacing: 0.9 }],
    ['spacing too high', { spacing: 3.1 }], ['invalid spacing step', { spacing: 1.05 }],
    ['NaN spacing', { spacing: NaN }], ['infinite spacing', { spacing: Infinity }],
    ['boolean as text', { references: 'true' }], ['boolean as number', { references: 1 }],
    ['unexpected key', { unknown: 'value' }], ['explicit undefined', { opacity: undefined }],
    ['valid change before invalid value', { slice: 64, opacity: 0 }],
    ['valid change before unexpected key', { slice: 44, code: 'unsafe' }],
  ];
  for (const [name, input] of invalidCases) {
    await t.test(name, async () => {
      const f = createFixture();
      const before = f.getState();
      await assert.rejects(f.byName.rm_ajustar_vista.execute(input), Error);
      assert.deepEqual(f.getState(), before);
      assert.equal(f.mutations.length, 0);
      assert.equal(f.reports.length, 0);
    });
  }
});

test('settings support declared boundary values and decimal increments', async () => {
  const f = createFixture();
  for (const input of [
    { radius: 0, opacity: 10, spacing: 1 },
    { radius: 20, opacity: 100, spacing: 3 },
    { spacing: 1.1 }, { spacing: 2.3 },
  ]) {
    const result = await f.execute('rm_ajustar_vista', input);
    for (const [key, value] of Object.entries(input)) assert.equal(result.state[key], value);
  }
});

test('empty, missing and malformed inputs follow each tool schema', async () => {
  const f = createFixture();
  await f.execute('rm_obtener_contexto', {});
  await f.execute('rm_restaurar_vista', {});
  for (const tool of f.tools) {
    for (const input of [undefined, null, [], '', 0, true]) {
      await assert.rejects(tool.execute(input));
    }
    await assert.rejects(tool.execute({ unexpected: true }));
  }
  await assert.rejects(f.byName.rm_ajustar_vista.execute({}));
  await assert.rejects(f.byName.rm_enfocar_referencia.execute({}));
  await assert.rejects(f.byName.rm_enfocar_referencia.execute({ reference: 'Tumor' }));
  await assert.rejects(f.byName.rm_enfocar_referencia.execute({ reference: 54 }));
  assert.equal(f.mutations.length, 1, 'Only the valid reset may change state');
});

test('modern document API takes precedence and cleans up all registrations', async () => {
  const f = createFixture();
  const modern = contextMock();
  const legacy = contextMock({ sync: true });
  const statuses = [];
  const installation = installViewerTools({
    tools: f.tools, document: { modelContext: modern.context }, navigator: { modelContext: legacy.context },
    lifecycle: new EventTarget(), onStatus: status => statuses.push(status),
  });
  await installation.ready;
  assert.equal(modern.calls.length, 4);
  assert.equal(modern.active.size, 4);
  assert.equal(legacy.calls.length, 0);
  assert.deepEqual(statuses, ['connecting', 'ready']);
  assert.equal(new Set(modern.calls.map(call => call.signal)).size, 1);
  installation.dispose();
  assert.equal(modern.active.size, 0);
  assert.ok(modern.calls.every(call => call.signal.aborted));
});

test('legacy navigator API is supported including synchronous registration', async () => {
  const legacy = contextMock({ sync: true });
  const statuses = [];
  const installation = installViewerTools({
    tools: createFixture().tools, document: { modelContext: {} }, navigator: { modelContext: legacy.context },
    lifecycle: new EventTarget(), onStatus: status => statuses.push(status),
  });
  await installation.ready;
  assert.equal(legacy.active.size, 4);
  assert.deepEqual(statuses, ['connecting', 'ready']);
  installation.dispose();
  assert.equal(legacy.active.size, 0);
});

test('missing API is a nonfatal unavailable state and remains retryable', async () => {
  const doc = {};
  const statuses = [];
  const installation = installViewerTools({
    tools: createFixture().tools, document: doc, navigator: {}, lifecycle: new EventTarget(),
    onStatus: status => statuses.push(status),
  });
  await installation.ready;
  assert.deepEqual(statuses, ['unavailable']);
  const modern = contextMock();
  doc.modelContext = modern.context;
  await installation.refresh();
  assert.equal(modern.active.size, 4);
  assert.deepEqual(statuses, ['unavailable', 'connecting', 'ready']);
  installation.dispose();
});

test('asynchronous registration failure aborts partial registrations and can recover', async t => {
  const warning = t.mock.method(console, 'warn', () => {});
  const failed = contextMock({ failAt: 2 });
  const doc = { modelContext: failed.context };
  const statuses = [];
  const installation = installViewerTools({
    tools: createFixture().tools, document: doc, navigator: {}, lifecycle: new EventTarget(),
    onStatus: status => statuses.push(status),
  });
  await installation.ready;
  assert.equal(failed.calls.length, 2);
  assert.equal(failed.active.size, 0);
  assert.ok(failed.calls.every(call => call.signal.aborted));
  assert.deepEqual(statuses, ['connecting', 'error']);
  assert.equal(warning.mock.callCount(), 1);
  const recovered = contextMock();
  doc.modelContext = recovered.context;
  await installation.refresh();
  assert.equal(recovered.active.size, 4);
  assert.equal(statuses.at(-1), 'ready');
  installation.dispose();
});

test('page lifecycle and refresh avoid duplicates; dispose removes event hooks', async () => {
  const modern = contextMock();
  const lifecycle = new EventTarget();
  const installation = installViewerTools({
    tools: createFixture().tools, document: { modelContext: modern.context }, navigator: {}, lifecycle,
  });
  await installation.ready;
  lifecycle.dispatchEvent(new Event('pageshow'));
  await flushEvents();
  assert.equal(modern.calls.length, 4);
  lifecycle.dispatchEvent(new Event('pagehide'));
  assert.equal(modern.active.size, 0);
  lifecycle.dispatchEvent(new Event('pageshow'));
  lifecycle.dispatchEvent(new Event('pageshow'));
  await flushEvents();
  assert.equal(modern.calls.length, 8);
  assert.equal(modern.active.size, 4);
  await installation.refresh();
  assert.equal(modern.calls.length, 12);
  assert.equal(modern.active.size, 4);
  installation.dispose();
  installation.dispose();
  lifecycle.dispatchEvent(new Event('pagehide'));
  lifecycle.dispatchEvent(new Event('pageshow'));
  await installation.refresh();
  await flushEvents();
  assert.equal(modern.calls.length, 12);
  assert.equal(modern.active.size, 0);
});

test('hiding the page during registration cannot leave stale tools or status', async () => {
  const modern = contextMock();
  const lifecycle = new EventTarget();
  let resolvePending;
  const firstResult = new Promise(resolve => { resolvePending = resolve; });
  const originalRegister = modern.context.registerTool;
  modern.context.registerTool = (tool, options) => {
    const result = originalRegister(tool, options);
    return modern.calls.length === 1 ? firstResult : result;
  };
  const statuses = [];
  const installation = installViewerTools({
    tools: createFixture().tools, document: { modelContext: modern.context }, navigator: {}, lifecycle,
    onStatus: status => statuses.push(status),
  });
  assert.equal(modern.active.size, 1);
  lifecycle.dispatchEvent(new Event('pagehide'));
  assert.equal(modern.active.size, 0);
  lifecycle.dispatchEvent(new Event('pageshow'));
  await flushEvents();
  assert.equal(modern.active.size, 4);
  resolvePending();
  await installation.ready;
  assert.equal(modern.calls.length, 5);
  assert.equal(modern.active.size, 4);
  assert.deepEqual(statuses, ['connecting', 'connecting', 'ready']);
  installation.dispose();
});
