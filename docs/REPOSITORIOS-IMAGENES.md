# Repositorios de imágenes 3D: oído y región celíaca

**Revisión: 29 de septiembre de 2026.** Registro de fuentes primarias, disponibilidad comprobada y requisitos para incorporarlas al visor. Los tamaños usan MB/GB decimales. «Preparado» significa que hay recursos derivados locales comprobados; la publicación en GitHub Pages se verifica por separado.

## Datos adecuados ya descargados

| Técnica y fuente | Qué contiene | Muestreo y tamaño original | Licencia y comprobación | Aplicación al proyecto |
| --- | --- | --- | --- | --- |
| **RM CISS: Vestibular-Schwannoma-SEG, VS-SEG-023** | RM de un paciente individual; contornos originales de cóclea y tumor en RTSTRUCT. | 448 × 448 × 80; 0,46875 × 0,46875 × 1 mm; 1,5 T. ZIP de imagen: 32.411.920 bytes. | CC BY 4.0. Descarga completa; CRC y correspondencia de marco/serie/imágenes del RTSTRUCT verificados. | Preparado en `assets/ear/mri/`: 96 × 96 × 41, sin interpolación espacial. Es un caso con schwannoma, con anatomía propia de ese estudio. |
| **MicroTC: Human Bony Labyrinth, F01** | Espécimen humano ex vivo; imagen, máscara del laberinto óseo, superficie y cinco referencias de los autores. | 250 × 336 × 348; aproximadamente 60,7 µm isotrópicos. `F01.zip`: 29.822.416 bytes. | CC BY 4.0. Descarga completa; MD5 publicado y CRC verificados; máscara conservada. | Preparado en `assets/ear/reference/`: volumen, máscara y superficie. Muestra distinta del paciente de RM. |
| **TC arterial: CPTAC-PDA, C3L-02112, ART THINS** | TC convencional con contraste de un paciente de la cohorte de adenocarcinoma pancreático; región celíaca recortada. | 512 × 512 × 365; 0,703125 × 0,703125 × 0,625 mm. 365 DICOM: 193.178.242 bytes. | CC BY 4.0, confirmada por TCIA y metadatos de descarga. Serie descargada y geometría comprobada. | Preparado en `assets/celiac/ct/`: 205 × 152 × 65, sin interpolación; sin segmentación vascular. Paciente diferente del caso de RM C3L-03129. |

Fuentes y atribución de cada fila:

- **RM:** Shapey et al., [colección de TCIA](https://www.cancerimagingarchive.net/collection/vestibular-schwannoma-seg/), [DOI de los datos 10.7937/TCIA.9YTJ-5Q73](https://doi.org/10.7937/TCIA.9YTJ-5Q73) y [artículo del conjunto](https://doi.org/10.1038/s41597-021-01064-w).
- **MicroTC:** Wimmer et al., [registro y descargas de Zenodo](https://zenodo.org/records/3355272), [DOI 10.5281/zenodo.3355272](https://doi.org/10.5281/zenodo.3355272) y [artículo de los datos](https://pmc.ncbi.nlm.nih.gov/articles/PMC6864122/).
- **TC arterial:** National Cancer Institute CPTAC, [colección CPTAC-PDA](https://www.cancerimagingarchive.net/collection/cptac-pda/), versión 15, [DOI 10.7937/K9/TCIA.2018.SC20FO18](https://doi.org/10.7937/K9/TCIA.2018.SC20FO18). Serie `1.3.6.1.4.1.14519.5.2.1.1078.3273.100695794070451892455483306265`.

**Alcance anatómico:** F01 tiene una sola etiqueta para el laberinto óseo; la máscara no separa cóclea, vestíbulo y cada canal semicircular. Sus cinco puntos anatómicos tampoco son segmentaciones independientes. Ninguno de los recursos anteriores permite prometer la identificación individual del órgano de Corti, células ciliadas o todos los canalículos. La TC arterial no es PCCT y todavía no contiene etiquetas validadas de cada rama vascular.

## Fuentes adicionales con acceso real comprobado

### Sincrotrón / contraste de fase: temporal humano

**Schaeper et al.: _3D imaging of the human temporal bone by X-ray phase-contrast tomography_.** Hay volúmenes humanos ex vivo reconstruidos en [Göttingen Research Online, DOI 10.25625/V3YSYD](https://doi.org/10.25625/V3YSYD), vinculados al [artículo](https://doi.org/10.1038/s44303-025-00086-y).

- **Licencia del conjunto: CC BY-NC 4.0.** Es distinta de la licencia del artículo; debe conservarse su restricción de uso no comercial.
- Archivo de sincrotrón más pequeño listado: `H02_BM18_zoom_px=4.516um.h5`, **13.254.829.608 bytes**. El paso del volumen distribuido es 4,516 µm; la adquisición fue de 2,258 µm y se agrupó por dos.
- Se verificaron la [API de metadatos](https://data.goettingen-research-online.de/api/datasets/:persistentId/?persistentId=doi:10.25625/V3YSYD), el estado sin restricción de los archivos y la [descarga del archivo 119442](https://data.goettingen-research-online.de/api/access/datafile/119442) mediante una petición de los primeros ocho bytes: firma HDF5 válida. **No se descargaron sus 13,25 GB completos.**
- Requiere lectura HDF5, revisión de dimensiones y geometría internas, recorte y preparación de niveles de detalle para la web. La muestra es ex vivo; no es un estudio clínico del paciente de RM.
- El mismo registro incluye `H02_uCT_px=7.2um.h5`, de **5.210.430.754 bytes**: es microTC de laboratorio, aunque sea menor; no debe etiquetarse como sincrotrón. El MP4 suplementario es un video, no un volumen navegable.

**Estado:** candidato real y descargable para una incorporación posterior. Algunas muestras cubren también los huesecillos del oído medio; el artículo describe segmentación de martillo, yunque y estribo en H11. La anatomía fina descrita por los autores todavía no ha sido verificada en un recorte preparado por este proyecto. Tampoco debe suponerse que esas segmentaciones están incluidas como archivos separados en el repositorio.

### RM de alta definición: IE-Map

[IE-Map](https://zenodo.org/records/10625570) publica un atlas obtenido de **126 oídos de 63 personas**, bajo **CC BY 4.0**. El [artículo](https://doi.org/10.1038/s41598-021-82716-0) describe adquisición CISS de **0,5 mm** a 3 T y T1/T2 de **0,75 mm**; la plantilla registrada se distribuye en una cuadrícula de **0,2 mm**. Esa cuadrícula no equivale a adquisición nativa de 0,2 mm.

- `IEMap_CISS.nii.gz`: **21.248.794 bytes**, descargado completo y MD5 verificado; matriz 200 × 200 × 150. `IEMap_T2.nii.gz`: 21.231.768 bytes, listado pero no descargado en esta revisión.
- Permite preparar un volumen de RM de un **atlas promedio**, con lectura NIfTI y conversión de intensidad para navegador. No debe sustituir la identidad del paciente individual ni presentarse como una adquisición nueva de ese paciente.
- Algunas estructuras añadidas al atlas proceden de microTC registrada. Antes de reutilizar sus máscaras o mallas hay que conservar esa procedencia mixta; no se deben atribuir todas las etiquetas a señal directamente resuelta por RM.

**Estado:** candidato descargado para un modo «Atlas de RM». No incorporado al visor durante esta revisión.

## PCCT: qué está disponible y qué falta

### Hueso temporal humano: evidencia publicada, volumen abierto no verificado

El [estudio primario de Hermans et al. (2023)](https://doi.org/10.1186/s13244-023-01467-w) compara PCCT con TC multidetector en hueso temporal. Documenta adquisición PCCT de 0,2 mm y mejor valoración de varias estructuras. Su apartado de disponibilidad remite a los datos presentados en el manuscrito; no proporciona un repositorio descargable de los volúmenes DICOM completos.

**Resultado de esta búsqueda:** no se ha verificado un volumen PCCT abierto de hueso temporal humano apto para añadirlo al visor. Esto no demuestra que no exista ninguno; establece el límite de la búsqueda realizada. El acceso abierto al artículo o a sus figuras no demuestra acceso ni permiso para redistribuir las series clínicas originales. Sería necesario obtener una fuente descargable, licencia de los datos y geometría de adquisición antes de habilitar esta opción con imágenes propias.

### PCCT abierto auténtico, pero de fantomas

Lustermans et al. publican [TC de doble energía y PCCT de fantomas antropomórficos](https://zenodo.org/records/18377176), DOI **10.5281/zenodo.18377176**, **CC BY 4.0**. `PCCT images.zip` contiene **4.494.083.009 bytes**; se verificaron metadatos y descarga parcial con firma ZIP. No se descargaron los 4,49 GB completos.

**Descartado para mostrar anatomía de un paciente:** son fantomas. Serviría para una futura demostración de adquisición o física de PCCT, identificada expresamente como tal. La disponibilidad de este conjunto no resuelve la ausencia de una serie de oído humano adecuada para el proyecto.

## Ampliación a otras anatomías: Human Organ Atlas / HiP-CT

El [Human Organ Atlas de ESRF](https://human-organ-atlas.esrf.fr/) ofrece órganos humanos **ex vivo** adquiridos mediante tomografía de contraste de fase con sincrotrón, bajo **CC BY 4.0** y con DOI por conjunto. Incluye corazón, pulmón, riñón, cerebro, hígado, bazo y otros órganos; no representa una cabeza o cuerpo vivo completo. El [artículo del atlas](https://pmc.ncbi.nlm.nih.gov/articles/PMC12978218/) describe volúmenes jerárquicos con vistas generales y regiones de mayor detalle.

Se comprobaron metadatos oficiales y listados de objetos públicos para estas opciones pequeñas del donante **LADAF-2020-27**, sin descargar sus imágenes:

| Anatomía y conjunto | Nivel N5 público revisado | Cuadrícula de ese nivel | Tamaño total listado |
| --- | --- | --- | --- |
| [Riñón izquierdo, DOI 10.15151/ESRF-DC-572182553](https://doi.org/10.15151/ESRF-DC-572182553) | `s4`, reducción por 16 | 168 × 199 × 137; 401,28 µm | 5.207.853 bytes |
| [Bazo, DOI 10.15151/ESRF-DC-572244468](https://doi.org/10.15151/ESRF-DC-572244468) | `s4`, reducción por 16 | 135 × 183 × 119; 401,28 µm | 3.478.778 bytes |
| [Corazón, DOI 10.15151/ESRF-DC-572189991](https://doi.org/10.15151/ESRF-DC-572189991) | `s4`, reducción por 16 | 362 × 362 × 414; 401,28 µm | 45.103.602 bytes |
| [Hígado, DOI 10.15151/ESRF-DC-2217843064](https://doi.org/10.15151/ESRF-DC-2217843064) | `s4`, reducción por 16 | 357 × 357 × 403; 404 µm | 54.087.230 bytes |

Los tamaños son la suma de los objetos del nivel indicado, incluido `attributes.json`, y no el tamaño del estudio original. La adquisición base es de 25,08 µm en los tres primeros y 25,25 µm en hígado; **las versiones pequeñas no conservan ese muestreo**. Para riñón también se verificó `s3`: 40.931.253 bytes a 200,64 µm.

Evidencia reproducible: [metadatos oficiales del riñón](https://raw.githubusercontent.com/HumanOrganAtlas/metadata-schemas/main/metadata/LADAF-2020-27_kidney_left_complete-organ_25.08um_bm05.json), [atributos públicos de su nivel s4](https://storage.googleapis.com/ucl-hip-ct-35a68e99feaae8932b1d44da0358940b/LADAF-2020-27/kidney-left/25.08um_complete-organ_bm05/s4/attributes.json) e [instrucciones oficiales de descarga por bloques](https://hoa-tools.readthedocs.io/en/stable/tutorial/fetching_data/).

**Estado y requisitos:** opciones viables para futuras pestañas anatómicas; falta descargar los bloques, comprobar la reconstrucción N5 y preparar recursos web con la escala y orientación correctas. No se han verificado máscaras para estos candidatos. No debe prometerse aislamiento de vasos, estructuras internas ni conservación del tronco celíaco en órganos extraídos. El riñón y el bazo reducidos permiten una primera prueba sin descargar decenas de GB.

## Cómo interpretar «gold standard» en este proyecto

No conviene asignar una modalidad como referencia absoluta para todo el aparato auditivo o para todos los objetivos. Hay que fijar **qué estructura, qué medida y qué muestra** se quieren evaluar:

- Para forma del laberinto óseo, una microTC ex vivo con máscara original aporta una referencia anatómica detallada. F01 permite estudiar esa geometría, pero es otro espécimen y no valida punto a punto el caso de RM.
- Para detalle microscópico, el sincrotrón/contraste de fase puede aportar información de otra escala; el conjunto concreto y su preparación deben demostrar la visibilidad de la estructura elegida.
- La RM del paciente aporta señal y relaciones espaciales reales de ese estudio. Un atlas promediado o una muestra ex vivo añaden contexto, sin convertirse en una mejor adquisición del mismo paciente.
- Para comparar arterias entre RM y TC deben conservarse fase de contraste, geometría y procedencia. Los casos seleccionados son distintos y no permiten medir un cambio individual entre técnicas.

En los selectores del visor conviene mostrar **técnica + caso o espécimen + tamaño de vóxel + estado de disponibilidad**. Los nombres de técnicas documentadas sin volumen integrado pueden llevar a su fuente; no deben abrir otra modalidad con una etiqueta incorrecta. El zoom y una cuadrícula interpolada nunca se describen como aumento de la resolución adquirida.
