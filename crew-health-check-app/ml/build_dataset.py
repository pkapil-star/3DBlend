"""Build the sep-risk dataset from the raw DONKI files (ARCHITECTURE.md section 26.4, decision D22).

Usage:
    python ml/build_dataset.py

Reads   ml/data/raw/donki/<TYPE>/<YEAR>.json.gz and meta.json   (only read, never changed)
        ml/sep_instrument_classes.json
Writes  ml/data/processed/flares.csv
        ml/data/processed/dataset_summary.json

Standard library only. The same inputs always give byte-identical outputs.

A flare is positive only when DONKI links it, directly or through one linked
CME, to an SEP record observed by an instrument. A flare whose only SEP
evidence is model output or of unknown origin is kept in the file as
"ambiguous" and left out of training and testing. A negative means "no
qualifying recorded SEP association", not that no particle event occurred.
"""

from __future__ import annotations

import argparse
import collections
import csv
import gzip
import json
import re
import sys
from pathlib import Path

import features

ML_DIR = Path(__file__).resolve().parent
RAW_DIR = ML_DIR / 'data' / 'raw' / 'donki'
OUT_DIR = ML_DIR / 'data' / 'processed'
CLASSES_PATH = ML_DIR / 'sep_instrument_classes.json'

ID_FIELDS = {'FLR': 'flrID', 'CME': 'activityID', 'SEP': 'sepID'}
SPLITS = ('train', 'validation', 'test')
TRAIN_END_YEAR = 2020  # section 26.6
VALIDATION_END_YEAR = 2022
MIN_POSITIVES = 10

RECORD_CLASSES = ('observedOnly', 'mixed', 'modelOnly', 'unknown')
OBSERVED_RECORD_CLASSES = ('observedOnly', 'mixed')
LABEL_STATUSES = ('positive', 'negative', 'ambiguous')

DROP_REASONS = (
    'class cannot be read',
    'class below M1.0',
    'begin or peak time missing',
    'peak time before begin time',
    'source location cannot be read',
)

CSV_COLUMNS = (
    'flrID', 'link', 'catalog', 'activeRegionNum', 'beginTime', 'peakTime', 'endTime', 'peakYear',
    'classType', 'sourceLocation', 'riseMin', 'durationMin', 'cmeId', 'cmeSpeedKms', 'cmeHalfAngleDeg',
    *features.FEATURE_NAMES,
    'labelStatus', 'label', 'sepAssociations', 'mixedOtherNames', 'split',
)

_KIND = re.compile(r'-([A-Z]+)-\d+$')


# --- Raw records ---------------------------------------------------------------


def load_raw(raw_dir: Path, kind: str) -> list[dict]:
    records: list[dict] = []
    for path in sorted((raw_dir / kind).glob('*.json.gz')):
        with gzip.open(path, 'rt', encoding='utf-8') as handle:
            records.extend(json.load(handle))
    return records


def _version(record: dict) -> tuple:
    return (record.get('versionId') or 0, record.get('submissionTime') or '')


def keep_one_per_id(records: list[dict], kind: str) -> tuple[dict[str, dict], dict[str, int]]:
    """One record per ID: exact duplicates are dropped, and of two versions the later one is kept."""
    by_id: dict[str, dict] = {}
    exact, older = 0, 0
    for record in records:
        identifier = record[ID_FIELDS[kind]]
        current = by_id.get(identifier)
        if current is None:
            by_id[identifier] = record
        elif current == record:
            exact += 1
        else:
            older += 1
            if _version(record) > _version(current):
                by_id[identifier] = record
    return by_id, {'exactDuplicatesDropped': exact, 'olderVersionsDropped': older}


def event_kind(identifier: str) -> str | None:
    """'2024-05-09T08:45:00-FLR-001' -> 'FLR'."""
    match = _KIND.search(identifier)
    return match.group(1) if match else None


def build_links(*collections_by_id: dict[str, dict]) -> dict[str, set[str]]:
    """One undirected graph from every linkedEvents list: a link may be listed on either side."""
    links: dict[str, set[str]] = collections.defaultdict(set)
    for records in collections_by_id:
        for identifier, record in records.items():
            for link in record.get('linkedEvents') or []:
                other = link.get('activityID')
                if isinstance(other, str) and other and other != identifier:
                    links[identifier].add(other)
                    links[other].add(identifier)
    return links


# --- SEP instruments and records (decision D22) ---------------------------------


def load_instrument_table(path: Path) -> dict:
    table = json.loads(path.read_text(encoding='utf-8'))
    table['byName'] = {entry['displayName']: entry for entry in table.get('instruments', [])}
    return table


def instrument_class(name: object, table: dict) -> str:
    """'model', 'observed' or 'unknown' for one instrument name.

    A MODEL: prefix always means model output, whatever instrument the name
    contains. 'observed' needs a table entry with recorded sources; a name
    is never observed just because it lacks the prefix.
    """
    if not isinstance(name, str) or not name.strip():
        return 'unknown'
    if name.strip().upper().startswith('MODEL:'):
        return 'model'
    entry = table['byName'].get(name)
    if entry is None:
        return 'unknown'
    if entry.get('class') == 'model':
        return 'model'
    sources = entry.get('sourceIds') or []
    if entry.get('class') == 'observed' and sources and all(source in table.get('sources', {}) for source in sources):
        return 'observed'
    return 'unknown'


def sep_record_class(record: dict, table: dict) -> tuple[str, list[tuple[str, str]]]:
    """The class of one SEP record and its (instrument name, class) pairs."""
    names = [item.get('displayName') if isinstance(item, dict) else None for item in record.get('instruments') or []]
    pairs = [(str(name), instrument_class(name, table)) for name in names]
    kinds = {kind for _name, kind in pairs}
    if not pairs:
        return 'unknown', pairs
    if kinds == {'observed'}:
        return 'observedOnly', pairs
    if 'observed' in kinds:
        return 'mixed', pairs
    if kinds == {'model'}:
        return 'modelOnly', pairs
    return 'unknown', pairs


# --- One flare ------------------------------------------------------------------


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def choose_cme(flare_id: str, links: dict[str, set[str]], cmes: dict[str, dict]) -> dict | None:
    """The fastest analysis among the flare's linked CMEs (section 26.4, step 6).

    Each CME offers its analyses marked isMostAccurate, or its first analysis
    when none is marked. An analysis without a speed or a half-angle cannot
    be used. Of equal speeds the first one in ID order is kept.
    """
    best = None
    for cme_id in sorted(links.get(flare_id, ())):
        cme = cmes.get(cme_id)
        if cme is None:
            continue
        analyses = cme.get('cmeAnalyses') or []
        marked = [analysis for analysis in analyses if analysis.get('isMostAccurate')]
        for analysis in marked or analyses[:1]:
            speed, half_angle = analysis.get('speed'), analysis.get('halfAngle')
            if not _is_number(speed) or not _is_number(half_angle) or speed < 0:
                continue
            if best is None or speed > best['speedKms']:
                best = {'cmeId': cme_id, 'speedKms': float(speed), 'halfAngleDeg': float(half_angle)}
    return best


def sep_associations(flare_id: str, links: dict[str, set[str]]) -> dict[str, list[str]]:
    """SEP IDs the flare reaches by a permitted path: directly, or through one linked CME.

    Paths through other flares or through interplanetary shocks do not count.
    """
    found: dict[str, set[str]] = collections.defaultdict(set)
    for other in links.get(flare_id, ()):
        kind = event_kind(other)
        if kind == 'SEP':
            found[other].add('direct')
        elif kind == 'CME':
            for third in links.get(other, ()):
                if event_kind(third) == 'SEP':
                    found[third].add(f'via {other}')
    return {sep_id: sorted(paths) for sep_id, paths in sorted(found.items())}


def label_status(record_classes: list[str]) -> str:
    """'positive', 'ambiguous' or 'negative' from the classes of the associated SEP records."""
    if any(record_class in OBSERVED_RECORD_CLASSES for record_class in record_classes):
        return 'positive'
    return 'ambiguous' if record_classes else 'negative'


def _whole(value: float | None) -> int | float | None:
    if value is None:
        return None
    return int(value) if float(value).is_integer() else value


def flare_row(flare: dict, links: dict[str, set[str]], cmes: dict[str, dict], sep_classes: dict[str, dict]) -> tuple[dict | None, str | None]:
    """The dataset row of one flare, or the reason it is dropped (section 26.4, steps 5 to 7)."""
    if features.parse_class(flare.get('classType')) is None:
        return None, 'class cannot be read'
    if not features.is_m1_or_above(flare.get('classType')):
        return None, 'class below M1.0'
    rise = features.minutes_between(flare.get('beginTime'), flare.get('peakTime'))
    if rise is None:
        return None, 'begin or peak time missing'
    if rise < 0:
        return None, 'peak time before begin time'
    if features.parse_location(flare.get('sourceLocation')) is None:
        return None, 'source location cannot be read'

    # An end time before the peak cannot be right, so it counts as missing.
    duration = features.minutes_between(flare.get('beginTime'), flare.get('endTime'))
    end_unusable = duration is not None and duration < rise
    if end_unusable:
        duration = None

    cme = choose_cme(flare['flrID'], links, cmes)
    observation = {
        'classType': flare['classType'].strip(),
        'sourceLocation': flare['sourceLocation'].strip(),
        'riseMin': rise,
        'durationMin': duration,
        'cme': {'speedKms': cme['speedKms'], 'halfAngleDeg': cme['halfAngleDeg']} if cme else None,
    }
    # 0.0 stands in for a missing duration here; that column is left empty below.
    values = dict(zip(features.FEATURE_NAMES, features.flare_features(observation, duration_impute=0.0)))
    if duration is None:
        values[features.DURATION_FEATURE] = None

    associations = sep_associations(flare['flrID'], links)
    evidence = []
    mixed_other = []
    for sep_id, paths in associations.items():
        info = sep_classes.get(sep_id) or {'recordClass': 'unknown', 'instruments': [], 'downloaded': False}
        evidence.append({'sepId': sep_id, 'recordClass': info['recordClass'], 'paths': paths, 'downloaded': info.get('downloaded', True)})
        if info['recordClass'] == 'mixed':
            mixed_other.extend((sep_id, name, kind) for name, kind in info['instruments'] if kind != 'observed')
    status = label_status([item['recordClass'] for item in evidence])

    row = {
        'flrID': flare['flrID'],
        'link': flare.get('link') or '',
        'catalog': flare.get('catalog') or '',
        'activeRegionNum': flare.get('activeRegionNum') if flare.get('activeRegionNum') is not None else '',
        'beginTime': flare['beginTime'],
        'peakTime': flare['peakTime'],
        'endTime': flare.get('endTime') or '',
        'peakYear': int(flare['peakTime'][:4]),
        'classType': observation['classType'],
        'sourceLocation': observation['sourceLocation'],
        'riseMin': _whole(rise),
        'durationMin': _whole(duration),
        'cmeId': cme['cmeId'] if cme else '',
        'cmeSpeedKms': cme['speedKms'] if cme else None,
        'cmeHalfAngleDeg': cme['halfAngleDeg'] if cme else None,
        **values,
        'labelStatus': status,
        'label': {'positive': 1, 'negative': 0, 'ambiguous': None}[status],
        'sepAssociations': ';'.join(f"{item['sepId']}|{item['recordClass']}|{','.join(item['paths'])}" for item in evidence),
        'mixedOtherNames': ';'.join(f'{sep_id}|{name}|{kind}' for sep_id, name, kind in mixed_other),
        'split': '',
    }
    row['_evidence'] = evidence
    row['_endUnusable'] = end_unusable
    row['_linkedCmeWithoutAnalysis'] = cme is None and any(event_kind(other) == 'CME' for other in links.get(flare['flrID'], ()))
    return row, None


# --- Splits (section 26.6) --------------------------------------------------------


def split_of(year: int, train_end: int, validation_end: int) -> str:
    return 'train' if year <= train_end else 'validation' if year <= validation_end else 'test'


def settle_boundaries(
    positives_by_year: dict[int, int],
    first_year: int,
    last_year: int,
    train_end: int = TRAIN_END_YEAR,
    validation_end: int = VALIDATION_END_YEAR,
    minimum: int = MIN_POSITIVES,
) -> tuple[int, int, list[dict], bool]:
    """Moves a boundary by one year while a split has fewer than `minimum` positives.

    Train short: the train/validation boundary moves one year later.
    Validation short: the validation/test boundary moves one year later.
    Test short: the validation/test boundary moves one year earlier.
    The order train, validation, test and at least one year per split are
    kept. Returns the boundaries, the moves made, and whether every split
    now has enough positives.
    """
    changes: list[dict] = []
    seen: set[tuple[int, int]] = set()

    def counts() -> dict[str, int]:
        totals = dict.fromkeys(SPLITS, 0)
        for year, count in positives_by_year.items():
            totals[split_of(year, train_end, validation_end)] += count
        return totals

    while (train_end, validation_end) not in seen:
        seen.add((train_end, validation_end))
        now = counts()
        if now['train'] < minimum and train_end + 1 < validation_end:
            move = ('train', 'train/validation', train_end, train_end + 1)
            train_end += 1
        elif now['validation'] < minimum and validation_end + 1 < last_year:
            move = ('validation', 'validation/test', validation_end, validation_end + 1)
            validation_end += 1
        elif now['test'] < minimum and validation_end - 1 > train_end:
            move = ('test', 'validation/test', validation_end, validation_end - 1)
            validation_end -= 1
        else:
            break
        changes.append({
            'split': move[0],
            'boundary': move[1],
            'lastYearBefore': move[2],
            'lastYearAfter': move[3],
            'reason': f'{move[0]} had {now[move[0]]} positives, fewer than {minimum}',
        })
    enough = all(count >= minimum for count in counts().values())
    return train_end, validation_end, changes, enough


# --- The whole dataset --------------------------------------------------------------


def _by_year(counter: dict) -> dict[str, object]:
    return {str(year): counter[year] for year in sorted(counter)}


def _years_text(years: list[int]) -> str:
    return f'{min(years)}-{max(years)}' if years else 'none'


def build(raw_dir: Path = RAW_DIR, classes_path: Path = CLASSES_PATH) -> tuple[list[dict], dict]:
    """Returns the flare rows (sorted by ID) and the dataset summary. Reads only."""
    table = load_instrument_table(classes_path)
    raw = {kind: load_raw(raw_dir, kind) for kind in ID_FIELDS}
    flares, flare_dupes = keep_one_per_id(raw['FLR'], 'FLR')
    cmes, cme_dupes = keep_one_per_id(raw['CME'], 'CME')
    seps, sep_dupes = keep_one_per_id(raw['SEP'], 'SEP')
    links = build_links(flares, cmes, seps)

    # SEP instruments and records.
    sep_classes: dict[str, dict] = {}
    inventory: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for sep_id, record in seps.items():
        record_class, pairs = sep_record_class(record, table)
        sep_classes[sep_id] = {'recordClass': record_class, 'instruments': pairs, 'year': int(record['eventTime'][:4]), 'downloaded': True}
        for name, _kind in pairs:
            inventory[name][int(record['eventTime'][:4])] += 1

    # Flares: filter, features, label.
    rows: list[dict] = []
    dropped = dict.fromkeys(DROP_REASONS, 0)
    for flare_id in sorted(flares):
        row, reason = flare_row(flares[flare_id], links, cmes, sep_classes)
        if row is None:
            dropped[reason] += 1
        else:
            rows.append(row)

    # Splits by flare peak year.
    positives_by_year = collections.Counter(row['peakYear'] for row in rows if row['labelStatus'] == 'positive')
    years = sorted({row['peakYear'] for row in rows})
    train_end, validation_end, changes, enough = settle_boundaries(positives_by_year, years[0], years[-1]) if years else (TRAIN_END_YEAR, VALIDATION_END_YEAR, [], False)
    for row in rows:
        row['split'] = split_of(row['peakYear'], train_end, validation_end)

    # Summary.
    labels_by_year: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    labels_by_split: dict[str, collections.Counter] = {name: collections.Counter() for name in SPLITS}
    for row in rows:
        labels_by_year[row['peakYear']][row['labelStatus']] += 1
        labels_by_split[row['split']][row['labelStatus']] += 1

    classes_total = collections.Counter(info['recordClass'] for info in sep_classes.values())
    classes_by_year: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    classes_by_split: dict[str, collections.Counter] = {name: collections.Counter() for name in SPLITS}
    mixed_other: collections.Counter = collections.Counter()
    for info in sep_classes.values():
        classes_by_year[info['year']][info['recordClass']] += 1
        classes_by_split[split_of(info['year'], train_end, validation_end)][info['recordClass']] += 1
        if info['recordClass'] == 'mixed':
            mixed_other.update((name, kind) for name, kind in info['instruments'] if kind != 'observed')

    def class_counts(counter: dict) -> dict[str, int]:
        return {name: counter.get(name, 0) for name in RECORD_CLASSES}

    def label_counts(counter: dict) -> dict[str, int]:
        result = {name: counter.get(name, 0) for name in LABEL_STATUSES}
        result['scored'] = result['positive'] + result['negative']
        return result

    ambiguous_evidence: collections.Counter = collections.Counter()
    positive_extra = 0
    not_downloaded: set[str] = set()
    for row in rows:
        kinds = sorted({item['recordClass'] for item in row['_evidence']})
        not_downloaded.update(item['sepId'] for item in row['_evidence'] if not item['downloaded'])
        if row['labelStatus'] == 'ambiguous':
            ambiguous_evidence[' and '.join(kinds)] += 1
        elif row['labelStatus'] == 'positive' and any(kind not in OBSERVED_RECORD_CLASSES for kind in kinds):
            positive_extra += 1

    meta_path = raw_dir / 'meta.json'
    meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
    retrieved = sorted(info['retrievedAt'] for info in meta.get('files', {}).values() if info.get('retrievedAt'))

    def catalogs(records: dict[str, dict], time_field: str) -> dict[str, dict]:
        found: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
        for record in records.values():
            found[str(record.get('catalog')) if record.get('catalog') else 'no catalog field'][int(record[time_field][:4])] += 1
        return {name: _by_year(found[name]) for name in sorted(found)}

    sources = table.get('sources', {})
    summary = {
        'schemaVersion': 1,
        'source': {
            'name': meta.get('source', 'NASA CCMC DONKI'),
            'apiBase': meta.get('apiBase'),
            'requested': meta.get('requested'),
            'retrievedFrom': retrieved[0] if retrieved else None,
            'retrievedTo': retrieved[-1] if retrieved else None,
            'rawRecords': {kind: len(raw[kind]) for kind in ID_FIELDS},
            'duplicates': {'FLR': flare_dupes, 'CME': cme_dupes, 'SEP': sep_dupes},
            'rawFiles': 'only read; never changed',
        },
        'labelPolicy': {
            'decision': 'D22',
            'positive': 'DONKI links the flare, directly or through one linked CME, to at least one SEP record observed by an instrument',
            'ambiguous': 'the linked SEP records are all model output or of unknown origin; excluded from training and testing, never counted as negative',
            'negative': 'no qualifying recorded SEP association; this is not proof that no particle event occurred',
        },
        'catalogs': {
            'FLR': catalogs(flares, 'beginTime'),
            'CME': catalogs(cmes, 'startTime'),
            'SEP': catalogs(seps, 'eventTime'),
        },
        'instrumentInventory': [
            {
                'displayName': name,
                'class': instrument_class(name, table),
                'records': sum(inventory[name].values()),
                'recordsByYear': _by_year(inventory[name]),
                'instrument': table['byName'].get(name, {}).get('instrument'),
                'basis': table['byName'].get(name, {}).get('basis', 'Not in the table, so unknown.'),
                'recordContext': table['byName'].get(name, {}).get('recordContext'),
                'sources': [
                    {'id': source, 'title': sources[source]['title'], 'publisher': sources[source]['publisher'], 'url': sources[source]['url']}
                    for source in table['byName'].get(name, {}).get('sourceIds', [])
                    if source in sources
                ],
            }
            for name in sorted(inventory)
        ],
        'instrumentTable': {
            'checked': table.get('checked'),
            'namesInTableButNotInData': sorted(set(table['byName']) - set(inventory)),
        },
        'sepRecordClasses': {
            'total': class_counts(classes_total),
            'byYear': {str(year): class_counts(classes_by_year[year]) for year in sorted(classes_by_year)},
            'bySplit': {name: class_counts(classes_by_split[name]) for name in SPLITS},
        },
        'mixedRecordOtherNames': [
            {'displayName': name, 'class': kind, 'records': count} for (name, kind), count in sorted(mixed_other.items())
        ],
        'flares': {
            'raw': len(flares),
            'dropped': dropped,
            'eligible': len(rows),
            'firstFlare': min((row['peakTime'] for row in rows), default=None),
            'lastFlare': max((row['peakTime'] for row in rows), default=None),
            'labels': label_counts(collections.Counter(row['labelStatus'] for row in rows)),
            'labelsByYear': {str(year): label_counts(labels_by_year[year]) for year in sorted(labels_by_year)},
            'labelsBySplit': {name: label_counts(labels_by_split[name]) for name in SPLITS},
            'ambiguousByEvidence': dict(sorted(ambiguous_evidence.items())),
            'positivesThatAlsoReachModelOrUnknownRecords': positive_extra,
            'withLinkedCmeAnalysis': sum(1 for row in rows if row['cmeId']),
            'linkedCmeButNoUsableAnalysis': sum(1 for row in rows if row['_linkedCmeWithoutAnalysis']),
            'withoutUsableEndTime': sum(1 for row in rows if row['durationMin'] is None),
            'endTimeBeforePeakTreatedAsMissing': sum(1 for row in rows if row['_endUnusable']),
            'linkedSepIdsNotInTheDownload': sorted(not_downloaded),
        },
        'splits': {
            'by': 'flare peak year (UTC)',
            'planned': {'trainLastYear': TRAIN_END_YEAR, 'validationLastYear': VALIDATION_END_YEAR},
            'used': {'trainLastYear': train_end, 'validationLastYear': validation_end},
            'years': {
                name: _years_text([year for year in years if split_of(year, train_end, validation_end) == name])
                for name in SPLITS
            },
            'minimumPositives': MIN_POSITIVES,
            'boundaryChanges': changes,
            'everySplitHasEnoughPositives': enough,
        },
    }
    return rows, summary


def _cell(value: object) -> str:
    if value is None:
        return ''
    if isinstance(value, float):
        return repr(value)
    return str(value)


def write_outputs(rows: list[dict], summary: dict, out_dir: Path = OUT_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    # newline='' and '\n' keep the bytes identical on Windows, macOS and Linux.
    with (out_dir / 'flares.csv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.writer(handle, lineterminator='\n')
        writer.writerow(CSV_COLUMNS)
        for row in rows:
            writer.writerow([_cell(row[column]) for column in CSV_COLUMNS])
    with (out_dir / 'dataset_summary.json').open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--raw', default=str(RAW_DIR), help='folder with the raw DONKI files (only read)')
    parser.add_argument('--classes', default=str(CLASSES_PATH), help='the SEP instrument class table')
    parser.add_argument('--out', default=str(OUT_DIR), help='folder for flares.csv and dataset_summary.json')
    args = parser.parse_args(argv)

    rows, summary = build(Path(args.raw), Path(args.classes))
    write_outputs(rows, summary, Path(args.out))
    flares = summary['flares']
    print(f"SEP records by class: {summary['sepRecordClasses']['total']}")
    print(f"Flares: {flares['raw']} in the files, {flares['eligible']} eligible; dropped: {flares['dropped']}")
    print(f"Labels: {flares['labels']}")
    for name in SPLITS:
        print(f"  {name} ({summary['splits']['years'][name]}): {flares['labelsBySplit'][name]}")
    if summary['splits']['boundaryChanges']:
        print(f"Split boundaries moved: {summary['splits']['boundaryChanges']}")
    print(f"Written: {Path(args.out) / 'flares.csv'} and {Path(args.out) / 'dataset_summary.json'}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
