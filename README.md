# Anatomía en 3D: tronco celíaco y oído

Dos áreas anatómicas con datos médicos públicos, preparadas para explorar cortes y relaciones espaciales en el navegador. Las pestañas mantienen la anatomía seleccionada y el selector de técnica permite consultar los conjuntos disponibles.

| Visor | Contenido | Enlace público |
| --- | --- | --- |
| Tronco celíaco · RM | 21 cortes con referencias manuales; caso C3L-03129 | [Abrir RM](https://rcuchara.github.io/rm-tronco-celiaco-3d/) |
| Tronco celíaco · TC arterial | 65 cortes finos con contraste; caso C3L-02112 | [Abrir TC](https://rcuchara.github.io/rm-tronco-celiaco-3d/celiaco/tc/) |
| Aparato auditivo · RM CISS | Cortes reales de un paciente individual, VS-SEG-023 | [Abrir RM del oído](https://rcuchara.github.io/rm-tronco-celiaco-3d/oido/) |
| Aparato auditivo · microTC | Espécimen F01 ex vivo, cortes y superficie original del laberinto óseo | [Abrir microTC](https://rcuchara.github.io/rm-tronco-celiaco-3d/oido/?tecnica=reference) |

Cada recurso muestra su caso, modalidad, muestreo y procedencia. Los estudios de RM y TC corresponden a pacientes o especímenes diferentes: cambiar la técnica carga otro conjunto y no registra ni superpone automáticamente ambas anatomías.

El [registro de repositorios revisados](docs/REPOSITORIOS-IMAGENES.md) recoge fuentes adicionales de sincrotrón, RM, PCCT y otras anatomías, con sus licencias, tamaños y estado de acceso. Una fuente documentada allí no implica que su volumen ya esté integrado en el visor.

## Tronco celíaco

Visor web de 21 cortes de resonancia magnética apilados para explorar el tronco celíaco y los segmentos proximales de las arterias hepática común y esplénica. La vista 3D permite girar la serie, cambiar la opacidad, seleccionar cortes y mostrar referencias anatómicas. Las marcas y la flecha esplénica fueron colocadas manualmente; son orientativas y no constituyen una segmentación vascular validada.

### Datos y procedencia

- Colección pública: [CPTAC-PDA](https://portal.imaging.datacommons.cancer.gov/collections/cptac_pda/) de TCIA / NCI Imaging Data Commons.
- Cita del conjunto de datos: National Cancer Institute Clinical Proteomic Tumor Analysis Consortium (CPTAC). (2018). *The Clinical Proteomic Tumor Analysis Consortium Pancreatic Ductal Adenocarcinoma Collection (CPTAC-PDA)* (Version 15) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2018.SC20FO18
- Licencia de las imágenes de la colección: [CC BY 4.0](https://www.cancerimagingarchive.net/collection/cptac-pda/).
- Caso seudonimizado: `C3L-03129`; serie de sustracción T1 postcontraste, UID `1.3.6.1.4.1.14519.5.2.1.1078.3273.156983346663748836803923712840`.

El repositorio contiene los 21 recortes preparados para el visor en `data/study_data.json`, además de dos figuras derivadas. Los DICOM originales no se duplican aquí; se consultan en [IDC](https://viewer.imaging.datacommons.cancer.gov/v3/viewer/?StudyInstanceUIDs=1.3.6.1.4.1.14519.5.2.1.1078.3273.640735449193782945076350642934&initialSeriesInstanceUID=1.3.6.1.4.1.14519.5.2.1.1078.3273.156983346663748836803923712840).

Esta visualización es educativa. La pertenencia del caso a la cohorte procede de los metadatos de CPTAC-PDA; la imagen por sí sola no confirma la histología ni determina invasión vascular.

### Opción de TC arterial

La opción [TC arterial](https://rcuchara.github.io/rm-tronco-celiaco-3d/celiaco/tc/) utiliza el caso **C3L-02112** de la misma colección CPTAC-PDA, serie **ART THINS**, UID `1.3.6.1.4.1.14519.5.2.1.1078.3273.100695794070451892455483306265`. Es TC convencional con contraste; no es TC con conteo de fotones (PCCT).

- Fuente: **512 × 512 × 365** vóxeles; **0,703125 × 0,703125 × 0,625 mm**.
- Recurso preparado: **205 × 152 × 65**, recortado en la cuadrícula original sin interpolación espacial.
- Se aplica una ventana de **−100 a 450 HU** y se guarda como uint8 gzip, con X variando más rápido. El archivo web conserva su geometría RAS en mm, pero no el rango completo para medir unidades HU.
- Los cortes y la proyección de intensidad máxima (MIP) permiten explorar el contraste vascular y su contexto. No se incluye una segmentación de las ramas arteriales ni referencias anatómicas individuales para esta serie.

La RM utiliza **C3L-03129** y la TC utiliza **C3L-02112**; sus vistas no están registradas entre sí. Los detalles, hashes y números originales de cada corte están en `assets/celiac/ct/manifest.json` y `provenance.json`. Los datos y sus derivados conservan **CC BY 4.0**.

## Aparato auditivo: resonancia magnética en 3D

El módulo del oído utiliza imágenes reales de resonancia magnética **CISS/T2**, procedentes del caso público seudonimizado **VS-SEG-023**. Las imágenes se sitúan en el espacio usando la geometría DICOM del paciente. La forma visible se obtiene a partir de sus vóxeles de RM y permite relacionar cortes, señal y posición espacial.

El caso pertenece a una colección de pacientes con schwannoma vestibular. La anatomía corresponde a ese estudio individual y puede presentar alteraciones; no se presenta como un atlas de anatomía normal. El visor conserva el carácter educativo del proyecto.

### Cómo explorar la resonancia

- Arrastra la imagen para girar el apilado y utiliza la rueda para acercarte o alejarte.
- Selecciona un corte y el número de cortes vecinos por lado. La vista 2D permite inspeccionar el corte seleccionado.
- Ajusta la opacidad y la separación visual entre planos. **1,0× mantiene las distancias originales**; valores mayores separan las capas con fines de exploración.
- Cambia entre vista oblicua, de frente al corte y de perfil; encuadra de nuevo la serie o restablece sus controles.
- Activa las referencias disponibles y enfócalas en su corte. Solo aparecen cuando el plano correspondiente está visible.
- Guarda una captura PNG o utiliza pantalla completa.

El resalte opcional de intensidad oculta píxeles de baja señal en los planos 3D; el corte 2D mantiene sus intensidades preparadas. Este filtro no identifica estructuras ni produce una segmentación anatómica. Las orientaciones de cámara muestran el apilado de cortes originales y no representan reconstrucciones multiplanares nuevas.

### Procedencia

- Colección: [Vestibular-Schwannoma-SEG, TCIA](https://www.cancerimagingarchive.net/collection/vestibular-schwannoma-seg/).
- Caso: `VS-SEG-023`.
- Serie: `t2_ci3d_tra_1mm_v3_448`, modalidad DICOM `MR`, 80 imágenes originales.
- Adquisición: Siemens Avanto, **1,5 T**, matriz original **448 × 448 × 80**, tamaño de vóxel **0,46875 × 0,46875 × 1 mm**.
- Recorte publicado: **96 × 96 × 41**, con el espaciado original y sin interpolación espacial. Corresponde a los números DICOM **11–51** de la serie.
- Series Instance UID: `1.3.6.1.4.1.14519.5.2.1.239006515845888908570518896552813145905`.
- Datos: Shapey J et al. (2021). *Segmentation of Vestibular Schwannoma from Magnetic Resonance Imaging: An Open Annotated Dataset and Baseline Algorithm*, versión 2. [DOI 10.7937/TCIA.9YTJ-5Q73](https://doi.org/10.7937/TCIA.9YTJ-5Q73).
- [Artículo del conjunto](https://doi.org/10.1038/s41597-021-01064-w). Licencia: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

### Alcance y resolución

La visualización representa la señal de la RM seleccionada. El zoom, la opacidad y los ajustes de intensidad permiten explorar lo registrado, sin aumentar su resolución de adquisición. El órgano de Corti, las células ciliadas y los canalículos microscópicos no se identifican individualmente con estos datos. Una referencia visual orientativa no equivale a una segmentación validada.

Las posiciones y separaciones se derivan de `ImagePositionPatient`, `ImageOrientationPatient` y `PixelSpacing`; se convierten de LPS a **RAS, en milímetros**. El recorte tiene origen RAS aproximado **[−6,5625; 44,11471; −59,76634]** y ejes de incremento I/J/K en las direcciones **−R, −A, +S**, respectivamente. La orientación y la matriz se conservan en el manifiesto.

Los contornos de cóclea (`Cochlea`) y tumor (`TV`) proceden del RTSTRUCT publicado para la misma serie. Los marcadores son centros calculados de las cajas que contienen esos contornos; no son puntos anatómicos identificados de nuevo ni segmentaciones nuevas. El volumen web contiene muestras **uint8 comprimidas con gzip**, con X variando más rápido. La ventana DICOM utilizada tiene centro **278** y ancho **637**; la conversión a 8 bits reduce el rango de intensidad para su visualización y conserva el muestreo espacial adquirido.

### Opción de microTC: referencia ex vivo F01

El selector del oído permite abrir **MicroTC F01**, un espécimen humano ex vivo de *Human Bony Labyrinth: Co-Registered CT and micro-CT Images, Surface Models and Anatomical Landmarks*. Fuente: Wimmer, Anschuetz, Weder, Wagner, Delingette y Caversaccio (2019), [Zenodo, DOI 10.5281/zenodo.3355272](https://doi.org/10.5281/zenodo.3355272), **CC BY 4.0**. El [artículo del conjunto](https://pmc.ncbi.nlm.nih.gov/articles/PMC6864122/) documenta sus referencias anatómicas.

- Imagen completa de **250 × 336 × 348**, aproximadamente **0,0607 mm (60,7 µm)** por eje, sin remuestreo espacial; intensidad convertida de int16 a uint8 para la web.
- Máscara original del laberinto óseo, conservada sin subdivisiones nuevas, y superficie original convertida de PLY a GLB (**174.318 triángulos**).
- Cinco puntos originales: **ventana redonda (RW), centro de la vuelta basal (C), helicotrema (A), ventana oval (OW) y centro del vestíbulo (V)**.
- Representaciones de cortes, MIP, superficie y combinación de estructura con cortes. La MIP proyecta la intensidad de los planos seleccionados; no añade segmentaciones.

El volumen, la máscara, la superficie y los puntos comparten las coordenadas físicas del archivo fuente. Se conserva numéricamente su marco NIfTI de adquisición en mm; la orientación anatómica del espécimen respecto de esos ejes no está comprobada, por lo que se muestran como **X/Y/Z del espécimen**. No se registran al paciente de RM.

La etiqueta de laberinto óseo contiene su forma conjunta y no ofrece etiquetas separadas para cada canal semicircular, cóclea o vestíbulo. Los puntos son referencias y no segmentaciones de esas estructuras. Esta fuente no incluye etiquetas individuales de nervios, huesecillos, laberinto membranoso o canalículos microscópicos. Su tamaño de vóxel expresa el muestreo adquirido, no una medición independiente de resolución efectiva.

## Licencias

- El código original de esta aplicación se ofrece bajo la [licencia MIT](LICENSE), sin cobro por la licencia. MIT permite usar, copiar, modificar y redistribuir el código, incluso con fines comerciales o mediante venta, conservando el aviso de licencia y autoría.
- Los recortes incorporados en `data/study_data.json` y las dos figuras `assets/RM_tronco_celiaco_*.png` son derivados de CPTAC-PDA y conservan su licencia CC BY 4.0.
- Los recursos de RM del oído proceden de Vestibular-Schwannoma-SEG y conservan CC BY 4.0. Véase [DATA-LICENSE.md](DATA-LICENSE.md) para la atribución independiente y los cambios realizados.
- Los recursos de TC arterial de `assets/celiac/ct/` proceden de CPTAC-PDA y los de microTC de `assets/ear/reference/` proceden de Wimmer et al.; ambos conservan CC BY 4.0 con atribución separada.
- Las dependencias de terceros conservan sus propias licencias.

## Construir y publicar

Requisitos para la web: Node.js 22 o superior.

```bash
npm ci
npm run build
```

La compilación crea `site/index.html` para la RM celíaca, `site/celiaco/tc/index.html` para la TC arterial y `site/oido/index.html` para las técnicas del oído. Copia los recursos ya preparados, por lo que **no requiere Python ni descargar otra vez los datos médicos**. Cada cambio enviado a la rama `main` ejecuta `.github/workflows/pages.yml`, que reconstruye el sitio y lo publica en GitHub Pages. `site/`, `node_modules/` y `raw/` están excluidos de Git.

Para revisar ambos visores localmente:

```bash
python -m http.server 8765 --bind 127.0.0.1 --directory site
```

Abre [la RM local](http://127.0.0.1:8765/), [la TC local](http://127.0.0.1:8765/celiaco/tc/) o [el oído local](http://127.0.0.1:8765/oido/). Los volúmenes de TC y oído necesitan servirse por **HTTP o HTTPS**, porque cargan sus datos de imagen mediante `fetch`; no se deben abrir directamente con `file://`.

## Control mediante un asistente (WebMCP)

Cada visor ofrece cuatro herramientas a navegadores y asistentes compatibles con WebMCP. No hay un chat ni un modelo de IA incorporado en las páginas; la conexión depende del navegador/asistente con el que se abran. Los controles manuales siguen funcionando si WebMCP no está disponible.

### Herramientas del tronco celíaco

Abre **Control con asistente** para comprobar la conexión y ver la última acción aplicada.

| Herramienta | Función |
| --- | --- |
| `rm_obtener_contexto` | Lee la procedencia, licencia, cortes disponibles, referencias manuales y estado real de la cámara y controles. No devuelve imágenes en base64. |
| `rm_ajustar_vista` | Aplica ajustes de corte, modo, orientación, radio de cortes vecinos, opacidad, separación y visibilidad de referencias. |
| `rm_enfocar_referencia` | Selecciona el corte de una marca existente y centra en ella una vista axial anatómica. |
| `rm_restaurar_vista` | Recupera los controles y la cámara iniciales. |

Ejemplos para pedir al asistente:

- «Muestra solo el corte 54 en vista axial».
- «Enfoca la referencia de la arteria esplénica».
- «Cambia la opacidad al 50 % y muestra todos los cortes».
- «Consulta la procedencia de estas imágenes».

Los números de corte son los originales **44–64**. La opacidad admite **10–100 %**, el radio **0–20** y la separación visual **1–3**, en incrementos de **0,1**. Todos los parámetros se validan antes de aplicar cambios. Las vistas axial/coronal/oblicua orientan la cámara del apilado; no generan una reconstrucción multiplanar nueva. Enfocar usa una marca manual ya existente, sin detección automática de anatomía.

La integración usa `document.modelContext.registerTool` y admite `navigator.modelContext.registerTool` como compatibilidad con puentes anteriores. Los registros se limpian con `AbortController` al salir de la página y se restablecen al volver desde la caché del navegador. WebMCP sigue evolucionando y no está disponible en todos los navegadores. Puede comprobarse de nuevo desde el botón **Comprobar conexión**.

Implementación original inspirada en el patrón de registro del [ejemplo de Runme](https://github.com/runmedev/web/blob/4a74e79efa18d78d63930112818b560bb10a0bb3/app/src/components/WebMcp/WebMcpToolRegistrationHost.tsx#L65), adaptada a herramientas específicas del visor. No se expone ejecución arbitraria de JavaScript. Referencias: [API imperativa de WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api) y [especificación](https://webmachinelearning.github.io/webmcp/).

`npm run check` ejecuta pruebas de validación, registro, compatibilidad y limpieza, y comprueba el sitio construido. Para una prueba completa se necesita además abrir la página en un asistente compatible, llamar a las herramientas y comprobar los cambios visibles.

### Herramientas de los volúmenes: RM del oído, microTC y TC arterial

Las herramientas conservan los mismos cuatro sufijos y emplean un prefijo que identifica el conjunto cargado:

| Conjunto | Prefijo | Representaciones disponibles |
| --- | --- | --- |
| RM CISS del oído | `mri_oido` | `slices`, `mip` |
| MicroTC F01 del oído | `microct_oido` | `slices`, `mip`, `surface`, `combined` |
| TC arterial celíaca | `ct_celiaco` | `slices`, `mip` |

Por ejemplo, en TC se registra `ct_celiaco_obtener_contexto` y en F01 `microct_oido_ajustar_cortes`. La tabla siguiente muestra los nombres que se mantienen para la RM del oído:

| Herramienta | Función |
| --- | --- |
| `mri_oido_obtener_contexto` | Lee fuente, modalidad real, resolución, referencias, condición ex vivo, superficie disponible y estado del visor; no devuelve imágenes en base64. |
| `mri_oido_ajustar_cortes` | Ajusta corte seleccionado, radio de vecinos, opacidad, separación, zoom 2D, orientación, representación (`representation`), referencias y filtro de intensidad (`intensity_filter`, `threshold` de 0 a 245). |
| `mri_oido_enfocar_referencia` | Selecciona el corte de una referencia disponible y lo muestra de frente con radio de vecinos cero. |
| `mri_oido_restaurar_vista` | Restablece corte inicial, radio de diez vecinos, opacidad del 72 %, separación 1,0× y vista oblicua. |

En la RM, los números de corte son **1–41** dentro del recurso publicado y corresponden a **11–51** en los DICOM originales; las referencias usan `cochlea` y `tumor`. En TC y microTC, los límites y referencias se consultan en el contexto de su propio conjunto. La TC no incluye referencias arteriales individuales para enfocar.

La opacidad admite **5–100 %** y `zoom_2d` admite **1–6** en incrementos de **0,25**. La separación visual **1–3**, en incrementos de **0,1**, está disponible en la representación `slices`; las representaciones MIP, superficie y combinada mantienen **1,0×**. Los parámetros se validan antes de modificar la imagen. Por ejemplo: «Muestra solamente el corte 20 de frente», «Cambia a MIP» o «Consulta la procedencia y resolución de este estudio». La representación de superficie corresponde a la segmentación original F01 y no está disponible para los otros conjuntos.

## Regenerar los planos desde los DICOM públicos

Solo hace falta para cambiar el procesamiento de imagen o el caso. Se requiere Python 3.11 o superior.

```bash
python -m pip install -r requirements-data.txt
python scripts/download_idc_series.py dab6e12c-fa52-4396-ab09-f9286f53f474 raw/sub_arterial
python scripts/prepare_data.py --dicom-dir raw/sub_arterial
npm run build
```

El script decodifica DICOM con `pydicom`, prepara cada imagen 2D y la lee mediante [`openslide.ImageSlide.read_region`](https://openslide.org/api/python/). La posición y escala de los cortes provienen de los atributos DICOM; OpenSlide no decodifica directamente esta serie MR. El JSON generado se guarda en `data/study_data.json` y se incorpora al HTML durante la compilación.

## Regenerar los recursos del oído

La compilación web utiliza los recursos preparados del repositorio. Python solo se necesita si se modifica el procesamiento de la serie DICOM. Las dependencias opcionales se instalan con:

```bash
python -m pip install -r requirements-ear.txt
python scripts/prepare-ear-mri.py --download --source /ruta/tcia --output assets/ear/mri --deliverables /ruta/salidas
npm run build
```

Sustituye `/ruta/tcia` y `/ruta/salidas` por tus directorios. La opción `--download` descarga desde TCIA los archivos públicos `VS-SEG-023-CISS.zip` y `RTSTRUCT-180401697177051449426455496944505107802.zip` cuando faltan; puede omitirse si ya están disponibles en el directorio de origen. El manifiesto preparado incluye sus URL exactas de descarga y SHA256. Los datos DICOM originales se mantienen fuera del sitio publicado. `scripts/prepare-ear-mri.py` verifica los CRC de los ZIP, modalidad y serie, orientación y espaciado, y las referencias de marco, serie y SOP del RTSTRUCT antes de producir los recursos web de `assets/ear/mri/`.

El script decodifica las imágenes DICOM mediante `pydicom` y utiliza `openslide.ImageSlide.read_region` sobre las imágenes PIL resultantes para preparar los recortes. **OpenSlide no es el decodificador de la RM**; se utiliza para leer las regiones de las imágenes ya decodificadas. La escala y posición proceden de los atributos DICOM.

Además genera `Oido_RM_CISS_VS-SEG-023_corte_coclea.tiff`, un corte 2D real recortado que puede abrirse por separado con OpenSlide o un visor compatible. El TIFF utiliza bloques de 128 × 128 y sus píxeles se verifican tras volver a leerlo con `openslide.OpenSlide`. Se identifica como RM y no como una lámina microscópica; no se le atribuyen aumento óptico ni resolución microscópica. `tifffile` se requiere para escribir este archivo adicional, pero el navegador carga el volumen preparado directamente.

### Regenerar microTC y TC arterial

Las mismas dependencias de `requirements-ear.txt` cubren estos scripts; no se necesitan para compilar la web. Para F01 descarga [el ZIP original de Zenodo](https://zenodo.org/records/3355272/files/F01.zip?download=1) y conserva su nombre. El script verifica el MD5 publicado y los CRC, lee NIfTI, conserva la máscara y convierte la superficie original a GLB.

```bash
python scripts/prepare-ear-reference.py --source /ruta/F01.zip --output assets/ear/reference
python scripts/prepare-celiac-ct.py --download --source /ruta/TC-ART-THINS --output assets/celiac/ct
npm run build
```

Para la TC, `--download` obtiene la serie pública de IDC cuando faltan sus archivos. `pydicom` decodifica los DICOM y convierte su intensidad a HU; OpenSlide lee los recortes de los planos ya decodificados y ajustados a la ventana. Los scripts guardan procedencia y hashes junto con los recursos preparados. El script de microTC no necesita OpenSlide para leer sus archivos NIfTI.

## Estructura

- `src/viewer.js`: escena 3D e interacción con Three.js.
- `src/webmcp.js`: herramientas para asistentes, validación y ciclo de registro.
- `src/template.html`: interfaz del visor.
- `data/study_data.json`: recortes y referencias anatómicas.
- `src/ear-mri-viewer.js`, `src/ear-mri-template.html`, `src/ear-mri.css`: interfaz, escena y controles compartidos por los volúmenes de RM del oído, microTC y TC arterial.
- `assets/RM_tronco_celiaco_*.png`: figuras derivadas de RM para consulta.
- `assets/ear/mri/`: recursos y metadatos preparados de la RM del oído.
- `assets/ear/reference/`: microTC, máscara, superficie y referencias originales de F01.
- `assets/celiac/ct/`: TC arterial, metadatos y vistas de consulta de C3L-02112.
- `scripts/build.mjs`: compilación reproducible del sitio.
- `scripts/prepare_data.py`: preparación opcional desde DICOM.
- `scripts/prepare-ear-mri.py`: preparación opcional de la serie CISS y sus recortes.
- `scripts/prepare-ear-reference.py`: preparación opcional de los recursos originales F01.
- `scripts/prepare-celiac-ct.py`: descarga y preparación opcional de la TC arterial.

El visor no sube imágenes ni incorpora servicios de IA de pago. Al utilizar WebMCP, el asistente que invoque sus herramientas recibe los metadatos públicos del estudio y el estado del visor; su tratamiento depende de ese asistente. Las visitas al sitio están sujetas a las prácticas de GitHub Pages; el enlace externo a IDC abre ese servicio por separado.
