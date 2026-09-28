import glob
import sys
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image, ImageDraw


def load_series(path):
    files = glob.glob(str(Path(path) / "*.dcm"))
    datasets = [pydicom.dcmread(p) for p in files]
    datasets.sort(key=lambda d: float(d.ImagePositionPatient[2]), reverse=True)
    volume = np.stack([d.pixel_array.astype(np.float32) for d in datasets])
    return datasets, volume


if __name__ == "__main__":
    datasets, vol = load_series(sys.argv[1])
    low, high = np.percentile(vol, [1, 99.7])
    vol = np.clip((vol - low) * (255 / (high - low)), 0, 255).astype(np.uint8)
    indices = list(range(0, len(datasets), 4))
    scale = 2
    w, h = datasets[0].Columns * scale, datasets[0].Rows * scale
    canvas = Image.new("RGB", (w * 4, (h + 28) * ((len(indices) + 3) // 4)), "black")
    draw = ImageDraw.Draw(canvas)
    for j, i in enumerate(indices):
        tile = Image.fromarray(vol[i]).resize((w, h))
        x, y = (j % 4) * w, (j // 4) * (h + 28)
        canvas.paste(tile, (x, y))
        draw.text((x + 8, y + h + 4), f"{i:02}  z={float(datasets[i].ImagePositionPatient[2]):.1f}", fill="white")
    canvas.save(sys.argv[2])
    print(f"{len(datasets)} slices; z {float(datasets[0].ImagePositionPatient[2]):.1f} to {float(datasets[-1].ImagePositionPatient[2]):.1f}; {low:.1f}-{high:.1f}")
