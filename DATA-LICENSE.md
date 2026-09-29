# Procedencia y licencia de las imágenes

La licencia MIT del archivo `LICENSE` se aplica al código original de este repositorio. No cambia los derechos sobre las imágenes médicas de origen.

## Resonancia magnética del tronco celíaco: CPTAC-PDA

Los píxeles incorporados en `data/study_data.json` y las dos figuras `assets/RM_tronco_celiaco_anotada.png` y `assets/RM_tronco_celiaco_3D_vista.png` proceden del caso seudonimizado `C3L-03129` de la colección pública CPTAC-PDA de The Cancer Imaging Archive / NCI Imaging Data Commons. La colección indica la licencia [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://www.cancerimagingarchive.net/collection/cptac-pda/).

**Cita de los datos:** National Cancer Institute Clinical Proteomic Tumor Analysis Consortium (CPTAC). (2018). *The Clinical Proteomic Tumor Analysis Consortium Pancreatic Ductal Adenocarcinoma Collection (CPTAC-PDA)* (Version 15) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2018.SC20FO18

**Cambios realizados:** se decodificó la serie MR DICOM de sustracción T1 postcontraste; se recortaron 21 cortes, se ajustó su intensidad de visualización y se incorporaron al visor 3D. Las figuras derivadas incluyen una proyección de intensidad máxima y referencias anatómicas trazadas manualmente. El proyecto no modifica ni redistribuye los DICOM originales.

## TC arterial del tronco celíaco: CPTAC-PDA

Los recursos de `assets/celiac/ct/` proceden de **C3L-02112**, serie **ART THINS**, de la misma colección CPTAC-PDA, bajo **CC BY 4.0**. Se aplica la cita de CPTAC indicada arriba. Series Instance UID: `1.3.6.1.4.1.14519.5.2.1.1078.3273.100695794070451892455483306265`; identificador IDC `d5eae19d-ef93-49c8-b2ac-33e0bffb9a92`.

**Cambios realizados:** a partir de la serie DICOM de 512 × 512 × 365, se prepara un recorte de **205 × 152 × 65**, conservando el muestreo de **0,703125 × 0,703125 × 0,625 mm**, sin interpolación espacial. Se convierten los valores DICOM a HU, se aplica una ventana de **−100 a 450 HU** y se guarda el resultado como uint8 gzip. Las coordenadas pasan de LPS a RAS en mm. OpenSlide lee el recorte de cada plano ya decodificado mediante `pydicom`. Las figuras de consulta incluyen un corte real y una MIP. [Atribución del recurso](assets/celiac/ct/ATTRIBUTION.txt).

El manifiesto y `provenance.json` conservan los identificadores de fuente, posiciones, números originales y hashes. No se añaden segmentaciones ni etiquetas arteriales validadas. **Es otro paciente que el mostrado en RM**, y las series no están registradas entre sí. Esta adquisición es TC arterial convencional; no es PCCT. El volumen de visualización no conserva el rango completo de HU del DICOM original.

## Resonancia magnética del oído: Vestibular-Schwannoma-SEG

Los recursos de `assets/ear/mri/` proceden del caso seudonimizado **VS-SEG-023** de la colección pública [Vestibular-Schwannoma-SEG](https://www.cancerimagingarchive.net/collection/vestibular-schwannoma-seg/) de The Cancer Imaging Archive. La serie `t2_ci3d_tra_1mm_v3_448`, modalidad MR, contiene 80 imágenes y tiene Series Instance UID `1.3.6.1.4.1.14519.5.2.1.239006515845888908570518896552813145905`. La adquisición Siemens Avanto de 1,5 T tiene matriz 448 × 448 × 80 y vóxeles de 0,46875 × 0,46875 × 1 mm. La licencia de los datos es [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

**Cita requerida de los datos:** Shapey, J., Kujawa, A., Dorent, R., Wang, G., Bisdas, S., Dimitriadis, A., Grishchuck, D., Paddick, I., Kitchen, N., Bradford, R., Saeed, S., Ourselin, S., & Vercauteren, T. (2021). *Segmentation of Vestibular Schwannoma from Magnetic Resonance Imaging: An Open Annotated Dataset and Baseline Algorithm* (version 2) [Data set]. The Cancer Imaging Archive. [DOI 10.7937/TCIA.9YTJ-5Q73](https://doi.org/10.7937/TCIA.9YTJ-5Q73).

**Artículo:** Shapey J et al. (2021). *Segmentation of vestibular schwannoma from MRI, an open annotated dataset and baseline algorithm*. Scientific Data 8, 286. [DOI 10.1038/s41597-021-01064-w](https://doi.org/10.1038/s41597-021-01064-w).

**Cambios realizados:** se decodifican las imágenes mediante `pydicom`, se ordenan por su geometría DICOM, se aplica su ventana original (centro 278, ancho 637), se convierte la intensidad a uint8 y se recortan mediante `openslide.ImageSlide.read_region` sobre las imágenes ya decodificadas. Se publican **41 cortes de 96 × 96 píxeles**, correspondientes a los números DICOM **11–51**, sin interpolación espacial y con el espaciado adquirido de 0,46875 × 0,46875 × 1 mm. El volumen se comprime con gzip y las coordenadas se convierten de LPS a RAS en mm.

Los contornos `Cochlea` y `TV` se trasladan del RTSTRUCT publicado para la misma serie, cuyas referencias de marco, serie e imágenes SOP se verifican. Los marcadores mostrados se calculan como centros de las cajas que contienen esos contornos. Los metadatos preparados documentan los recortes, la matriz, el espaciado, las transformaciones y los SHA256 de los archivos fuente y derivados. También se prepara un TIFF de un corte real para consulta con OpenSlide, verificando la identidad de sus píxeles al volver a leerlo. El sitio no redistribuye la serie DICOM original. [Atribución específica del recurso](assets/ear/mri/ATTRIBUTION.md).

Este recurso corresponde a una RM de un paciente individual de una cohorte con schwannoma vestibular. Los datos conservan sus variaciones anatómicas y no se presentan como una anatomía normal de referencia.

## MicroTC del oído: Human Bony Labyrinth, F01

Los recursos de `assets/ear/reference/` proceden del espécimen humano ex vivo **F01**, del conjunto [*Human Bony Labyrinth: Co-Registered CT and micro-CT Images, Surface Models and Anatomical Landmarks*](https://zenodo.org/records/3355272), bajo [**CC BY 4.0**](https://creativecommons.org/licenses/by/4.0/).

**Cita de los datos:** Wimmer, W., Anschuetz, L., Weder, S., Wagner, F., Delingette, H., & Caversaccio, M. (2019). *Human Bony Labyrinth: Co-Registered CT and micro-CT Images, Surface Models and Anatomical Landmarks* [Dataset]. Zenodo. [DOI 10.5281/zenodo.3355272](https://doi.org/10.5281/zenodo.3355272). El [artículo del conjunto](https://pmc.ncbi.nlm.nih.gov/articles/PMC6864122/) documenta los datos y las referencias anatómicas.

**Cambios realizados:** se lee `F01/uCT/F01_uCT_RAW.nii` y se convierte su intensidad int16 a uint8 con una ventana de visualización entre los percentiles 0,5 y 99,5; se conserva la cuadrícula de **250 × 336 × 348**, aproximadamente **60,7 µm** por eje, sin remuestreo. Se comprimen con gzip la imagen y la máscara original `F01_uCT_LABELS.nii`, sin subdividir sus etiquetas. La superficie de `F01_uCT_SURF.ply` se convierte a GLB conservando posiciones y conectividad, con cálculo de normales para iluminación. Las cinco referencias originales mantienen sus posiciones e identificadores; se añaden nombres descriptivos en español. Se producen vistas de consulta derivadas de estos datos.

El volumen, la máscara, la superficie y los puntos conservan su geometría común en mm. El marco NIfTI de adquisición se mantiene numéricamente, pero se identifica como marco del **espécimen X/Y/Z**, porque no se ha verificado su orientación respecto de una cabeza íntegra. F01 no está registrado al paciente VS-SEG-023 y no es una versión de mayor resolución de su resonancia.

El ZIP fuente se verifica contra su MD5 publicado, `52f9f4f5bc8ea6a76015f0936d74afb3`, y sus CRC. El manifiesto incluye los SHA256 originales y derivados. La máscara representa conjuntamente el laberinto óseo; no constituye una segmentación independiente de cada canal, cóclea, vestíbulo o canalículo. El color de la superficie es una elección de visualización y no una clasificación de tejidos.

## Condiciones de reutilización

Las imágenes y sus derivados conservan **CC BY 4.0**; quien los reutilice debe reconocer a los autores y fuentes correspondientes, enlazar la licencia e indicar sus modificaciones. La licencia **MIT** se aplica al código original del visor y de sus scripts y no sustituye estas licencias de datos. Las dependencias de software conservan sus propias licencias.
