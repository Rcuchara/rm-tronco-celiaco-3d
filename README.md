# RM del tronco celíaco en 3D

Visor web de 21 cortes de resonancia magnética apilados para explorar el tronco celíaco y los segmentos proximales de las arterias hepática común y esplénica. La vista 3D permite girar la serie, cambiar la opacidad, seleccionar cortes y mostrar referencias anatómicas. Las marcas y la flecha esplénica fueron colocadas manualmente; son orientativas y no constituyen una segmentación vascular validada.

**Visor público:** https://rcuchara.github.io/rm-tronco-celiaco-3d/

## Datos y procedencia

- Colección pública: [CPTAC-PDA](https://portal.imaging.datacommons.cancer.gov/collections/cptac_pda/) de TCIA / NCI Imaging Data Commons.
- Cita del conjunto de datos: National Cancer Institute Clinical Proteomic Tumor Analysis Consortium (CPTAC). (2018). *The Clinical Proteomic Tumor Analysis Consortium Pancreatic Ductal Adenocarcinoma Collection (CPTAC-PDA)* (Version 15) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2018.SC20FO18
- Licencia de las imágenes de la colección: [CC BY 4.0](https://www.cancerimagingarchive.net/collection/cptac-pda/).
- Caso seudonimizado: `C3L-03129`; serie de sustracción T1 postcontraste, UID `1.3.6.1.4.1.14519.5.2.1.1078.3273.156983346663748836803923712840`.

El repositorio contiene los 21 recortes preparados para el visor en `data/study_data.json`, además de dos figuras derivadas. Los DICOM originales no se duplican aquí; se consultan en [IDC](https://viewer.imaging.datacommons.cancer.gov/v3/viewer/?StudyInstanceUIDs=1.3.6.1.4.1.14519.5.2.1.1078.3273.640735449193782945076350642934&initialSeriesInstanceUID=1.3.6.1.4.1.14519.5.2.1.1078.3273.156983346663748836803923712840).

Esta visualización es educativa. La pertenencia del caso a la cohorte procede de los metadatos de CPTAC-PDA; la imagen por sí sola no confirma la histología ni determina invasión vascular.

## Construir y publicar

Requisitos para la web: Node.js 22 o superior.

```bash
npm ci
npm run build
```

`site/index.html` queda listo para abrirse localmente o servirlo como sitio estático. Cada cambio enviado a la rama `main` ejecuta `.github/workflows/pages.yml`, que reconstruye el visor y lo publica en GitHub Pages. `site/`, `node_modules/` y `raw/` están excluidos de Git.

## Regenerar los planos desde los DICOM públicos

Solo hace falta para cambiar el procesamiento de imagen o el caso. Se requiere Python 3.11 o superior.

```bash
python -m pip install -r requirements-data.txt
python scripts/download_idc_series.py dab6e12c-fa52-4396-ab09-f9286f53f474 raw/sub_arterial
python scripts/prepare_data.py --dicom-dir raw/sub_arterial
npm run build
```

El script decodifica DICOM con `pydicom`, prepara cada imagen 2D y la lee mediante [`openslide.ImageSlide.read_region`](https://openslide.org/api/python/). La posición y escala de los cortes provienen de los atributos DICOM; OpenSlide no decodifica directamente esta serie MR. El JSON generado se guarda en `data/study_data.json` y se incorpora al HTML durante la compilación.

## Estructura

- `src/viewer.js`: escena 3D e interacción con Three.js.
- `src/template.html`: interfaz del visor.
- `data/study_data.json`: recortes y referencias anatómicas.
- `assets/`: figuras derivadas para consulta.
- `scripts/build.mjs`: compilación reproducible del sitio.
- `scripts/prepare_data.py`: preparación opcional desde DICOM.

El visor no envía imágenes ni datos del usuario a un servidor. Las visitas al sitio están sujetas a las prácticas de GitHub Pages; el enlace externo a IDC abre ese servicio por separado.
