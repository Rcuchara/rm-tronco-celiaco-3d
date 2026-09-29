"""Prepare an individual patient's actual CISS MRI and published RTSTRUCT.

Source: TCIA Vestibular-Schwannoma-SEG, VS-SEG-023, CC BY 4.0.
Requires numpy, Pillow, pydicom, openslide-python and an OpenSlide runtime.
DICOM is decoded by pydicom. OpenSlide ImageSlide.read_region reads each
windowed, prepared image plane; it is not used as a native DICOM MR decoder.
No CT, synthetic anatomy, atlas average, surface mesh or spatial upsampling.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile
import numpy as np
import pydicom
from PIL import Image, TiffImagePlugin
import openslide
import tifffile

REPO = Path(__file__).resolve().parents[1]
SERIES = '1.3.6.1.4.1.14519.5.2.1.239006515845888908570518896552813145905'
RTSERIES = '1.3.6.1.4.1.14519.5.2.1.180401697177051449426455496944505107802'
MRI_ZIP = 'VS-SEG-023-CISS.zip'
RT_ZIP = 'RTSTRUCT-180401697177051449426455496944505107802.zip'
SOURCE_URL = 'https://www.cancerimagingarchive.net/collection/vestibular-schwannoma-seg/'


def load_zip(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None, 'ZIP CRC validation failed'
        images = [pydicom.dcmread(io.BytesIO(z.read(n))) for n in z.namelist() if n.endswith('.dcm')]
        license_text = z.read('LICENSE') if 'LICENSE' in z.namelist() else None
    return images, license_text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=REPO.parent/'ear-source'/'tcia')
    parser.add_argument('--output', type=Path, default=REPO/'assets'/'ear'/'mri')
    parser.add_argument('--deliverables', type=Path, default=REPO.parents[1]/'outputs')
    parser.add_argument('--download', action='store_true', help='Download the public MR and RTSTRUCT ZIPs from TCIA if missing.')
    args = parser.parse_args()
    if args.download:
        args.source.mkdir(parents=True,exist_ok=True)
        for filename,uid in [(MRI_ZIP,SERIES),(RT_ZIP,RTSERIES)]:
            target=args.source/filename
            if not target.exists():
                url='https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID='+uid
                pending=target.with_suffix('.download')
                with urllib.request.urlopen(url,timeout=120) as response,pending.open('wb') as output:
                    shutil.copyfileobj(response,output)
                with zipfile.ZipFile(pending) as archive:
                    assert archive.testzip() is None
                pending.replace(target)
    slices, license_text = load_zip(args.source/MRI_ZIP)
    rtsets, _ = load_zip(args.source/RT_ZIP)
    rt = rtsets[0]
    iop = np.array(slices[0].ImageOrientationPatient, dtype=float).reshape(2,3)
    normal = np.cross(iop[0],iop[1])
    slices.sort(key=lambda ds:np.dot(np.asarray(ds.ImagePositionPatient,dtype=float),normal))
    positions = np.array([list(map(float,ds.ImagePositionPatient)) for ds in slices])
    dz = np.diff(positions@normal)
    assert len(slices)==80 and np.allclose(dz,dz[0],atol=1e-5)
    assert all(str(ds.Modality)=='MR' and str(ds.SeriesInstanceUID)==SERIES for ds in slices)
    assert all(np.allclose(np.asarray(ds.ImageOrientationPatient,dtype=float).reshape(2,3),iop) for ds in slices)
    frame = str(slices[0].FrameOfReferenceUID)
    rt_refs = rt.ReferencedFrameOfReferenceSequence
    assert any(str(ref.FrameOfReferenceUID)==frame for ref in rt_refs)
    referenced_series = [str(ref.SeriesInstanceUID) for fr in rt_refs for study in fr.RTReferencedStudySequence for ref in study.RTReferencedSeriesSequence]
    assert referenced_series == [SERIES]
    ds0 = slices[0]
    spacing = np.array([float(ds0.PixelSpacing[1]),float(ds0.PixelSpacing[0]),float(dz[0])])
    dirs_lps = np.array([iop[0],iop[1],normal])
    affine_lps = np.eye(4); affine_lps[:3,:3] = (dirs_lps*spacing[:,None]).T; affine_lps[:3,3] = positions[0]
    inverse_lps = np.linalg.inv(affine_lps)
    flip = np.array([-1,-1,1])
    roi_names = {int(r.ROINumber):str(r.ROIName) for r in rt.StructureSetROISequence}
    roi_lookup = {roi_names[int(r.ReferencedROINumber)]:r for r in rt.ROIContourSequence}
    cochlea_points = np.concatenate([np.asarray(c.ContourData,dtype=float).reshape(-1,3) for c in roi_lookup['Cochlea'].ContourSequence])
    center_lps = (cochlea_points.min(0)+cochlea_points.max(0))/2
    center_voxel = (inverse_lps@np.r_[center_lps,1])[:3]
    # 45 x 45 x 41 mm field; keep acquired samples at their original positions.
    first = np.maximum(np.rint(center_voxel).astype(int)-[48,48,20],0)
    stop = np.minimum(first+[96,96,41],[int(ds0.Columns),int(ds0.Rows),len(slices)])
    center = float(ds0.WindowCenter); width=float(ds0.WindowWidth)
    low=center-width/2; high=center+width/2
    args.output.mkdir(parents=True,exist_ok=True)
    args.deliverables.mkdir(parents=True,exist_ok=True)
    planes=[]; rows=[]; plane_provenance=[]
    for global_z in range(first[2],stop[2]):
        ds=slices[global_z]
        pixels=ds.pixel_array.astype(np.float32)*float(ds.get('RescaleSlope',1))+float(ds.get('RescaleIntercept',0))
        image8=np.clip(np.rint((pixels-low)*255/(high-low)),0,255).astype('u1')
        with openslide.ImageSlide(Image.fromarray(image8)) as slide:
            region=slide.read_region((int(first[0]),int(first[1])),0,(int(stop[0]-first[0]),int(stop[1]-first[1]))).convert('L')
        cropped=np.asarray(region,dtype='u1')
        assert np.array_equal(cropped,image8[first[1]:stop[1],first[0]:stop[0]])
        rows.append(cropped)
        plane_provenance.append({'index':int(global_z-first[2]),'source_slice_index':int(global_z),
                                 'instance_number':int(ds.InstanceNumber),'sop_instance_uid':str(ds.SOPInstanceUID),
                                 'position_ras':(positions[global_z]*flip).tolist(),
                                 'crop_origin_ras':((positions[global_z]+iop[0]*spacing[0]*first[0]+iop[1]*spacing[1]*first[1])*flip).tolist(),
                                 'ImagePositionPatient':positions[global_z].tolist(),
                                 'SOPInstanceUID':str(ds.SOPInstanceUID),'InstanceNumber':int(ds.InstanceNumber)})
    volume_array=np.stack(rows)
    (args.output/'ciss.u8.gz').write_bytes(gzip.compress(volume_array.tobytes(),compresslevel=9,mtime=0))
    roi_origin_lps=(affine_lps@np.r_[first,1])[:3]
    volume={'file':'ciss.u8.gz','url':'ciss.u8.gz','dimensions':volume_array.shape[::-1],
            'spacing':spacing.tolist(),'origin':(roi_origin_lps*flip).tolist(), 'directions':(dirs_lps*flip).tolist(),
            'coordinateSystem':'RAS','coordinate_system':'RAS','units':'mm','dtype':'uint8','encoding':'gzip','order':'x-fastest',
            'sourceIndexOffset':first.tolist(),'window':{'center':center,'width':width,'source_min':low,'source_max':high,'method':'DICOM display window'},
            'sliceThickness':float(ds0.SliceThickness)}
    volume['dimensions']=list(volume['dimensions'])
    volume['sourceOriginalSliceNumbers']=[p['instance_number'] for p in plane_provenance]
    volume['sha256Raw']=hashlib.sha256(volume_array.tobytes()).hexdigest()
    volume['sha256Compressed']=hashlib.sha256((args.output/'ciss.u8.gz').read_bytes()).hexdigest()
    sop_to_z={str(ds.SOPInstanceUID):z for z,ds in enumerate(slices)}
    landmarks=[]; contours=[]
    for roi_name, id, name, color in [('Cochlea','cochlea','Cóclea · contorno original','#55e2cf'),('TV','tumor','Tumor · ROI TV original','#ff9d93')]:
        roi=roi_lookup[roi_name]
        all_points=[]; paths=[]
        for contour in roi.ContourSequence:
            points=np.asarray(contour.ContourData,dtype=float).reshape(-1,3)
            all_points.append(points)
            refs=[str(ref.ReferencedSOPInstanceUID) for ref in contour.ContourImageSequence]
            assert all(ref in sop_to_z for ref in refs)
            center_k=float((inverse_lps@np.r_[points.mean(0),1])[2])
            if first[2]<=center_k<stop[2]:
                paths.append({'sliceIndex':int(round(center_k)-first[2]),'sourceSliceIndex':int(round(center_k)),
                              'points':(points*flip).tolist(),'geometry':str(contour.ContourGeometricType),'referencedSOPInstanceUIDs':refs})
        all_points=np.concatenate(all_points)
        p=(all_points.min(0)+all_points.max(0))/2
        vox=(inverse_lps@np.r_[p,1])[:3]-first
        landmarks.append({'id':id,'name':name,'source_name':roi_name,'position':(p*flip).tolist(),'color':color,
                          'sliceIndex':int(round(vox[2])),'voxel':vox.tolist(),'source':'Contorno RTSTRUCT original de los autores',
                          'derivation':'Marcador calculado como centro de la caja de los contornos publicados; no es una identificación nueva.'})
        contours.append({'id':id,'name':name,'source_name':roi_name,'color':color,'paths':paths})
    (args.output/'contours.json').write_text(json.dumps(contours,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    selected=int(round(center_voxel[2]))-int(first[2])
    source_selected=slices[selected+first[2]]
    tiff_name='Oido_RM_CISS_VS-SEG-023_corte_coclea.tiff'
    tags=TiffImagePlugin.ImageFileDirectory_v2()
    tags[270]=json.dumps({'modality':'MR','series':'CISS','patient_public_id':'VS-SEG-023',
                         'pixel_spacing_mm':spacing[:2].tolist(),'slice_thickness_mm':float(ds0.SliceThickness),
                         'source_sop_instance_uid':str(source_selected.SOPInstanceUID),'window_center':center,'window_width':width,
                         'note':'Actual MRI plane, cropped and windowed to uint8. Not a microscopy slide. No optical magnification or microns-per-pixel metadata.'})
    rgb=np.repeat(volume_array[selected,:,:,None],3,axis=2)
    tifffile.imwrite(args.deliverables/tiff_name,rgb,tile=(128,128),photometric='rgb',metadata=None,
                     description=tags[270],resolutionunit='NONE')
    with openslide.OpenSlide(str(args.deliverables/tiff_name)) as slide:
        assert slide.dimensions == (96,96)
        assert np.array_equal(np.asarray(slide.read_region((0,0),0,(96,96)).convert('RGB')),rgb)
    Image.fromarray(volume_array[selected]).save(args.output/'preview.png')
    if license_text:(args.output/'TCIA-LICENSE.txt').write_bytes(license_text)
    hashes={f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in args.output.iterdir() if f.name not in {'manifest.json','ATTRIBUTION.md'}}
    source={'url':SOURCE_URL,'doi':'10.7937/TCIA.9YTJ-5Q73','license':'CC BY 4.0','license_url':'https://creativecommons.org/licenses/by/4.0/',
            'citation':'Shapey J, Kujawa A, Dorent R, Wang G, Bisdas S, Dimitriadis A, Grishchuck D, Paddick I, Kitchen N, Bradford R, Saeed S, Ourselin S, Vercauteren T (2021). Segmentation of Vestibular Schwannoma from Magnetic Resonance Imaging: An Open Annotated Dataset and Baseline Algorithm (version 2). The Cancer Imaging Archive. doi:10.7937/TCIA.9YTJ-5Q73.',
            'collection':'Vestibular-Schwannoma-SEG','patient_id':'VS-SEG-023','series_instance_uid':SERIES,'rtstruct_series_instance_uid':RTSERIES,
            'archive_sha256':hashlib.sha256((args.source/MRI_ZIP).read_bytes()).hexdigest(),
            'rtstruct_archive_sha256':hashlib.sha256((args.source/RT_ZIP).read_bytes()).hexdigest(),
            'download_url':'https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID='+SERIES,
            'rtstruct_download_url':'https://services.cancerimagingarchive.net/nbia-api/services/v1/getImage?SeriesInstanceUID='+RTSERIES,
            'integrity':'CRC of every source ZIP member checked; MR Series UID and RTSTRUCT Frame/Series/SOP references checked.'}
    manifest={'id':'mri','title':'Oído interno · resonancia CISS 3D','subtitle':'Paciente público VS-SEG-023 · imágenes reales',
              'summary':'Cortes de una resonancia magnética CISS real de un paciente de TCIA, superpuestos en su posición física original. Las referencias de cóclea y tumor proceden de los contornos publicados para esta misma serie.',
              'modality':'MR','sequence':str(ds0.SeriesDescription),'patientId':'VS-SEG-023','source':source,
              'resolution':'0,46875 × 0,46875 × 1 mm; 41 cortes del recorte, sin aumentar la resolución espacial.',
              'source_resolution':{'dimensions':[int(ds0.Columns),int(ds0.Rows),len(slices)],'spacing_mm':spacing.tolist(),'dtype':'uint16','storedBits':int(ds0.BitsStored),'fieldStrengthTesla':float(ds0.MagneticFieldStrength)},
              'display_resolution':{'dimensions':volume['dimensions'],'spacing_mm':spacing.tolist(),'dtype':'uint8','resampled':False,'cropped':True},
              'volume':volume,'landmarks':landmarks,'contours':{'file':'contours.json','url':'contours.json','coordinateSystem':'RAS'},
              'meshes':[],'defaultSlice':selected,'planes':plane_provenance,'source_slices':plane_provenance,
              'sourceOriginalSliceNumbers':volume['sourceOriginalSliceNumbers'],
              'processing':{'dicomDecoder':'pydicom '+pydicom.__version__,'planeReader':'OpenSlide ImageSlide.read_region '+openslide.__version__,
                            'openslideRole':'Lee regiones de imágenes PIL preparadas después de decodificar DICOM y aplicar ventana. No decodifica la RM de forma nativa.',
                            'intensityWindow':'Ventana DICOM original: centro 278, ancho 637. Conversión a 8 bits para visualización.',
                            'geometry':'Recorte sin interpolación; posiciones y orientación DICOM convertidas de LPS a RAS.',
                            'notIncluded':'Ningún atlas promedio, CT, microCT, superficie sintética o reconstrucción de mallas.'},
              'limitations':['La resolución adquirida es anisótropa: 0,46875 × 0,46875 mm en cada plano y 1 mm entre cortes. El zoom no añade detalle.',
                             'La serie pertenece a un paciente de una colección de schwannomas vestibulares; no es un atlas de anatomía normal.',
                             'La cóclea y el tumor tienen contornos originales publicados. Los otros conductos y canalículos no tienen etiquetas independientes en esta serie.',
                             'Los canalículos óseos muy finos, células ciliadas y órgano de Corti no se pueden resolver individualmente con esta adquisición.',
                             'Los marcadores se derivan del centro de los contornos originales; no son un diagnóstico ni una segmentación nueva.'],
              'files':hashes}
    (args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    (args.output/'ATTRIBUTION.md').write_text('# RM CISS real: VS-SEG-023\n\n'+source['citation']+'\n\n[Fuente]('+SOURCE_URL+') · [CC BY 4.0]('+source['license_url']+'). Consulte TCIA-LICENSE.txt.\n\n'
        'Modificaciones: recorte del oído alrededor del contorno Cochlea, conversión de la ventana DICOM a 8 bits, compresión gzip y conversión de coordenadas LPS a RAS. Se mantienen el espaciado y las posiciones originales; no se interpolan cortes nuevos.\n\n'
        'pydicom decodifica los DICOM. OpenSlide ImageSlide.read_region lee las regiones de los planos preparados. OpenSlide no se presenta como decodificador nativo de resonancias. Las etiquetas y contornos de cóclea y tumor derivan del RTSTRUCT original, con referencias a esta misma serie verificadas.\n\n'
        'La serie original contiene 80 imágenes; se publican '+str(volume['dimensions'][2])+' cortes recortados. Los datos no son un atlas promedio, ni CT, ni una malla de anatomía.\n',encoding='utf8')
    print(json.dumps({'volume':volume,'defaultSlice':selected,'landmarks':landmarks,'sourceFrame':frame,'tiff':str(args.deliverables/tiff_name),'files':hashes},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
