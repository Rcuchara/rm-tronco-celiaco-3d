# RM CISS real: VS-SEG-023

Shapey J, Kujawa A, Dorent R, Wang G, Bisdas S, Dimitriadis A, Grishchuck D, Paddick I, Kitchen N, Bradford R, Saeed S, Ourselin S, Vercauteren T (2021). Segmentation of Vestibular Schwannoma from Magnetic Resonance Imaging: An Open Annotated Dataset and Baseline Algorithm (version 2). The Cancer Imaging Archive. doi:10.7937/TCIA.9YTJ-5Q73.

[Fuente](https://www.cancerimagingarchive.net/collection/vestibular-schwannoma-seg/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Consulte TCIA-LICENSE.txt.

Modificaciones: recorte del oído alrededor del contorno Cochlea, conversión de la ventana DICOM a 8 bits, compresión gzip y conversión de coordenadas LPS a RAS. Se mantienen el espaciado y las posiciones originales; no se interpolan cortes nuevos.

pydicom decodifica los DICOM. OpenSlide ImageSlide.read_region lee las regiones de los planos preparados. OpenSlide no se presenta como decodificador nativo de resonancias. Las etiquetas y contornos de cóclea y tumor derivan del RTSTRUCT original, con referencias a esta misma serie verificadas.

La serie original contiene 80 imágenes; se publican 41 cortes recortados. Los datos no son un atlas promedio, ni CT, ni una malla de anatomía.
