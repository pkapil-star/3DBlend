"""Build the Earth hospital dataset from the PhysioNet 2019 challenge files (ARCHITECTURE.md section 26.19).

Usage:
    python ml/build_hospital_dataset.py

Reads   ml/data/raw/physionet/training_setA/*.psv, training_setB/*.psv   (never committed)
        ml/data/raw/physionet/meta.json      the download's record: the units table of the project page
        src/data/indicators.json             the spread floors, shared with the app
Writes  ml/data/processed/hospital/rows_A.npz, rows_B.npz        row-level data: never committed (decision D21)
        ml/data/processed/hospital_dataset_summary.json          counts and settings only: committed

The model may see only changes from each patient's own baseline, never an absolute value (decision
D20). The baseline uses the app's own formula (section 10): the median and 1.4826 x the median
absolute deviation, floored at the indicator's minSpread from src/data/indicators.json. Only the
window differs: each patient's first 24 ICU hours here, about four weeks of days in the app.

Everything a row uses is known at its hour: the baseline comes from hours 1 to 24, and a missing
value is filled only from an earlier hour of the same patient, within a limit.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
sys.path.insert(0, str(ML_DIR))

from personal_pattern import MAD_SCALE, median  # noqa: E402  (the app's baseline formula, ported)

RAW_DIR = REPO_ROOT / 'ml' / 'data' / 'raw' / 'physionet'
META_PATH = RAW_DIR / 'meta.json'
INDICATORS_PATH = REPO_ROOT / 'src' / 'data' / 'indicators.json'
ROWS_DIR = REPO_ROOT / 'ml' / 'data' / 'processed' / 'hospital'
SUMMARY_PATH = REPO_ROOT / 'ml' / 'data' / 'processed' / 'hospital_dataset_summary.json'

# The five challenge variables that match app indicators, in the model's feature order.
VARIABLES = (
    ('HR', 'heart_rate'),
    ('Temp', 'body_temp'),
    ('SBP', 'systolic_bp'),
    ('DBP', 'diastolic_bp'),
    ('Glucose', 'blood_glucose'),
)
NAMES = tuple(name for name, _ in VARIABLES)
# The project page's unit for each variable, and the app's unit for its indicator: the same quantity.
UNIT_WORDS = {'HR': 'beats per minute', 'Temp': 'Deg C', 'SBP': 'mm Hg', 'DBP': 'mm Hg', 'Glucose': 'mg/dL'}
APP_UNITS = {'HR': 'bpm', 'Temp': '°C', 'SBP': 'mmHg', 'DBP': 'mmHg', 'Glucose': 'mg/dL'}

BASELINE_HOURS = 24  # ICULOS 1 to 24
MIN_BASELINE_VALUES = {'HR': 3, 'Temp': 3, 'SBP': 3, 'DBP': 3, 'Glucose': 2}
CARRY_FORWARD_HOURS = {'HR': 4, 'Temp': 4, 'SBP': 4, 'DBP': 4, 'Glucose': 24}  # documented processing choices
SETS = {'A': 'training_setA', 'B': 'training_setB'}
SEED = 42
VALIDATION_SHARE = 0.2
EXCLUSIONS = ('stayAtMost24Hours', 'labelInFirst24Hours', 'tooFewBaselineValues', 'noHourWithAllFive')


# ---------------------------------------------------------------------------
# Reading


def read_patient(path: Path) -> tuple[list[int], dict[str, list[float | None]], list[int]]:
    """(ICU hours, the five variables per hour with None when missing, the hourly label), in hour order."""
    lines = path.read_text(encoding='ascii').splitlines()
    header = lines[0].split('|')
    index = {name: header.index(name) for name in (*NAMES, 'ICULOS', 'SepsisLabel')}
    rows = []
    for line in lines[1:]:
        cells = line.split('|')
        values = {}
        for name in NAMES:
            text = cells[index[name]]
            values[name] = None if text == 'NaN' else float(text)
        rows.append((int(float(cells[index['ICULOS']])), values, int(float(cells[index['SepsisLabel']]))))
    rows.sort(key=lambda row: row[0])
    hours = [row[0] for row in rows]
    return hours, {name: [row[1][name] for row in rows] for name in NAMES}, [row[2] for row in rows]


def load_floors(path: Path = INDICATORS_PATH) -> dict[str, float]:
    indicators = {entry['id']: entry for entry in json.loads(path.read_text(encoding='utf-8'))['indicators']}
    return {name: float(indicators[indicator]['minSpread']) for name, indicator in VARIABLES}


# ---------------------------------------------------------------------------
# One patient


def baseline_of(values: list[float], floor: float) -> tuple[float, float]:
    """The app's baseline formula (src/engine/baseline.ts): median, and 1.4826 x MAD floored at minSpread."""
    center = median(values)
    return center, max(MAD_SCALE * median([abs(value - center) for value in values]), floor)


def patient_rows(
    hours: list[int],
    values: dict[str, list[float | None]],
    labels: list[int],
    floors: dict[str, float],
) -> tuple[str, dict]:
    """('kept', rows) or (exclusion reason, details). Rows hold only what is known at their hour."""
    if not hours or max(hours) <= BASELINE_HOURS:
        return 'stayAtMost24Hours', {}
    if any(label == 1 and hour <= BASELINE_HOURS for hour, label in zip(hours, labels)):
        return 'labelInFirst24Hours', {}
    early = {
        name: [value for hour, value in zip(hours, values[name]) if hour <= BASELINE_HOURS and value is not None]
        for name in NAMES
    }
    short = [name for name in NAMES if len(early[name]) < MIN_BASELINE_VALUES[name]]
    if short:
        return 'tooFewBaselineValues', {'variables': short}
    bases = {name: baseline_of(early[name], floors[name]) for name in NAMES}

    last: dict[str, tuple[int, float] | None] = {name: None for name in NAMES}
    out_hours, out_raw, out_z, out_labels = [], [], [], []
    for position, hour in enumerate(hours):
        for name in NAMES:
            value = values[name][position]
            if value is not None:
                last[name] = (hour, value)
        if hour <= BASELINE_HOURS:
            continue
        current = []
        for name in NAMES:
            seen = last[name]
            if seen is None or hour - seen[0] > CARRY_FORWARD_HOURS[name]:
                break
            current.append(seen[1])
        if len(current) < len(NAMES):
            continue
        out_hours.append(hour)
        out_raw.append(current)
        out_z.append([(value - bases[name][0]) / bases[name][1] for name, value in zip(NAMES, current)])
        out_labels.append(labels[position])
    if not out_hours:
        return 'noHourWithAllFive', {}
    return 'kept', {'hours': out_hours, 'raw': out_raw, 'z': out_z, 'labels': out_labels, 'bases': bases}


# ---------------------------------------------------------------------------
# A hospital


def build_hospital(code: str, floors: dict[str, float], raw_dir: Path = RAW_DIR) -> tuple[dict, dict]:
    files = sorted((raw_dir / SETS[code]).glob('p*.psv'))
    excluded = {reason: 0 for reason in EXCLUSIONS}
    short_by_variable = {name: 0 for name in NAMES}
    patients, hours, raw, z, labels = [], [], [], [], []
    observed = {name: [] for name in NAMES}
    for path in files:
        patient_hours, values, patient_labels = read_patient(path)
        for name in NAMES:
            observed[name].extend(value for value in values[name] if value is not None)
        status, details = patient_rows(patient_hours, values, patient_labels, floors)
        if status != 'kept':
            excluded[status] += 1
            for name in details.get('variables', []):
                short_by_variable[name] += 1
            continue
        patients.extend([path.stem] * len(details['hours']))
        hours.extend(details['hours'])
        raw.extend(details['raw'])
        z.extend(details['z'])
        labels.extend(details['labels'])
    arrays = {
        'patient': np.array(patients),
        'hour': np.array(hours, dtype=np.int32),
        'raw': np.array(raw, dtype=float).reshape(-1, len(NAMES)),
        'z': np.array(z, dtype=float).reshape(-1, len(NAMES)),
        'label': np.array(labels, dtype=np.int8),
    }
    kept_patients = sorted(set(patients))
    summary = {
        'set': SETS[code],
        'patients': len(files),
        'excluded': excluded,
        'tooFewBaselineValuesByVariable': short_by_variable,
        'included': len(kept_patients),
        'rows': int(len(labels)),
        'positiveRows': int(np.sum(arrays['label'])),
        'patientsWithPositiveRow': int(len(set(np.array(patients)[arrays['label'] == 1]))) if labels else 0,
        'observedValues': {
            name: {
                'count': len(observed[name]),
                'p1': float(np.percentile(observed[name], 1)),
                'median': float(np.percentile(observed[name], 50)),
                'p99': float(np.percentile(observed[name], 99)),
            }
            for name in NAMES
        },
    }
    return arrays, summary


def split_hospital_a(patients: np.ndarray, seed: int = SEED) -> dict[str, str]:
    """Patient-level split of hospital A: 80% train, 20% validation. No patient is in both."""
    ids = sorted(set(patients.tolist()))
    order = np.random.default_rng(seed).permutation(len(ids))
    cut = int(round(len(ids) * (1 - VALIDATION_SHARE)))
    return {ids[index]: ('train' if rank < cut else 'validation') for rank, index in enumerate(order)}


def split_counts(arrays: dict, mask: np.ndarray) -> dict:
    labels = arrays['label'][mask]
    patients = arrays['patient'][mask]
    return {
        'patients': int(len(set(patients.tolist()))),
        'rows': int(mask.sum()),
        'positiveRows': int(labels.sum()),
        'patientsWithPositiveRow': int(len(set(patients[labels == 1].tolist()))),
    }


def unit_check(meta: dict, path: Path = INDICATORS_PATH) -> list[dict]:
    indicators = {entry['id']: entry for entry in json.loads(path.read_text(encoding='utf-8'))['indicators']}
    checks = []
    for name, indicator in VARIABLES:
        page_unit = meta['units'][name]
        app_unit = indicators[indicator]['unit']
        checks.append({
            'variable': name,
            'indicator': indicator,
            'physionet': page_unit,
            'app': app_unit,
            'same': UNIT_WORDS[name] in page_unit and app_unit == APP_UNITS[name],
        })
    return checks


def run(raw_dir: Path = RAW_DIR, rows_dir: Path = ROWS_DIR, summary_path: Path = SUMMARY_PATH) -> dict:
    meta = json.loads((raw_dir / 'meta.json').read_text(encoding='utf-8'))
    if not meta.get('complete'):
        raise SystemExit('meta.json says the download is not complete: run ml/fetch_physionet_sepsis.py first')
    units = unit_check(meta)
    if not all(check['same'] for check in units):
        raise SystemExit(f'units differ from the app: {units}')
    floors = load_floors()
    rows_dir.mkdir(parents=True, exist_ok=True)
    hospitals = {}
    for code in SETS:
        arrays, summary = build_hospital(code, floors, raw_dir)
        if code == 'A':
            assignment = split_hospital_a(arrays['patient'])
            arrays['split'] = np.array([assignment[patient] for patient in arrays['patient'].tolist()])
        else:
            arrays['split'] = np.full(len(arrays['label']), 'test')
        np.savez_compressed(rows_dir / f'rows_{code}.npz', **arrays)
        hospitals[code] = (arrays, summary)
    arrays_a, arrays_b = hospitals['A'][0], hospitals['B'][0]
    summary = {
        'schemaVersion': 1,
        'note': 'Counts and settings only; no patient-level data. Written by ml/build_hospital_dataset.py.',
        'source': {
            'dataset': meta['dataset'],
            'version': meta['version'],
            'page': meta['page'],
            'licenseOnPage': meta['license'],
            'licenseFileFirstLine': meta['licenseFile']['firstLine'],
            'datasetDoi': meta['datasetDoi'],
            'retrieved': meta['retrieved'],
        },
        'variables': units,
        'floors': floors,
        'baseline': {
            'hours': [1, BASELINE_HOURS],
            'formula': 'median and 1.4826 x median absolute deviation, floored at minSpread from src/data/indicators.json (section 10)',
            'minValues': MIN_BASELINE_VALUES,
        },
        'carryForwardHours': CARRY_FORWARD_HOURS,
        'rows': 'every ICU hour after hour 24 with all five variables available after carrying the last value forward within its limit',
        'exclusionOrder': list(EXCLUSIONS),
        'hospitals': {code: data[1] for code, data in hospitals.items()},
        'splits': {
            'train': {'hospital': 'A', **split_counts(arrays_a, arrays_a['split'] == 'train')},
            'validation': {'hospital': 'A', **split_counts(arrays_a, arrays_a['split'] == 'validation')},
            'test': {'hospital': 'B', **split_counts(arrays_b, arrays_b['split'] == 'test')},
        },
        'seed': SEED,
        'validationShare': VALIDATION_SHARE,
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with summary_path.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')
    return summary


def main() -> int:
    summary = run()
    for code, hospital in summary['hospitals'].items():
        print(f"hospital {code}: {hospital['patients']} patients, {hospital['included']} included, excluded {hospital['excluded']}, "
              f"{hospital['rows']} rows, {hospital['positiveRows']} labelled rows")
    for name, split in summary['splits'].items():
        print(f"{name}: {split['patients']} patients, {split['rows']} rows, {split['positiveRows']} labelled rows, "
              f"{split['patientsWithPositiveRow']} patients with a labelled row")
    return 0


if __name__ == '__main__':
    sys.exit(main())
