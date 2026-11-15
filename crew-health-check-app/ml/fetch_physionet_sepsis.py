"""Download the PhysioNet/Computing in Cardiology Challenge 2019 training data (ARCHITECTURE.md section 26.19).

Usage:
    python ml/fetch_physionet_sepsis.py              # download what is missing, check it, write meta.json
    python ml/fetch_physionet_sepsis.py --verify     # check the files on disk against meta.json; no download

Standard library only. The patient files go to ml/data/raw/physionet/ and are never committed (decision
D21). Only ml/data/raw/physionet/meta.json is committed: it holds counts, checksums of whole sets, the
licence and the citations, and no patient data.

Source: the official project page, https://physionet.org/content/challenge-2019/1.0.0/ (Open Access,
Creative Commons Attribution 4.0 International). The page no longer links one ZIP file. It lists the
files on the PhysioNet file server and names PhysioNet's open-data bucket on AWS
(s3://physionet-open/challenge-2019/1.0.0/) as a second way to download them. This script:

1. takes the official file list of training sets A and B from the PhysioNet file server;
2. lists the same folders in the bucket and checks that they hold exactly those files;
3. downloads each patient file from the bucket (40,336 small files: much faster than the file server),
   resumable, and checks each one against the bucket's MD5 checksum;
4. compares a fixed sample of files byte for byte with the PhysioNet file server;
5. downloads LICENSE.txt and checks it against the project's SHA256SUMS.txt;
6. reads the variable units, the label definition and the citations from the project page.

The whole download is time-boxed (30 minutes by default, section 26.19). A stopped run can be started
again: files that are already complete are kept.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
import http.client
import json
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ElementTree
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT / 'ml' / 'data' / 'raw' / 'physionet'
META_PATH = RAW_DIR / 'meta.json'

PAGE = 'https://physionet.org/content/challenge-2019/1.0.0/'
FILES = 'https://physionet.org/files/challenge-2019/1.0.0/'
LICENSE_PAGE = 'https://physionet.org/content/challenge-2019/view-license/1.0.0/'
BUCKET_HOST = 'physionet-open.s3.amazonaws.com'
BUCKET_PREFIX = 'challenge-2019/1.0.0/'
SETS = ('training_setA', 'training_setB')
EXPECTED = {'training_setA': 20336, 'training_setB': 20000}  # the counts the dataset documentation gives
VARIABLES = ('HR', 'Temp', 'SBP', 'DBP', 'Glucose', 'ICULOS', 'SepsisLabel')
HEADERS = {'User-Agent': 'dataset-fetch/1.0 (research prototype)'}
SAMPLE_PER_SET = 20
SAMPLE_DELAY_S = 0.5  # between requests to the PhysioNet file server
WORKERS = 16
S3_NS = '{http://s3.amazonaws.com/doc/2006-03-01/}'


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def get(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


# ---------------------------------------------------------------------------
# The official file list and the bucket


def official_names(set_name: str) -> list[str]:
    """Patient file names of one training set, from the PhysioNet file server's folder listing."""
    listing = get(f'{FILES}training/{set_name}/').decode('utf-8', errors='replace')
    return sorted(set(re.findall(r'href="(p\d{6}\.psv)"', listing)))


def bucket_objects(set_name: str) -> dict[str, tuple[int, str]]:
    """{file name: (size, MD5)} of one training set in the bucket (S3 ListObjectsV2, no credentials)."""
    found: dict[str, tuple[int, str]] = {}
    token = None
    prefix = f'{BUCKET_PREFIX}training/{set_name}/'
    while True:
        query = {'list-type': '2', 'prefix': prefix, 'max-keys': '1000'}
        if token:
            query['continuation-token'] = token
        root = ElementTree.fromstring(get(f'https://{BUCKET_HOST}/?{urllib.parse.urlencode(query)}'))
        for item in root.iter(f'{S3_NS}Contents'):
            key = item.findtext(f'{S3_NS}Key') or ''
            etag = (item.findtext(f'{S3_NS}ETag') or '').strip('"')
            size = int(item.findtext(f'{S3_NS}Size') or 0)
            if key.endswith('.psv'):
                found[key.rsplit('/', 1)[1]] = (size, etag)
        if root.findtext(f'{S3_NS}IsTruncated') != 'true':
            return found
        token = root.findtext(f'{S3_NS}NextContinuationToken')


# ---------------------------------------------------------------------------
# Downloads


_local = threading.local()


def _connection() -> http.client.HTTPSConnection:
    # One kept-alive connection per worker thread.
    if getattr(_local, 'connection', None) is None:
        _local.connection = http.client.HTTPSConnection(BUCKET_HOST, timeout=60)
    return _local.connection


def _download_one(set_name: str, name: str, size: int, md5: str, deadline: float) -> str:
    """'kept', 'downloaded', 'skipped' (time box) or 'failed: ...'."""
    target = RAW_DIR / set_name / name
    if target.exists() and target.stat().st_size == size and hashlib.md5(target.read_bytes()).hexdigest() == md5:
        return 'kept'
    if time.monotonic() > deadline:
        return 'skipped'
    path = f'/{BUCKET_PREFIX}training/{set_name}/{name}'
    for attempt in range(4):
        try:
            connection = _connection()
            connection.request('GET', path, headers=HEADERS)
            response = connection.getresponse()
            body = response.read()
            if response.status != 200:
                raise OSError(f'HTTP {response.status}')
            if len(body) != size or hashlib.md5(body).hexdigest() != md5:
                raise OSError('checksum does not match the bucket')
            partial = target.with_suffix('.part')
            partial.write_bytes(body)
            partial.replace(target)
            return 'downloaded'
        except (OSError, http.client.HTTPException) as error:
            _local.connection = None
            if attempt == 3:
                return f'failed: {error}'
            time.sleep(1.5 * (attempt + 1))
    return 'failed: no attempt left'


def download_set(set_name: str, objects: dict[str, tuple[int, str]], deadline: float) -> dict[str, int]:
    (RAW_DIR / set_name).mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    failures: list[str] = []
    names = sorted(objects)
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(_download_one, set_name, name, *objects[name], deadline): name for name in names}
        for done, future in enumerate(concurrent.futures.as_completed(futures), 1):
            outcome = future.result()
            key = outcome.split(':', 1)[0]
            counts[key] = counts.get(key, 0) + 1
            if key == 'failed':
                failures.append(f'{futures[future]} {outcome}')
            if done % 2000 == 0 or done == len(names):
                print(f'  {set_name}: {done} of {len(names)} ({counts})', flush=True)
    for line in failures[:10]:
        print(f'  failed: {line}')
    return counts


# ---------------------------------------------------------------------------
# Checks


def set_fingerprint(set_name: str, names: list[str], raw_dir: Path | None = None) -> tuple[int, int, str]:
    """(files present, bytes, SHA-256 of the sorted "name md5" lines): a compact check of a whole set."""
    lines, total, present = [], 0, 0
    for name in sorted(names):
        path = (raw_dir or RAW_DIR) / set_name / name
        if not path.exists():
            continue
        body = path.read_bytes()
        present += 1
        total += len(body)
        lines.append(f'{name} {hashlib.md5(body).hexdigest()}')
    return present, total, hashlib.sha256('\n'.join(lines).encode('ascii')).hexdigest()


def compare_sample(names_by_set: dict[str, list[str]], seed: int) -> dict:
    """Byte-for-byte comparison of a fixed sample with the PhysioNet file server."""
    rng = random.Random(seed)
    checked, identical, problems = 0, 0, []
    for set_name in SETS:
        for name in rng.sample(names_by_set[set_name], SAMPLE_PER_SET):
            local = RAW_DIR / set_name / name
            try:
                remote = get(f'{FILES}training/{set_name}/{name}')
            except (urllib.error.URLError, OSError) as error:
                problems.append(f'{name}: {error}')
                continue
            checked += 1
            identical += local.exists() and local.read_bytes() == remote
            time.sleep(SAMPLE_DELAY_S)
    return {'files': checked, 'identical': identical, 'seed': seed, 'problems': problems[:5]}


def check_header(set_name: str, names: list[str]) -> dict:
    """Every file starts with the same header, and holds the columns the model needs."""
    headers: dict[str, int] = {}
    for name in names:
        path = RAW_DIR / set_name / name
        if path.exists():
            with path.open('r', encoding='ascii') as handle:
                first = handle.readline().strip()
            headers[first] = headers.get(first, 0) + 1
    columns = next(iter(headers), '').split('|')
    return {
        'distinctHeaders': len(headers),
        'columns': len(columns),
        'hasModelColumns': all(variable in columns for variable in VARIABLES),
    }


# ---------------------------------------------------------------------------
# The project page: licence, units, label, citations


def _text(fragment: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


def page_facts() -> dict:
    return parse_page(get(PAGE).decode('utf-8', errors='replace'))


def parse_page(page: str) -> dict:
    """Version, licence, units of the model's variables, citations and DOI, read from the project page's HTML."""
    units = {}
    for variable in VARIABLES:
        match = re.search(rf'<td>{variable}</td>\s*<td>(.*?)</td>', page, flags=re.S)
        units[variable] = _text(match.group(1))[:300] if match else None
    licence = re.search(r'<dt>License</dt>\s*<dd>(.*?)</dd>', page, flags=re.S)
    version = re.search(r'Version:?\s*([0-9.]+)', _text(page))
    citations = [_text(match) for match in re.findall(r'class="citation-text"[^>]*>(.*?)</', page, flags=re.S)]
    doi = re.search(r'https://doi\.org/10\.13026/[a-z0-9-]+', page)
    return {
        'version': version.group(1) if version else None,
        'license': _text(licence.group(1)) if licence else None,
        'units': units,
        'citations': citations,
        'datasetDoi': doi.group(0) if doi else None,
    }


def licence_file() -> dict:
    body = get(f'{FILES}LICENSE.txt')
    (RAW_DIR / 'LICENSE.txt').write_bytes(body)
    sums = get(f'{FILES}SHA256SUMS.txt').decode('utf-8', errors='replace')
    listed = next((line.split()[0] for line in sums.splitlines() if line.strip().endswith('LICENSE.txt')), None)
    digest = hashlib.sha256(body).hexdigest()
    return {'sha256': digest, 'matchesSha256Sums': digest == listed, 'firstLine': body.decode('utf-8', 'replace').strip().splitlines()[0][:120]}


# ---------------------------------------------------------------------------


def run(time_box_min: float, seed: int) -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    started = now_utc()
    deadline = time.monotonic() + time_box_min * 60
    sets: dict[str, dict] = {}
    names_by_set: dict[str, list[str]] = {}
    for set_name in SETS:
        names = official_names(set_name)
        objects = bucket_objects(set_name)
        names_by_set[set_name] = names
        print(f'{set_name}: {len(names)} files listed by PhysioNet, {len(objects)} in the bucket', flush=True)
        same = set(names) == set(objects)
        if not same:
            print(f'  the bucket and the file server differ: {len(set(names) - set(objects))} missing from the bucket, '
                  f'{len(set(objects) - set(names))} extra', flush=True)
        counts = download_set(set_name, {name: objects[name] for name in names if name in objects}, deadline)
        present, total, fingerprint = set_fingerprint(set_name, names)
        sets[set_name] = {
            'listedByPhysioNet': len(names),
            'documented': EXPECTED[set_name],
            'inBucket': len(objects),
            'bucketMatchesList': same,
            'present': present,
            'bytes': total,
            'checkedAgainstBucketMd5': counts.get('downloaded', 0) + counts.get('kept', 0),
            'failed': counts.get('failed', 0),
            'notStartedInTimeBox': counts.get('skipped', 0),
            'fingerprintSha256': fingerprint,
            'header': check_header(set_name, names),
        }
    complete = all(entry['present'] == entry['listedByPhysioNet'] == entry['documented'] and entry['bucketMatchesList']
                   for entry in sets.values())
    sample = compare_sample(names_by_set, seed) if complete else None
    meta = {
        'dataset': 'Early Prediction of Sepsis from Clinical Data: The PhysioNet/Computing in Cardiology Challenge 2019',
        'page': PAGE,
        'fileServer': FILES,
        'downloadedFrom': f'https://{BUCKET_HOST}/{BUCKET_PREFIX} (PhysioNet open-data bucket on AWS, named on the project page)',
        'licensePage': LICENSE_PAGE,
        **page_facts(),
        'licenseFile': licence_file(),
        'retrieved': {'start': started, 'end': now_utc()},
        'timeBoxMinutes': time_box_min,
        'sets': sets,
        'sampleComparedWithFileServer': sample,
        'complete': complete and sample is not None and sample['identical'] == sample['files'] == SAMPLE_PER_SET * len(SETS),
        'note': 'Patient files are in this folder on the machine that ran the download and are never committed (decision D21). '
                'This file holds counts and checksums of whole sets only.',
    }
    with META_PATH.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(meta, indent=2, ensure_ascii=False) + '\n')
    print(f"complete: {meta['complete']}; meta.json written")
    return 0 if meta['complete'] else 1


def verify() -> int:
    meta = json.loads(META_PATH.read_text(encoding='utf-8'))
    ok = True
    for set_name in SETS:
        names = sorted(path.name for path in (RAW_DIR / set_name).glob('p*.psv'))
        present, total, fingerprint = set_fingerprint(set_name, names)
        expected = meta['sets'][set_name]
        same = (present, total, fingerprint) == (expected['present'], expected['bytes'], expected['fingerprintSha256'])
        ok &= same
        print(f'{set_name}: {present} files, {total} bytes, fingerprint {"matches" if same else "DIFFERS"}')
    print('verified' if ok else 'NOT verified')
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--verify', action='store_true', help='check the files on disk against meta.json')
    parser.add_argument('--time-box-min', type=float, default=30.0)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args(argv)
    return verify() if args.verify else run(args.time_box_min, args.seed)


if __name__ == '__main__':
    sys.exit(main())
