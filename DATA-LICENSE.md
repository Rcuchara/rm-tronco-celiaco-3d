# Procedencia y licencia de las imágenes

La licencia MIT del archivo `LICENSE` se aplica al código original de este repositorio. No cambia los derechos sobre las imágenes médicas de origen.

## Resonancia magnética del tronco celíaco: CPTAC-PDA

Los píxeles incorporados en `data/study_data.json` y las dos figuras `assets/RM_tronco_celiaco_anotada.png` y `assets/RM_tronco_celiaco_3D_vista.png` proceden del caso seudonimizado `C3L-03129` de la colección pública CPTAC-PDA de The Cancer Imaging Archive / NCI Imaging Data Commons. La colección indica la licencia [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://www.cancerimagingarchive.net/collection/cptac-pda/).

**Cita de los datos:** National Cancer Institute Clinical Proteomic Tumor Analysis Consortium (CPTAC). (2018). *The Clinical Proteomic Tumor Analysis Consortium Pancreatic Ductal Adenocarcinoma Collection (CPTAC-PDA)* (Version 15) [Dataset]. The Cancer Imaging Archive. https://doi.org/10.7937/K9/TCIA.2018.SC20FO18

**Cambios realizados:** se decodificó la serie MR DICOM de sustracción T1 postcontraste; se recortaron 21 cortes, se ajustó su intensidad de visualización y se incorporaron al visor 3D. Las figuras derivadas incluyen una proyección de intensidad máxima y referencias anatómicas trazadas manualmente. El proyecto no modifica ni redistribuye los DICOM originales.

## Resonancia magnética del oído: Vestibular-Schwannoma-SEG

Los recursos de `assets/ear/mri/` proceden del caso seudonimizado **VS-SEG-023** de la colección pública [Vestibular-Schwannoma-SEG](https://www.cancerimagingarchive.net/collection/vestibular-schwannoma-seg/) de The Cancer Imaging Archive. La serie `t2_ci3d_tra_1mm_v3_448`, modalidad MR, contiene 80 imágenes y tiene Series Instance UID `1.3.6.1.4.1.14519.5.2.1.239006515845888908570518896552813145905`. La adquisición Siemens Avanto de 1,5 T tiene matriz 448 × 448 × 80 y vóxeles de 0,46875 × 0,46875 × 1 mm. La licencia de los datos es [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

**Cita requerida de los datos:** Shapey, J., Kujawa, A., Dorent, R., Wang, G., Bisdas, S., Dimitriadis, A., Grishchuck, D., Paddick, I., Kitchen, N., Bradford, R., Saeed, S., Ourselin, S., & Vercauteren, T. (2021). *Segmentation of Vestibular Schwannoma from Magnetic Resonance Imaging: An Open Annotated Dataset and Baseline Algorithm* (version 2) [Data set]. The Cancer Imaging Archive. [DOI 10.7937/TCIA.9YTJ-5Q73](https://doi.org/10.7937/TCIA.9YTJ-5Q73).

**Artículo:** Shapey J et al. (2021). *Segmentation of vestibular schwannoma from MRI, an open annotated dataset and baseline algorithm*. Scientific Data 8, 286. [DOI 10.1038/s41597-021-01064-w](https://doi.org/10.1038/s41597-021-01064-w).

**Cambios realizados:** se decodifican las imágenes mediante `pydicom`, se ordenan por su geometría DICOM, se aplica su ventana original (centro 278, ancho 637), se convierte la intensidad a uint8 y se recortan mediante `openslide.ImageSlide.read_region` sobre las imágenes ya decodificadas. Se publican **41 cortes de 96 × 96 píxeles**, correspondientes a los números DICOM **11–51**, sin interpolación espacial y con el espaciado adquirido de 0,46875 × 0,46875 × 1 mm. El volumen se comprime con gzip y las coordenadas se convierten de LPS a RAS en mm.

Los contornos `Cochlea` y `TV` se trasladan del RTSTRUCT publicado para la misma serie, cuyas referencias de marco, serie e imágenes SOP se verifican. Los marcadores mostrados se calculan como centros de las cajas que contienen esos contornos. Los metadatos preparados documentan los recortes, la matriz, el espaciado, las transformaciones y los SHA256 de los archivos fuente y derivados. También se prepara un TIFF de un corte real para consulta con OpenSlide, verificando la identidad de sus píxeles al volver a leerlo. El sitio no redistribuye la serie DICOM original. [Atribución específica del recurso](assets/ear/mri/ATTRIBUTION.md).

Este recurso corresponde a una RM de un paciente individual de una cohorte con schwannoma vestibular. Los datos conservan sus variaciones anatómicas y no se presentan como una anatomía normal de referencia.

## Condiciones de reutilización

Las imágenes y sus derivados conservan **CC BY 4.0**; quien los reutilice debe reconocer a los autores y fuentes correspondientes, enlazar la licencia e indicar sus modificaciones. La licencia **MIT** se aplica al código original del visor y de sus scripts y no sustituye estas licencias de datos. Las dependencias de software conservan sus propias licencias.
