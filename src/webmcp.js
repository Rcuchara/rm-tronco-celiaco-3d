// Small, explicit tools for the viewer. No arbitrary code or URLs are accepted.
const LIMITATIONS = 'Uso educativo. Las referencias y la guía esplénica son manuales; la señal vascular es un realce de intensidad, no una segmentación validada ni una valoración de invasión vascular.';

function objectSchema(properties = {}, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function validate(input, schema) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Los parámetros deben ser un objeto.');
  }
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(schema.properties, key)) throw new Error(`Parámetro desconocido: ${key}`);
  }
  for (const key of schema.required) {
    if (!Object.hasOwn(input, key)) throw new Error(`Falta el parámetro: ${key}`);
  }
  if (schema.minProperties && Object.keys(input).length < schema.minProperties) {
    throw new Error('Indica al menos un ajuste.');
  }
  for (const [key, value] of Object.entries(input)) {
    const rule = schema.properties[key];
    if (rule.type === 'integer' ? !Number.isInteger(value) : typeof value !== rule.type) {
      throw new Error(`Tipo incorrecto para ${key}.`);
    }
    if (typeof value === 'number' && (!Number.isFinite(value) || value < rule.minimum || value > rule.maximum)) {
      throw new Error(`${key} debe estar entre ${rule.minimum} y ${rule.maximum}.`);
    }
    if (rule.multipleOf && Math.abs(value / rule.multipleOf - Math.round(value / rule.multipleOf)) > 1e-8) {
      throw new Error(`${key} requiere incrementos de ${rule.multipleOf}.`);
    }
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`Valor no permitido para ${key}.`);
  }
}

export function createViewerTools({ study, getState, applySettings, focusReference, reset, reportAction = () => {} }) {
  const settingsSchema = objectSchema({
    slice: { type: 'integer', enum: study.planes.map(p => p.index), description: 'Número original del corte, no su posición en la lista.' },
    mode: { type: 'string', enum: ['vessels', 'anatomy'], description: 'vessels: resalte vascular; anatomy: cortes anatómicos.' },
    view: { type: 'string', enum: ['oblique', 'axial', 'coronal'], description: 'Orientación de la cámara; no reconstruye planos nuevos.' },
    radius: { type: 'integer', minimum: 0, maximum: study.planes.length - 1, description: 'Número de cortes vecinos por lado; 0 muestra un solo corte.' },
    opacity: { type: 'integer', minimum: 10, maximum: 100, description: 'Opacidad del control en porcentaje.' },
    spacing: { type: 'number', minimum: 1, maximum: 3, multipleOf: 0.1, description: 'Separación visual: 1 respeta las distancias DICOM.' },
    references: { type: 'boolean', description: 'Mostrar las referencias anatómicas manuales.' },
  });
  settingsSchema.minProperties = 1;
  const snapshot = () => ({ state: getState(), limitations: LIMITATIONS });
  const tool = (name, title, description, inputSchema, readOnlyHint, action) => ({
    name, title, description, inputSchema,
    annotations: { readOnlyHint, untrustedContentHint: true },
    execute: async (input) => {
      validate(input, inputSchema);
      const result = action(input);
      if (!readOnlyHint) reportAction(title, getState());
      // A JSON string works with both the native API and existing agent bridges.
      return JSON.stringify(result);
    },
  });
  return [
    tool('rm_obtener_contexto', 'Consultar estudio y vista de RM',
      'Consulta los cortes disponibles, referencias manuales, procedencia y estado actual del visor. No devuelve imágenes ni identifica hallazgos clínicos.',
      objectSchema(), true, () => ({
        ...snapshot(),
        study: {
          case: study.case, source: study.source, series: 'Sustracción T1 postcontraste',
          pixel_spacing_mm: study.pixel_spacing_mm, slice_thickness_mm: study.slice_thickness_mm,
          planes: study.planes.map(({ index, z_mm }) => ({ index, z_mm })),
          references: study.references.map(({ name, slice_index, color }) => ({ name, slice_index, color, placement: 'manual' })),
          image_license: 'CC BY 4.0',
          dataset_url: 'https://doi.org/10.7937/K9/TCIA.2018.SC20FO18',
          dicom_url: `https://viewer.imaging.datacommons.cancer.gov/v3/viewer/?StudyInstanceUIDs=${study.study_uid}&initialSeriesInstanceUID=${study.series_uid}`,
        },
        controls: settingsSchema.properties,
      })),
    tool('rm_ajustar_vista', 'Ajustar vista de RM',
      'Cambia uno o varios controles visibles del visor. Usa números de corte originales (44 a 64). Valida todos los ajustes antes de aplicarlos. No modifica las imágenes originales.',
      settingsSchema, false, settings => { applySettings(settings); return snapshot(); }),
    tool('rm_enfocar_referencia', 'Enfocar referencia anatómica',
      'Centra la cámara en una marca anatómica manual existente, selecciona su corte y muestra ese corte en vista axial anatómica con referencias. No detecta ni segmenta vasos.',
      objectSchema({ reference: { type: 'string', enum: study.references.map(r => r.name) } }, ['reference']),
      false, ({ reference }) => { focusReference(reference); return snapshot(); }),
    tool('rm_restaurar_vista', 'Restaurar vista inicial',
      'Restablece el corte inicial, todos los cortes visibles, señal vascular, opacidad, separación, referencias y cámara oblicua.',
      objectSchema(), false, () => { reset(); return snapshot(); }),
  ];
}

export function installViewerTools({ tools, document: doc = globalThis.document, navigator: nav = globalThis.navigator, lifecycle = globalThis.window, onStatus = () => {} }) {
  let registration = null;
  let disposed = false;
  function stop() {
    registration?.abort();
    registration = null;
  }
  async function start() {
    if (disposed || registration) return;
    const context = [doc?.modelContext, nav?.modelContext].find(candidate => typeof candidate?.registerTool === 'function');
    if (!context) { onStatus('unavailable'); return; }
    const controller = new AbortController();
    registration = controller;
    onStatus('connecting');
    try {
      for (const tool of tools) {
        if (controller.signal.aborted) return;
        await context.registerTool(tool, { signal: controller.signal });
      }
      if (!controller.signal.aborted) onStatus('ready');
    } catch (error) {
      controller.abort();
      if (registration === controller) {
        registration = null;
        onStatus('error');
        console.warn('No se pudo activar WebMCP en el visor.', error);
      }
    }
  }
  lifecycle.addEventListener('pagehide', stop);
  lifecycle.addEventListener('pageshow', start);
  return {
    ready: start(),
    refresh: () => { stop(); return start(); },
    dispose: () => {
      disposed = true;
      stop();
      lifecycle.removeEventListener('pagehide', stop);
      lifecycle.removeEventListener('pageshow', start);
    },
  };
}
