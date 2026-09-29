"""Prepare F01 as an optional ex-vivo microCT reference with real image slices.

Requires NumPy and Pillow. No resampling or invented anatomical labels.
Usage: python scripts/prepare-ear-reference.py --source ../ear-source/F01.zip
Source: https://doi.org/10.5281/zenodo.3355272 (CC BY 4.0).
NIfTI, the authors' PLY surface and descriptor share physical millimetres.
Scanner RAS is retained numerically, but anatomy relative to the specimen's
scanner axes is not verified: the display coordinate system is 'specimen'.
No registration to the separate MRI patient is implied.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import zipfile

import numpy as np
from PIL import Image

ARCHIVE_MD5 = "52f9f4f5bc8ea6a76015f0936d74afb3"
REPO = Path(__file__).resolve().parents[1]
LANDMARK_SOURCE = "https://pmc.ncbi.nlm.nih.gov/articles/PMC6864122/"
LANDMARK_NAMES = {
    "RW": ("Ventana redonda", "Centro de la ventana redonda; referencia original RW de los autores."),
    "C": ("Centro de la vuelta basal", "Centro de la vuelta basal de la cóclea; referencia original C de los autores."),
    "A": ("Helicotrema", "Referencia apical de la cóclea identificada como helicotrema; código original A."),
    "OW": ("Ventana oval", "Centro de la ventana oval; referencia original OW de los autores."),
    "V": ("Centro del vestíbulo", "Centro del vestíbulo; referencia original V de los autores."),
}


def read_nifti(blob):
    if struct.unpack_from("<i", blob)[0] != 348:
        raise ValueError("Expected little-endian NIfTI-1.")
    dim = struct.unpack_from("<8h", blob, 40)
    if dim[0] != 3:
        raise ValueError("Expected a three-dimensional volume.")
    shape = tuple(dim[1:4])
    datatype = struct.unpack_from("<h", blob, 70)[0]
    dtype = {2: np.dtype("u1"), 4: np.dtype("<i2")}[datatype]
    pixdim = struct.unpack_from("<8f", blob, 76)
    offset, slope, intercept = struct.unpack_from("<3f", blob, 108)
    data = np.frombuffer(blob, dtype=dtype, count=math.prod(shape), offset=int(offset))
    if data.size != math.prod(shape):
        raise ValueError("Unexpected NIfTI voxel count.")
    if slope != 0:
        data = data.astype(np.float32) * slope + intercept
    qform, sform = struct.unpack_from("<2h", blob, 252)
    if sform:
        affine = np.eye(4)
        affine[:3, :] = np.array(struct.unpack_from("<12f", blob, 280)).reshape(3, 4)
    elif qform:
        b, c, d, x, y, z = struct.unpack_from("<6f", blob, 256)
        a = math.sqrt(max(0, 1 - b*b - c*c - d*d))
        rotation = np.array([
            [a*a+b*b-c*c-d*d, 2*b*c-2*a*d, 2*b*d+2*a*c],
            [2*b*c+2*a*d, a*a+c*c-b*b-d*d, 2*c*d-2*a*b],
            [2*b*d-2*a*c, 2*c*d+2*a*b, a*a+d*d-c*c-b*b],
        ])
        affine = np.eye(4)
        affine[:3, :3] = rotation @ np.diag([pixdim[1], pixdim[2], pixdim[3] * (-1 if pixdim[0] < 0 else 1)])
        affine[:3, 3] = [x, y, z]
    else:
        raise ValueError("Physical orientation is unspecified.")
    spacing = np.linalg.norm(affine[:3, :3], axis=0)
    directions = (affine[:3, :3] / spacing).T
    return data, {
        "dimensions": list(shape), "spacing": spacing.tolist(),
        "origin": affine[:3, 3].tolist(), "directions": directions.tolist(),
        "affine": affine.tolist(), "coordinate_system": "specimen",
        "coordinateSystem": "specimen", "sourceCoordinateSystem": "NIfTI scanner RAS",
        "units": "mm",
    }


def read_ply(blob):
    stream = io.StringIO(blob.decode("ascii"))
    assert stream.readline().strip() == "ply"
    nvertices = nfaces = None
    while (line := stream.readline().strip()) != "end_header":
        if line.startswith("format") and line != "format ascii 1.0":
            raise ValueError("Expected ASCII PLY.")
        if line.startswith("element vertex"):
            nvertices = int(line.split()[-1])
        if line.startswith("element face"):
            nfaces = int(line.split()[-1])
    positions = np.loadtxt([stream.readline() for _ in range(nvertices)], dtype=np.float32)
    records = np.loadtxt([stream.readline() for _ in range(nfaces)], dtype=np.uint32)
    if not np.all(records[:, 0] == 3):
        raise ValueError("Nontriangular source mesh.")
    indices = records[:, 1:4].copy()
    if indices.max() >= nvertices or not np.all(np.isfinite(positions)):
        raise ValueError("Invalid source mesh.")
    # Area-weighted vertex normals preserve the original surface and connectivity.
    triangles = positions[indices]
    face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals = np.zeros_like(positions)
    for corner in range(3):
        np.add.at(normals, indices[:, corner], face_normals)
    norm = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(norm[:, None], 1e-12)
    return positions, normals, indices


def write_glb(path, positions, normals, indices):
    chunks = [positions.astype("<f4").tobytes(), normals.astype("<f4").tobytes(), indices.astype("<u4").tobytes()]
    offsets = [0, len(chunks[0]), len(chunks[0]) + len(chunks[1])]
    raw = b"".join(chunks)
    model = {
        "asset": {"version": "2.0", "generator": "prepare-ear-reference.py; original author geometry unchanged"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "F01 bony labyrinth"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
        "materials": [{"name": "Laberinto óseo", "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [0.93, 0.72, 0.40, 1], "metallicFactor": 0, "roughnessFactor": 0.48}}],
        "buffers": [{"byteLength": len(raw)}],
        "bufferViews": [{"buffer": 0, "byteOffset": offsets[i], "byteLength": len(chunk), "target": 34963 if i == 2 else 34962} for i, chunk in enumerate(chunks)],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": positions.min(axis=0).tolist(), "max": positions.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": indices.size, "type": "SCALAR"},
        ],
        "extras": {"coordinate_system": "specimen", "coordinateSystem": "specimen", "units": "mm", "sourceCoordinateSystem": "NIfTI scanner RAS", "note": "Numeric source coordinates preserved; patient anatomical orientation is not verified. No glTF metre conversion applied."},
    }
    header = json.dumps(model, ensure_ascii=False, separators=(",", ":")).encode("utf8")
    header += b" " * (-len(header) % 4)
    raw += b"\0" * (-len(raw) % 4)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(header) + 8 + len(raw))
                     + struct.pack("<I4s", len(header), b"JSON") + header
                     + struct.pack("<I4s", len(raw), b"BIN\0") + raw)


def write_gzip(path, array):
    # Fixed timestamp gives reproducible bytes and checksums.
    path.write_bytes(gzip.compress(array.tobytes(), compresslevel=9, mtime=0))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=REPO.parent / "ear-source" / "F01.zip")
    parser.add_argument("--output", type=Path, default=REPO / "assets" / "ear" / "reference")
    args = parser.parse_args()
    archive = args.source.read_bytes()
    if hashlib.md5(archive).hexdigest() != ARCHIVE_MD5:
        raise ValueError("The F01 source archive checksum does not match Zenodo.")
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError("A source ZIP member failed its CRC checksum.")
        # Read exact member names without extracting untrusted archive paths.
        raw, meta = read_nifti(z.read("F01/uCT/F01_uCT_RAW.nii"))
        labels, labels_meta = read_nifti(z.read("F01/uCT/F01_uCT_LABELS.nii"))
        descriptor = json.loads(z.read("F01/F01_DESC.json"))
        positions, normals, indices = read_ply(z.read("F01/uCT/F01_uCT_SURF.ply"))
    assert meta == labels_meta, "MicroCT image and segmentation must share one geometry."
    assert set(np.unique(labels)).issubset({0, 1}), "Unexpected segmentation labels."
    assert descriptor["SIDE"] == "LEFT"
    bounds = [positions.min(axis=0).tolist(), positions.max(axis=0).tolist()]
    inv_affine = np.linalg.inv(np.asarray(meta["affine"]))
    voxel_vertices = (np.c_[positions, np.ones(len(positions))] @ inv_affine.T)[:, :3]
    assert np.all(voxel_vertices.min(axis=0) >= -1) and np.all(voxel_vertices.max(axis=0) < np.asarray(meta["dimensions"]) + 1)
    # Confirm that every original PLY vertex lies next to the NIfTI mask boundary.
    # The surface was smoothed by the source authors, so exact voxel centres are
    # not expected to lie on it. A 3x3x3 neighbourhood is a one-voxel tolerance.
    shape = np.array(meta["dimensions"])
    ijk = np.rint(voxel_vertices).astype(int)
    label_array = labels.reshape(tuple(shape[::-1]))
    inside = np.zeros(len(positions), dtype=bool)
    outside = np.zeros(len(positions), dtype=bool)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                q = np.clip(ijk + [dx, dy, dz], 0, shape - 1)
                values = label_array[q[:, 2], q[:, 1], q[:, 0]]
                inside |= values > 0
                outside |= values == 0
    assert np.all(inside & outside), "Source surface is not registered to the mask boundary."
    # Preserve every acquired sample spatially; only compress its display range.
    # Percentiles prevent isolated saturated pixels from washing out the bone.
    low, high = np.percentile(raw, [0.5, 99.5]).tolist()
    display = np.clip(np.rint((raw.astype(np.float32) - low) * 255 / (high - low)), 0, 255).astype(np.uint8)
    args.output.mkdir(parents=True, exist_ok=True)
    write_gzip(args.output / "microct.u8.gz", display)
    write_gzip(args.output / "labyrinth-mask.u8.gz", labels.astype(np.uint8))
    write_glb(args.output / "labyrinth.glb", positions, normals, indices)
    foreground = labels.reshape(tuple(shape[::-1])) > 0
    default_slice = int(np.argmax(foreground.sum(axis=(1, 2))))
    Image.fromarray(display.reshape(tuple(shape[::-1]))[default_slice]).save(args.output / "preview.png")
    source = {
        "url": "https://zenodo.org/records/3355272", "doi": "10.5281/zenodo.3355272",
        "citation": "Wimmer W, Anschuetz L, Weder S, Wagner F, Delingette H, Caversaccio M (2019). Human Bony Labyrinth: Co-Registered CT and micro-CT Images, Surface Models and Anatomical Landmarks. Zenodo.",
        "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "archive": "F01.zip", "archive_md5": ARCHIVE_MD5,
        "archive_sha256": hashlib.sha256(archive).hexdigest(),
        "download_url": "https://zenodo.org/records/3355272/files/F01.zip?download=1",
        "image_file": "F01/uCT/F01_uCT_RAW.nii",
        "mask_file": "F01/uCT/F01_uCT_LABELS.nii",
        "surface_file": "F01/uCT/F01_uCT_SURF.ply",
        "specimen_id": "F01", "specimen_type": "Human temporal bone specimen, ex vivo",
        "article_url": LANDMARK_SOURCE,
    }
    manifest = {
        "id": "reference", "title": "MicroTC F01 · referencia ex vivo", "side": "left",
        "subtitle": "Espécimen humano F01 · laberinto óseo · microTC real",
        "summary": "Cortes microTC de un espécimen humano y segmentación original del laberinto óseo. Referencia ex vivo de una muestra distinta del paciente de RM.",
        "modality": "microCT", "modalityLabel": "MicroTC ex vivo", "exVivo": True,
        "patientId": None, "specimenId": "F01", "registeredToMRI": False,
        "source": source, "coordinate_system": "specimen", "coordinateSystem": "specimen", "units": "mm", "bounds": bounds,
        "resolution": "Vóxel adquirido de aproximadamente 60,7 µm (0,0607 mm); 348 cortes completos, sin interpolación espacial.",
        "orientation_note": "Geometría original del espécimen en milímetros. Los ejes X/Y/Z conservan los valores NIfTI y de la superficie, pero no certifican R/L/A/P/S/I de una cabeza. No hay registro con el paciente de RM.",
        "source_resolution": {"spacing_mm": meta["spacing"], "dimensions": meta["dimensions"], "dtype": "int16"},
        "display_resolution": {"spacing_mm": meta["spacing"], "dimensions": meta["dimensions"], "dtype": "uint8", "resampled": False},
        "volume": {"file": "microct.u8.gz", "url": "microct.u8.gz", **meta, "dtype": "uint8", "encoding": "gzip", "order": "x-fastest",
                   "window": {"source_min": low, "source_max": high, "percentiles": [0.5, 99.5], "method": "Percentile display window; no spatial resampling"}, "mask_url": "labyrinth-mask.u8.gz",
                   "sha256Raw": hashlib.sha256(display.tobytes()).hexdigest()},
        "mask": {"file": "labyrinth-mask.u8.gz", "url": "labyrinth-mask.u8.gz", **meta, "dtype": "uint8", "encoding": "gzip", "order": "x-fastest",
                 "source": "Original authors' binary segmentation: F01/uCT/F01_uCT_LABELS.nii",
                 "sha256Raw": hashlib.sha256(labels.astype(np.uint8).tobytes()).hexdigest(),
                 "background": 0, "foregroundVoxelCount": int(np.count_nonzero(labels)),
                 "labels": [{"value": 1, "id": "bony-labyrinth", "name": "Laberinto óseo", "color": "#edb866"}]},
        "surface": {"file": "labyrinth.glb", "url": "labyrinth.glb", "coordinateSystem": "specimen", "units": "mm",
                    "source": "Original authors' PLY surface F01/uCT/F01_uCT_SURF.ply, derived from the published binary segmentation; converted to GLB without simplification.",
                    "bounds": bounds, "transform": np.eye(4).tolist(), "registeredToVolume": True,
                    "vertices": len(positions), "triangles": len(indices), "segmentationLabel": 1,
                    "color": "#edb866", "colorMeaning": "Display color for the whole source segmentation; no separate anatomical parts inferred."},
        "meshes": [{"id": "bony-labyrinth", "name": "Laberinto óseo", "description": "Superficie original segmentada del laberinto óseo; conserva cóclea, vestíbulo y canales como una estructura conectada.", "file": "labyrinth.glb", "color": "#edb866", "defaultVisible": True, "vertices": len(positions), "triangles": len(indices), "source_file": "F01/uCT/F01_uCT_SURF.ply", "segmentation_label": 1}],
        "landmarks": [{"id": key, "name": LANDMARK_NAMES[key][0], "description": LANDMARK_NAMES[key][1], "source_name": key, "source_url": LANDMARK_SOURCE, "source_table": 2, "position": value,
                       "voxel": (inv_affine @ np.r_[value, 1])[:3].tolist(),
                       "sliceIndex": int(round((inv_affine @ np.r_[value, 1])[2])),
                       "color": "#edb866", "source": "Original authors' descriptor F01/F01_DESC.json",
                       "derivation": "Published source landmark; anatomical name follows source article Table 2."} for key, value in descriptor["LANDMARKS"].items()],
        "defaultSlice": default_slice,
        "sourceOriginalSliceNumbers": list(range(1, int(shape[2]) + 1)),
        "processing": {
            "geometry": "Original NIfTI dimensions, spacing and numeric coordinates preserved; no crop, interpolation or spatial resampling. Specimen X/Y/Z orientation.",
            "intensityWindow": "Source int16 values mapped to uint8 with percentile 0.5–99.5 window for display.",
            "segmentation": "Original binary image labels retained voxel-for-voxel. No new subdivision or segmentation.",
            "surface": "Original PLY positions and triangles preserved in GLB; only vertex normals computed. Same physical coordinates as image and mask.",
        },
        "cochlear_coordinate_system": descriptor["COORD"],
        "validation": {"source_checksum": "verified", "image_mask_geometry": "identical", "surface_vertices_near_mask_boundary_fraction": float(np.mean(inside & outside)), "surface_mask_tolerance_voxels": 1, "label_values": [0, 1]},
        "limitations": [
            "La segmentación original es una sola superficie del laberinto óseo: no contiene etiquetas separadas para cada canal, cóclea o vestíbulo.",
            "Se conserva la resolución espacial de la adquisición (~60.7 micrómetros); convertir la intensidad a 8 bits reduce su rango y no añade detalle anatómico.",
            "Las cinco referencias anatómicas proceden de los autores y sus nombres se documentan en la tabla 2 del artículo de datos; los puntos no son segmentaciones de cada estructura.",
            "Esta adquisición no resuelve células ciliadas ni el órgano de Corti. No incluye etiquetas separadas de huesecillos, nervios o laberinto membranoso.",
            "La superficie representa el volumen segmentado del laberinto óseo; su color no identifica tipos de tejido.",
            "Referencia ex vivo: es otra muestra, no una mejora, registro ni diagnóstico del paciente mostrado en RM.",
            "El tamaño de vóxel es el muestreo de la imagen y no una medición independiente de su resolución efectiva.",
        ],
    }
    checksums = {}
    for file in sorted(args.output.glob("*")):
        if file.suffix in {".gz", ".glb", ".png"}:
            checksums[file.name] = {"bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
    manifest["files"] = checksums
    for entry in ("volume", "mask", "surface"):
        item = checksums[manifest[entry]["file"]]
        manifest[entry]["sha256"] = item["sha256"]
        manifest[entry]["bytes"] = item["bytes"]
    manifest["volume"]["sha256Compressed"] = manifest["volume"]["sha256"]
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    (args.output / "ATTRIBUTION.txt").write_text(
        "# F01: laberinto óseo humano\n\n" + source["citation"] + "\n\n"
        + "[Fuente y descarga](" + source["url"] + ") · [Licencia CC BY 4.0](" + source["license_url"] + ").\n\n"
        + "Modificaciones: NIfTI microCT a uint8 con ventana percentil 0.5–99.5; máscara binaria comprimida; PLY a GLB con normales de vértice calculadas. Se conservan la matriz de adquisición, el espaciado físico, las coordenadas RAS en milímetros y todos los vértices y triángulos de la superficie original. Los colores son de presentación. Los archivos no incorporan las imágenes clínicas CT del mismo archivo ZIP.\n\n"
        + "El fichero GLB conserva unidades médicas milimétricas, en lugar de convertirlas a metros. Las coordenadas numéricas RAS del NIfTI se conservan para el espécimen; no certifican orientación anatómica de una cabeza. Visor: ejes del espécimen X/Y/Z. La muestra ex vivo no está registrada al paciente de RM. El órgano de Corti, células ciliadas y canalículos microscópicos no están segmentados individualmente.\n", encoding="utf8")
    print(json.dumps({"dimensions": meta["dimensions"], "spacing": meta["spacing"], "source_range": [float(raw.min()), float(raw.max())], "display_window": [low, high], "bounds": bounds, "mesh_vertices": len(positions), "mesh_triangles": len(indices), "files": checksums}, indent=2))


if __name__ == "__main__":
    main()
