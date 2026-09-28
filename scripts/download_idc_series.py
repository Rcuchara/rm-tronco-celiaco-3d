import hashlib
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BUCKET = "https://idc-open-data.s3.amazonaws.com/"
NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


def download_series(uuid, dest):
    dest.mkdir(parents=True, exist_ok=True)
    listing_url = BUCKET + "?list-type=2&prefix=" + urllib.parse.quote(uuid + "/")
    with urllib.request.urlopen(listing_url, timeout=60) as response:
        root = ET.fromstring(response.read())
    if root.findtext("s3:IsTruncated", namespaces=NS) != "false":
        raise RuntimeError("S3 listing was truncated")
    objects = []
    for item in root.findall("s3:Contents", NS):
        key = item.findtext("s3:Key", namespaces=NS)
        etag = item.findtext("s3:ETag", namespaces=NS).strip('"')
        objects.append((key, etag))

    def one(obj):
        key, etag = obj
        target = dest / Path(key).name
        if not target.exists() or hashlib.md5(target.read_bytes()).hexdigest() != etag:
            with urllib.request.urlopen(BUCKET + urllib.parse.quote(key), timeout=60) as response:
                data = response.read()
            if hashlib.md5(data).hexdigest() != etag:
                raise RuntimeError(f"ETag mismatch: {key}")
            target.write_bytes(data)
        return target.stat().st_size

    with ThreadPoolExecutor(max_workers=8) as pool:
        sizes = list(pool.map(one, objects))
    print(f"Downloaded {len(objects)} files, {sum(sizes):,} bytes to {dest}")


if __name__ == "__main__":
    download_series(sys.argv[1], Path(sys.argv[2]))
