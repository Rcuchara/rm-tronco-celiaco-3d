"""Prepare MRI planes for a browser volume viewer.

OpenSlide's ImageSlide API reads each rendered 2-D plane. Spatial placement comes
from the original DICOM ImagePositionPatient and PixelSpacing attributes.
"""

import base64
import argparse
import io
import json
from pathlib import Path

import numpy as np
import openslide
from PIL import Image

from inspect_series import load_series


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description="Create embedded viewer planes from the public DICOM series")
parser.add_argument("--dicom-dir", type=Path, default=ROOT / "raw" / "sub_arterial")
parser.add_argument("--output", type=Path, default=ROOT / "data" / "study_data.json")
args = parser.parse_args()
SOURCE = args.dicom_dir
TARGET = args.output
X1, X2 = 100, 230
Y1, Y2 = 95, 170
I1, I2 = 44, 65


def encode_png(arr):
    buf = io.BytesIO()
    Image.fromarray(arr, "RGBA").save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


datasets, volume = load_series(SOURCE)
source = volume[I1:I2, Y1:Y2, X1:X2]
display_ceiling = float(np.percentile(source, 99.7))
records = []

for index in range(I1, I2):
    pixel = volume[index, Y1:Y2, X1:X2]
    gray = np.clip(pixel / display_ceiling * 255, 0, 255).astype(np.uint8)
    rgb = np.repeat(gray[..., None], 3, axis=2)
    solid_rgba = np.concatenate([rgb, np.full(gray.shape + (1,), 255, np.uint8)], axis=2)
    # OpenSlide ImageSlide supplies a consistent read_region interface for the
    # rendered 2-D slice. OpenSlide itself does not decode these MR DICOM files.
    with openslide.ImageSlide(Image.fromarray(solid_rgba, "RGBA")) as slide:
        plane = np.array(slide.read_region((0, 0), 0, slide.dimensions), dtype=np.uint8)

    signal = gray.astype(np.float32)
    alpha = np.clip((signal - 42) / 150, 0, 1) ** 1.1
    alpha = (alpha * 255).astype(np.uint8)
    highlighted = plane.copy()
    highlighted[..., 3] = alpha
    records.append({
        "index": index,
        "z_mm": float(datasets[index].ImagePositionPatient[2]),
        "sop_instance_uid": str(datasets[index].SOPInstanceUID),
        "opaque": encode_png(plane),
        "highlight": encode_png(highlighted),
    })

data = {
    "case": "C3L-03129",
    "study_uid": str(datasets[0].StudyInstanceUID),
    "series_uid": str(datasets[0].SeriesInstanceUID),
    "source": "CPTAC-PDA / NCI Imaging Data Commons",
    "pixel_spacing_mm": [float(x) for x in datasets[0].PixelSpacing],
    "slice_thickness_mm": float(datasets[0].SliceThickness),
    "orientation": [float(x) for x in datasets[0].ImageOrientationPatient],
    "crop": {"x1": X1, "x2": X2, "y1": Y1, "y2": Y2},
    "display_ceiling": display_ceiling,
    "planes": records,
    "references": [
        {"name": "Aorta", "short": "Aorta", "color": "#ffffff", "column": 176, "row": 149, "slice_index": 56},
        {"name": "Tronco celíaco", "short": "Tronco", "color": "#ff897d", "column": 171, "row": 136, "slice_index": 56},
        {"name": "Arteria hepática común", "short": "Hepática común", "color": "#56ddd4", "column": 137, "row": 129, "slice_index": 50},
        {"name": "Arteria esplénica", "short": "A. esplénica → bazo", "color": "#f7c568", "column": 190, "row": 121, "slice_index": 54},
    ],
    # Manual guide to the visible proximal arc in slice 54. This is an
    # anatomical pointer, not a segmented vessel or a complete arterial path.
    "splenic_guide": [
        {"column": 168, "row": 127, "slice_index": 54},
        {"column": 168, "row": 121, "slice_index": 54},
        {"column": 171, "row": 117, "slice_index": 54},
        {"column": 176, "row": 115, "slice_index": 54},
        {"column": 182, "row": 117, "slice_index": 54},
        {"column": 187, "row": 118, "slice_index": 54},
        {"column": 190, "row": 120, "slice_index": 54},
        {"column": 191, "row": 122, "slice_index": 54},
        {"column": 193, "row": 125, "slice_index": 54},
    ],
}
TARGET.parent.mkdir(parents=True, exist_ok=True)
TARGET.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
print(f"OpenSlide ImageSlide planes: {len(records)}; z {records[0]['z_mm']:.1f} to {records[-1]['z_mm']:.1f} mm")
print(f"DICOM spacing: {data['pixel_spacing_mm']} mm; file size {TARGET.stat().st_size:,} bytes")
