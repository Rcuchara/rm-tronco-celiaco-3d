"""Prepare a native-spacing arterial CT crop around the celiac origin.

Public source: CPTAC-PDA / TCIA / IDC, patient C3L-02112, ART THINS.
This is a different patient from the project's C3L-03129 MRI. It is ordinary
contrast-enhanced clinical CT, not photon-counting CT. No synthetic anatomy,
spatial interpolation, vessel segmentation or diagnostic annotation is added.
Dependencies: numpy, Pillow, pydicom, openslide-python, openslide-bin.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image
import openslide

REPO = Path(__file__).resolve().parents[1]
PATIENT = 'C3L-02112'
SERIES = '1.3.6.1.4.1.14519.5.2.1.1078.3273.100695794070451892455483306265'
IDC_UUID = 'd5eae19d-ef93-49c8-b2ac-33e0bffb9a92'
SOURCE_URL = 'https://www.cancerimagingarchive.net/collection/cptac-pda/'
DOI = '10.7937/K9/TCIA.2018.SC20FO18'
X0, X1, Y0, Y1, K0, K1 = 170, 375, 160, 312, 176, 241
DEFAULT_SOURCE_SLICE = 208
WINDOW_LOW, WINDOW_HIGH = -100., 450.


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=REPO.parent/'celiac-ct-source'/'ART-THINS')
    parser.add_argument('--output', type=Path, default=REPO/'assets'/'celiac'/'ct')
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    if args.download:
        from download_idc_series import download_series
        download_series(IDC_UUID, args.source)
    files = list(args.source.glob('*.dcm'))
    datasets = [(pydicom.dcmread(p), p) for p in files]
    assert len(datasets) == 365, 'The full original series is required for geometry verification'
    first = datasets[0][0]
    orientation = np.asarray(first.ImageOrientationPatient, dtype=float).reshape(2,3)
    normal = np.cross(orientation[0], orientation[1])
    datasets.sort(key=lambda item:float(np.dot(np.asarray(item[0].ImagePositionPatient, dtype=float), normal)))
    first = datasets[0][0]
    for ds, _ in datasets:
        assert str(ds.Modality) == 'CT' and str(ds.PatientID) == PATIENT
        assert str(ds.SeriesInstanceUID) == SERIES
        assert str(ds.FrameOfReferenceUID) == str(first.FrameOfReferenceUID)
        assert np.allclose(np.asarray(ds.ImageOrientationPatient, dtype=float).reshape(2,3), orientation)
        assert np.allclose(np.asarray(ds.PixelSpacing, dtype=float), np.asarray(first.PixelSpacing, dtype=float))
        assert (int(ds.Rows), int(ds.Columns)) == (512,512)
    positions = np.asarray([ds.ImagePositionPatient for ds,_ in datasets], dtype=float)
    deltas = np.diff(positions, axis=0)
    dz = deltas @ normal
    assert np.allclose(dz,0.625,atol=1e-5)
    assert np.allclose(deltas,normal*0.625,atol=1e-5), 'Gantry tilt/irregular geometry is unsupported'
    spacing = [float(first.PixelSpacing[1]), float(first.PixelSpacing[0]), float(dz[0])]
    assert spacing == [0.703125,0.703125,0.625]
    lps_to_ras = np.asarray([-1.,-1.,1.])
    directions = np.asarray([orientation[0],orientation[1],normal])*lps_to_ras
    origin = positions[K0]*lps_to_ras + directions[0]*spacing[0]*X0 + directions[1]*spacing[1]*Y0
    planes = []
    source_slices = []
    instance_hashes = []
    selected_hu = []
    for k in range(K0,K1):
        ds, path = datasets[k]
        hu = ds.pixel_array.astype(np.float32)*float(ds.RescaleSlope)+float(ds.RescaleIntercept)
        assert str(ds.PhotometricInterpretation) == 'MONOCHROME2'
        selected_hu.append(hu[Y0:Y1,X0:X1])
        gray = np.rint(np.clip((hu-WINDOW_LOW)/(WINDOW_HIGH-WINDOW_LOW),0.,1.)*255.).astype(np.uint8)
        with openslide.ImageSlide(Image.fromarray(gray)) as slide:
            plane = np.asarray(slide.read_region((X0,Y0),0,(X1-X0,Y1-Y0)).convert('L'))
        planes.append(plane)
        source_slices.append({
            'index':k-K0, 'source_slice_index':k, 'InstanceNumber':int(ds.InstanceNumber),
            'SOPInstanceUID':str(ds.SOPInstanceUID),
            'ImagePositionPatient':positions[k].tolist(),
            'position_ras':(positions[k]*lps_to_ras).tolist(),
            'crop_origin_ras':(origin+directions[2]*spacing[2]*(k-K0)).tolist(),
        })
        instance_hashes.append({'SOPInstanceUID':str(ds.SOPInstanceUID),'sha256':sha(path.read_bytes())})
    volume = np.stack(planes)
    assert volume.shape == (K1-K0,Y1-Y0,X1-X0)
    raw = volume.tobytes(order='C')
    compressed = gzip.compress(raw,compresslevel=9,mtime=0)
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'arterial.u8.gz').write_bytes(compressed)
    Image.fromarray(volume[DEFAULT_SOURCE_SLICE-K0]).save(args.output/'preview.png',optimize=True)
    # This secondary static image is a maximum-intensity projection, not a
    # segmentation. Its exact source slice interval is recorded below.
    Image.fromarray(volume[194-K0:225-K0].max(axis=0)).save(args.output/'mip-preview.png',optimize=True)
    attribution = (
        'CPTAC-PDA / TCIA / NCI Imaging Data Commons\n'
        'License: Creative Commons Attribution 4.0 International (CC BY 4.0)\n'
        'https://creativecommons.org/licenses/by/4.0/\n\n'
        'National Cancer Institute Clinical Proteomic Tumor Analysis Consortium (CPTAC). '
        '(2018). The Clinical Proteomic Tumor Analysis Consortium Pancreatic Ductal '
        'Adenocarcinoma Collection (CPTAC-PDA) (Version 15) [dataset]. '
        'The Cancer Imaging Archive. https://doi.org/'+DOI+'\n\n'
        'Changes: native-spacing spatial crop, HU display window, 8-bit grayscale '
        'conversion, gzip compression and a maximum-intensity projection preview. '
        'No spatial resampling and no independent anatomical labels.\n'
        'Case: '+PATIENT+'; original series: '+SERIES+'\n'
        'Original collection page: '+SOURCE_URL+'\n'
    )
    (args.output/'ATTRIBUTION.txt').write_text(attribution,encoding='utf-8')
    provenance = {
        'patient_id':PATIENT,'series_instance_uid':SERIES,'idc_series_uuid':IDC_UUID,
        'source_instance_count':365,'selected_source_indices_half_open':[K0,K1],
        'crop_indices_half_open':{'x':[X0,X1],'y':[Y0,Y1],'z':[K0,K1]},
        'source_instances':instance_hashes,
        'download_integrity':'download_idc_series.py verifies each downloaded object against its public S3 ETag/MD5',
        'inspection':'Axial montage and 31-slice MIP inspected to choose a crop showing the enhanced celiac region and proximal branches.',
        'labels':'No published vessel segmentation is bundled; landmarks remain empty.',
        'mip_preview':{'source_indices_half_open':[194,225],'method':'maximum over source axial planes; no spatial interpolation'},
        'display_window_hu':{'min':WINDOW_LOW,'max':WINDOW_HIGH},
    }
    (args.output/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    manifest = {
        'id':'ct','anatomy':'celiac','title':'Tronco celíaco · TC arterial de cortes finos',
        'subtitle':'Paciente público C3L-02112 · TC real con contraste',
        'summary':'Recorte de TC arterial ART THINS de CPTAC-PDA. Los cortes conservan su tamaño y separación originales y muestran la región celíaca con sus ramas proximales. Es un paciente diferente al de la opción RM.',
        'modality':'CT','sequence':'ART THINS','patientId':PATIENT,
        'source':{
            'url':SOURCE_URL,'doi':DOI,'license':'CC BY 4.0','license_url':'https://creativecommons.org/licenses/by/4.0/',
            'citation':'National Cancer Institute Clinical Proteomic Tumor Analysis Consortium (CPTAC) (2018). The Clinical Proteomic Tumor Analysis Consortium Pancreatic Ductal Adenocarcinoma Collection (CPTAC-PDA), Version 15 [dataset]. The Cancer Imaging Archive. doi:'+DOI+'.',
            'collection':'CPTAC-PDA','patient_id':PATIENT,'series_instance_uid':SERIES,
            'study_instance_uid':str(first.StudyInstanceUID),'idc_series_uuid':IDC_UUID,
            'download_url':'https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID='+SERIES,
            'idc_bucket':'https://idc-open-data.s3.amazonaws.com/'+IDC_UUID+'/',
            'source_bytes':193178242,
            'integrity':'S3 ETag/MD5 verification during download; selected original instances additionally listed with SHA-256 in provenance.json.',
        },
        'resolution':'0,703125 × 0,703125 × 0,625 mm; 65 cortes originales del recorte, sin interpolación espacial.',
        'source_resolution':{'dimensions':[512,512,365],'spacing_mm':spacing,'dtype':'int16','sliceThickness_mm':float(first.SliceThickness),'manufacturer':str(first.Manufacturer),'model':str(first.ManufacturerModelName)},
        'display_resolution':{'dimensions':[X1-X0,Y1-Y0,K1-K0],'spacing_mm':spacing,'dtype':'uint8','resampled':False,'cropped':True},
        'volume':{
            'file':'arterial.u8.gz','url':'arterial.u8.gz','dimensions':[X1-X0,Y1-Y0,K1-K0],
            'spacing':spacing,'origin':origin.tolist(),'directions':directions.tolist(),
            'coordinateSystem':'RAS','coordinate_system':'RAS','units':'mm',
            'dtype':'uint8','encoding':'gzip','order':'x-fastest','sourceIndexOffset':[X0,Y0,K0],
            'window':{'center':175,'width':550,'source_min':WINDOW_LOW,'source_max':WINDOW_HIGH,'units':'HU','method':'fixed CT display window for the enhanced arteries'},
            'sliceThickness':float(first.SliceThickness),'sha256Raw':sha(raw),'sha256Compressed':sha(compressed),
        },
        'defaultSlice':DEFAULT_SOURCE_SLICE-K0,'defaultRadius':10,
        'landmarks':[],'meshes':[],'source_slices':source_slices,
        'sourceOriginalSliceNumbers':[p['InstanceNumber'] for p in source_slices],
        'processing':{
            'dicomDecoder':'pydicom '+pydicom.__version__,
            'planeReader':'OpenSlide ImageSlide.read_region '+openslide.__version__,
            'openslideRole':'Lectura del recorte de cada imagen ya decodificada por pydicom y transformada a una ventana HU.',
            'geometry':'Recorte en la rejilla DICOM original, ordenado por posición física y convertido de LPS a RAS. Sin interpolación espacial.',
            'intensityWindow':'Ventana fija -100 a 450 HU, convertida a escala de grises de 8 bits para visualización web.',
        },
        'limitations':[
            'TC arterial clínica convencional; esta adquisición no es TC con conteo de fotones.',
            'El caso C3L-02112 es distinto del C3L-03129 de la opción RM; las vistas no están registradas entre sí.',
            'La ventana HU se guarda como 8 bits de visualización; este archivo web no sustituye el DICOM original para medir HU.',
            'No se incluyen segmentaciones originales de las ramas arteriales ni etiquetas anatómicas individuales para esta serie.',
            'El apilado y la MIP muestran los valores de imagen; no aíslan automáticamente una arteria del tejido vecino.',
            'La serie se ofrece como material público para exploración anatómica; no se presenta como una referencia clínica validada o gold standard.',
        ],
        'files':{},
    }
    for name in ['arterial.u8.gz','preview.png','mip-preview.png','ATTRIBUTION.txt','provenance.json']:
        data=(args.output/name).read_bytes()
        manifest['files'][name]={'bytes':len(data),'sha256':sha(data)}
    (args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    assert gzip.decompress((args.output/'arterial.u8.gz').read_bytes()) == raw
    print(json.dumps({'dimensions':manifest['volume']['dimensions'],'spacing':spacing,'origin':origin.tolist(),'gzip_bytes':len(compressed),'defaultSlice':manifest['defaultSlice'],'output':str(args.output)},indent=2))


if __name__ == '__main__':
    main()
