"""Train, evaluate and export the earth-hospital model (ARCHITECTURE.md section 26.19).

Usage:
    python ml/train_earth_hospital.py --seed 42

Reads   ml/data/processed/hospital/rows_A.npz, rows_B.npz   (written by ml/build_hospital_dataset.py; never committed)
        ml/data/processed/hospital_dataset_summary.json     counts and settings
        ml/data/raw/physionet/meta.json                     source, licence and citations
        public/seed/*.json                                  the simulated scenarios, for the sanity check
        src/data/indicators.json, src/data/sources.json
Writes  src/data/models/earth-hospital-v1.json          the model file the app loads
        ml/artifacts/earth-hospital-v1-parity.json      synthetic cases the TypeScript twin must reproduce
        ml/reports/earth-hospital-v1.md                 the model card

Honest split: the scaler, the coefficients and the comparison models are fitted on hospital A
training patients only. C and the operating threshold are chosen on hospital A validation patients
only. Hospital B is scored once, at the end, and nothing is chosen from it. Intervals come from a
bootstrap that resamples patients, not hours. The parity file holds synthetic numbers only, never a
patient row.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import platform
import sys
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.preprocessing import StandardScaler

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
sys.path.insert(0, str(ML_DIR))

import build_hospital_dataset as dataset  # noqa: E402
import personal_pattern as pattern  # noqa: E402  (the app's baseline formula, for the scenario check)

NAME = 'earth-hospital-v1'
APP_MODELS_DIR = REPO_ROOT / 'src' / 'data' / 'models'
ARTIFACTS_DIR = REPO_ROOT / 'ml' / 'artifacts'
REPORTS_DIR = REPO_ROOT / 'ml' / 'reports'
SEED_DIR = REPO_ROOT / 'public' / 'seed'
SOURCES_PATH = REPO_ROOT / 'src' / 'data' / 'sources.json'

C_GRID = (0.01, 0.1, 1.0, 10.0)
TARGET_FALSE_POSITIVE_RATE = 0.01  # design value: a second opinion must stay quiet on ordinary hours
BOOTSTRAP_RESAMPLES = 1000
RELIABILITY_BINS = 10
FEATURES = tuple(
    {'name': f'z_{indicator}', 'indicator': indicator, 'physionet': variable}
    for variable, indicator in dataset.VARIABLES
)
TEMPERATURE = dataset.NAMES.index('Temp')
HEADLINE = 'Your recent changes resemble an early-warning pattern from Earth hospital data'
# Shown on the crew card, so it names no disease; the model card explains the label.
NOTABLE_TEXT = "Taken together, today’s changes from your normal resemble a pattern the model learned from Earth hospital data"
CAVEAT = 'Learned from Earth hospital patients. Never tested on astronauts. A second opinion only.'
SOURCE_IDS = ['physionet-sepsis-2019', 'sepsis-ccm-2020']
NINE_AM_MS = 9 * 3_600_000
MS_PER_DAY = 86_400_000


# ---------------------------------------------------------------------------
# Data


def load_rows(rows_dir: Path = dataset.ROWS_DIR) -> dict[str, dict[str, np.ndarray]]:
    data = {}
    for code in ('A', 'B'):
        with np.load(rows_dir / f'rows_{code}.npz', allow_pickle=False) as arrays:
            data[code] = {key: arrays[key] for key in arrays.files}
    return data


def part(data: dict, code: str, split: str) -> dict[str, np.ndarray]:
    mask = data[code]['split'] == split
    patients = data[code]['patient'][mask]
    _, index = np.unique(patients, return_inverse=True)
    return {'z': data[code]['z'][mask], 'y': data[code]['label'][mask].astype(int), 'patient': index}


# ---------------------------------------------------------------------------
# Thresholds and scores


def operating_threshold(scores: np.ndarray, labels: np.ndarray, target: float = TARGET_FALSE_POSITIVE_RATE) -> float:
    """The lowest score at which at most `target` of the hours without the label are flagged (score >= threshold)."""
    negatives = np.sort(scores[labels == 0])[::-1]
    allowed = int(math.floor(target * len(negatives)))
    if allowed == 0:
        return float(np.nextafter(negatives[0], np.inf))
    threshold = float(negatives[allowed - 1])
    # Ties at the cut would flag more than allowed: move just above them.
    while np.mean(negatives >= threshold) > target:
        threshold = float(np.nextafter(threshold, np.inf))
    return threshold


def best_tss_point(scores: np.ndarray, labels: np.ndarray) -> dict:
    """The threshold with the highest TSS, reported for comparison only."""
    order = np.argsort(-scores, kind='mergesort')
    sorted_scores, sorted_labels = scores[order], labels[order]
    positives, negatives = sorted_labels.sum(), len(sorted_labels) - sorted_labels.sum()
    tp = np.cumsum(sorted_labels)
    fp = np.cumsum(1 - sorted_labels)
    last_of_value = np.r_[sorted_scores[1:] != sorted_scores[:-1], True]
    tss = tp / positives - fp / negatives
    tss = np.where(last_of_value, tss, -np.inf)
    best = int(np.argmax(tss))
    return {
        'threshold': float(sorted_scores[best]),
        'tss': float(tss[best]),
        'sensitivity': float(tp[best] / positives),
        'falsePositiveRate': float(fp[best] / negatives),
    }


def _ratio(top: float, bottom: float) -> float | None:
    return None if bottom == 0 else float(top / bottom)


def at_threshold(scores: np.ndarray, labels: np.ndarray, threshold: float) -> dict:
    flagged = scores >= threshold
    tp = int(np.sum(flagged & (labels == 1)))
    fp = int(np.sum(flagged & (labels == 0)))
    tn = int(np.sum(~flagged & (labels == 0)))
    fn = int(np.sum(~flagged & (labels == 1)))
    sensitivity = _ratio(tp, tp + fn)
    false_positive_rate = _ratio(fp, fp + tn)
    total = tp + fp + tn + fn
    expected = ((tp + fn) * (tp + fp) + (tn + fp) * (tn + fn)) / total if total else 0
    hss = _ratio(tp + tn - expected, total - expected)
    return {
        'confusion': {'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn},
        'sensitivity': sensitivity,
        'falsePositiveRate': false_positive_rate,
        'precision': _ratio(tp, tp + fp),
        'tss': None if sensitivity is None or false_positive_rate is None else sensitivity - false_positive_rate,
        'hss': hss,
    }


def brier(labels: np.ndarray, probabilities: np.ndarray) -> float:
    return float(np.mean((probabilities - labels) ** 2))


def scores_of(labels: np.ndarray, probabilities: np.ndarray, threshold: float, train_rate: float) -> dict:
    own_rate = float(labels.mean())
    reference = brier(labels, np.full(len(labels), train_rate))
    own = brier(labels, np.full(len(labels), own_rate))
    value = brier(labels, probabilities)
    return {
        'rows': int(len(labels)),
        'positiveRows': int(labels.sum()),
        'rocAuc': float(roc_auc_score(labels, probabilities)),
        'prAuc': float(average_precision_score(labels, probabilities)),
        'brier': value,
        'brierSkill': _ratio(reference - value, reference),
        'brierSkillVsOwnBaseRate': _ratio(own - value, own),
        **at_threshold(probabilities, labels, threshold),
    }


# ---------------------------------------------------------------------------
# Patient-level bootstrap


class Ranked:
    """Scores sorted once, so a weighted ROC AUC costs one pass per resample."""

    def __init__(self, scores: np.ndarray, labels: np.ndarray, threshold: float) -> None:
        self.order = np.argsort(scores, kind='mergesort')
        sorted_scores = scores[self.order]
        self.labels = labels[self.order].astype(float)
        self.starts = np.flatnonzero(np.r_[True, sorted_scores[1:] != sorted_scores[:-1]])
        self.flagged = (scores >= threshold)[self.order]

    def auc(self, weights: np.ndarray) -> float:
        w = weights[self.order]
        positive = np.add.reduceat(w * self.labels, self.starts)
        negative = np.add.reduceat(w * (1 - self.labels), self.starts)
        below = np.cumsum(negative) - negative
        total_positive, total_negative = positive.sum(), negative.sum()
        if total_positive == 0 or total_negative == 0:
            return float('nan')
        return float(np.sum(positive * (below + 0.5 * negative)) / (total_positive * total_negative))

    def rates(self, weights: np.ndarray) -> tuple[float, float]:
        w = weights[self.order]
        positives = np.sum(w * self.labels)
        negatives = np.sum(w * (1 - self.labels))
        if positives == 0 or negatives == 0:
            return float('nan'), float('nan')
        sensitivity = np.sum(w * self.labels * self.flagged) / positives
        false_positive_rate = np.sum(w * (1 - self.labels) * self.flagged) / negatives
        return float(sensitivity), float(false_positive_rate)


def bootstrap(models: dict[str, Ranked], patients: np.ndarray, seed: int, resamples: int = BOOTSTRAP_RESAMPLES) -> dict:
    """95% percentile intervals from resampling patients with replacement; every model sees the same resamples."""
    rng = np.random.default_rng(seed)
    count = int(patients.max()) + 1
    draws = {name: {'rocAuc': [], 'tss': [], 'sensitivity': [], 'falsePositiveRate': []} for name in models}
    used = 0
    for _ in range(resamples):
        weights = np.bincount(rng.integers(0, count, count), minlength=count)[patients].astype(float)
        results = {}
        for name, ranked in models.items():
            auc = ranked.auc(weights)
            sensitivity, false_positive_rate = ranked.rates(weights)
            results[name] = (auc, sensitivity, false_positive_rate)
        if any(math.isnan(value) for result in results.values() for value in result):
            continue
        used += 1
        for name, (auc, sensitivity, false_positive_rate) in results.items():
            draws[name]['rocAuc'].append(auc)
            draws[name]['sensitivity'].append(sensitivity)
            draws[name]['falsePositiveRate'].append(false_positive_rate)
            draws[name]['tss'].append(sensitivity - false_positive_rate)

    def interval(values: list[float]) -> list[float]:
        return [float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))]

    out = {name: {key: interval(values) for key, values in metric.items()} for name, metric in draws.items()}
    differences = {}
    for other in [name for name in models if name != 'shipped']:
        differences[other] = {
            key: interval(list(np.array(draws['shipped'][key]) - np.array(draws[other][key])))
            for key in ('rocAuc', 'tss')
        }
    return {'intervals': out, 'shippedMinus': differences, 'resamples': resamples, 'used': used, 'seed': seed,
            'method': 'patients resampled with replacement; percentile 95% interval'}


def finding_of(interval: list[float]) -> str:
    if interval[0] > 0:
        return 'higher'
    if interval[1] < 0:
        return 'lower'
    return 'inconclusive'


# ---------------------------------------------------------------------------
# Models


def fit_shipped(train: dict, validation: dict) -> tuple[dict, list[dict]]:
    scaler = StandardScaler().fit(train['z'])
    trials, best = [], None
    for c in C_GRID:
        # L2 is LogisticRegression's default penalty.
        model = LogisticRegression(C=c, solver='lbfgs', max_iter=1000).fit(scaler.transform(train['z']), train['y'])
        auc = float(roc_auc_score(validation['y'], model.predict_proba(scaler.transform(validation['z']))[:, 1]))
        trials.append({'C': c, 'validationRocAuc': auc})
        if best is None or auc > best[1]:
            best = (c, auc, model)
    c, _, model = best
    params = {
        'C': c,
        'intercept': float(model.intercept_[0]),
        'features': [
            {**feature, 'mean': float(scaler.mean_[index]), 'scale': float(scaler.scale_[index]), 'coef': float(model.coef_[0][index])}
            for index, feature in enumerate(FEATURES)
        ],
    }
    return params, trials


def probability(params: dict, z: np.ndarray) -> np.ndarray:
    """The same arithmetic as the app's logistic.ts: 1 / (1 + exp(-(intercept + sum coef x (z - mean) / scale)))."""
    logit = np.full(len(z), params['intercept'])
    for index, feature in enumerate(params['features']):
        logit = logit + feature['coef'] * (z[:, index] - feature['mean']) / feature['scale']
    return 1 / (1 + np.exp(-logit))


def fit_temperature_only(train: dict) -> tuple[StandardScaler, LogisticRegression]:
    column = train['z'][:, [TEMPERATURE]]
    scaler = StandardScaler().fit(column)
    return scaler, LogisticRegression(C=1.0, solver='lbfgs', max_iter=1000).fit(scaler.transform(column), train['y'])


def reliability(labels: np.ndarray, probabilities: np.ndarray, bins: int = RELIABILITY_BINS) -> list[dict]:
    """Equal-count bins of the model output: mean output against the share of labelled hours."""
    order = np.argsort(probabilities, kind='mergesort')
    rows = []
    for chunk in np.array_split(order, bins):
        rows.append({
            'from': float(probabilities[chunk].min()),
            'to': float(probabilities[chunk].max()),
            'n': int(len(chunk)),
            'meanOutput': float(probabilities[chunk].mean()),
            'observed': float(labels[chunk].mean()),
        })
    return rows


def patient_level(part_data: dict, probabilities: np.ndarray, threshold: float) -> dict:
    """How often a patient sees at least one flagged hour, with and without a labelled hour."""
    flagged = probabilities >= threshold
    patients = part_data['patient']
    count = int(patients.max()) + 1
    any_label = np.bincount(patients, weights=part_data['y'], minlength=count) > 0
    any_flag = np.bincount(patients, weights=flagged.astype(float), minlength=count) > 0
    return {
        'patientsWithLabel': int(any_label.sum()),
        'ofThemFlaggedAtLeastOnce': int((any_label & any_flag).sum()),
        'patientsWithoutLabel': int((~any_label).sum()),
        'ofThemFlaggedAtLeastOnceWithout': int((~any_label & any_flag).sum()),
    }


# ---------------------------------------------------------------------------
# The simulated scenarios: a sanity check in simulation, not a validation


def scenario_scores(params: dict, threshold: float) -> list[dict]:
    """Every crew member of every scenario, scored like the app: today's routine readings against the app baseline."""
    floors = dataset.load_floors()
    results = []
    for path in sorted(SEED_DIR.glob('*.json')):
        if path.name == 'index.json':
            continue
        scenario = json.loads(path.read_text(encoding='utf-8'))
        for day_offset, moment in ((0, 'scenario moment'), (1, 'day before')):
            today = scenario['missionDay'] - day_offset
            now_ms = (today - 1) * MS_PER_DAY + NINE_AM_MS
            for member in scenario['crew']:
                daily: dict[str, dict[int, float]] = {}
                for reading in sorted(scenario['readings'], key=lambda entry: entry['atMs']):
                    if reading['crewId'] != member['id'] or reading['atMs'] > now_ms or reading.get('purpose') == 'recheck':
                        continue
                    daily.setdefault(reading['indicator'], {})[reading['day']] = reading['value']
                z = []
                for variable, indicator in dataset.VARIABLES:
                    values = daily.get(indicator, {})
                    base = pattern.baseline(values, floors[variable], today)
                    if base is None or today not in values:
                        z = None
                        break
                    z.append((values[today] - base[0]) / base[1])
                entry = {'scenario': scenario['scenarioId'], 'moment': moment, 'day': today, 'crewId': member['id']}
                if z is None:
                    entry.update({'scored': False, 'output': None, 'notable': False})
                else:
                    output = float(probability(params, np.array([z]))[0])
                    entry.update({'scored': True, 'output': output, 'notable': output >= threshold, 'z': z})
                results.append(entry)
    return results


# ---------------------------------------------------------------------------
# Parity: synthetic numbers only


def _contributions(params: dict, z: list[float]) -> list[float]:
    return [feature['coef'] * (value - feature['mean']) / feature['scale'] for feature, value in zip(params['features'], z)]


def _factors(z: list[float], contributions: list[float]) -> list[dict]:
    order = sorted(range(len(z)), key=lambda index: (-contributions[index], index))
    return [
        {'indicator': FEATURES[index]['indicator'], 'z': z[index], 'contribution': contributions[index]}
        for index in order[:3]
        if contributions[index] > 0
    ]


def parity_cases(params: dict, threshold: float, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    z_cases = []
    for index, row in enumerate(np.vstack([rng.normal(scale=1.5, size=(12, 5)), [[3.0, 4.0, -1.0, -1.0, 2.0], [0.0] * 5, [4.0, 6.0, 2.0, 0.0, 4.0]]])):
        z = [float(value) for value in row]
        contributions = _contributions(params, z)
        output = float(probability(params, np.array([z]))[0])
        z_cases.append({'id': f'synthetic-z-{index}', 'z': z, 'output': output, 'notable': output >= threshold,
                        'contributions': contributions, 'factors': _factors(z, contributions)})

    floors = dataset.load_floors()
    typical = {'heart_rate': (62, 3), 'body_temp': (36.8, 0.15), 'systolic_bp': (118, 5), 'diastolic_bp': (75, 4), 'blood_glucose': (90, 5)}
    history_cases = []
    for case_id, today, shifts, drop in (
        ('synthetic-history-shifted', 40, {'heart_rate': 18, 'body_temp': 1.4}, None),
        ('synthetic-history-ordinary', 40, {}, None),
        ('synthetic-history-no-glucose-today', 40, {'body_temp': 1.4}, 'blood_glucose'),
        ('synthetic-history-early', 8, {'body_temp': 1.4}, None),
    ):
        daily = {}
        for indicator, (center, spread) in typical.items():
            values = {day: round(float(center + rng.normal(scale=spread)), 2) for day in range(1, today)}
            if indicator != drop:
                values[today] = round(float(center + shifts.get(indicator, 0.0)), 2)
            daily[indicator] = values
        z, expected = [], {'scored': False, 'output': None, 'notable': False, 'z': None, 'factors': []}
        for variable, indicator in dataset.VARIABLES:
            base = pattern.baseline(daily[indicator], floors[variable], today)
            if base is None or today not in daily[indicator]:
                z = None
                break
            z.append((daily[indicator][today] - base[0]) / base[1])
        if z is not None:
            contributions = _contributions(params, z)
            output = float(probability(params, np.array([z]))[0])
            expected = {'scored': True, 'output': output, 'notable': output >= threshold, 'z': z,
                        'factors': _factors(z, contributions)}
        history_cases.append({
            'id': case_id,
            'today': today,
            'dailyValues': {indicator: [[day, value] for day, value in sorted(values.items())] for indicator, values in daily.items()},
            'expected': expected,
        })
    return {
        'schemaVersion': 1,
        'modelId': 'earth-hospital',
        'version': 'v1',
        'tolerance': 1e-9,
        'note': 'Synthetic numbers only: no patient row of the PhysioNet data is in this file. Written by ml/train_earth_hospital.py.',
        'zCases': z_cases,
        'historyCases': history_cases,
    }


# ---------------------------------------------------------------------------
# Build


def limitations(summary: dict) -> list[str]:
    a = summary['hospitals']['A']
    return [
        'ICU patients are already ill: the model learned from people in intensive care, not from healthy people in space.',
        'The data is hourly; the app has one reading a day. The baseline window differs too: the first 24 ICU hours here, about four weeks of days in the app.',
        'ICU glucose is not a fasting value, while the app asks for fasting blood sugar.',
        'Spaceflight changes physiology (fluid shifts, a higher body temperature, lower blood pressure); the model has never seen it.',
        'It has never been tested on astronauts.',
        'Generalizing to other hospital systems is already limited on Earth, as the challenge paper concludes; hospital B measures it here.',
        'Five shared variables are a small part of what clinicians use.',
        'The label is the challenge\'s hourly label: for a patient who develops sepsis it is 1 from 6 hours before onset (Sepsis-3 criteria). Hours after onset count as labelled too.',
        f"The exclusions remove many patients: {a['excluded']['tooFewBaselineValues']} of {a['patients']} in hospital A have too few early values, mostly diastolic blood pressure and glucose.",
        'Missing hours are filled from earlier hours only within fixed limits (vital signs 4 hours, glucose 24 hours); these are processing choices, not findings.',
        'The operating point is set on hospital A validation hours; on hospital B the share of flagged unlabelled hours differs, and the card reports it.',
        'The output is not a validated probability for anyone in space, so the crew card shows no number.',
    ]


def build(seed: int, created_at: str, resamples: int = BOOTSTRAP_RESAMPLES) -> tuple[dict, dict]:
    summary = json.loads(dataset.SUMMARY_PATH.read_text(encoding='utf-8'))
    meta = json.loads((dataset.RAW_DIR / 'meta.json').read_text(encoding='utf-8'))
    data = load_rows()
    train, validation, test = part(data, 'A', 'train'), part(data, 'A', 'validation'), part(data, 'B', 'test')
    train_rate = float(train['y'].mean())

    params, trials = fit_shipped(train, validation)
    p_validation, p_test = probability(params, validation['z']), probability(params, test['z'])
    threshold = operating_threshold(p_validation, validation['y'])

    t_scaler, t_model = fit_temperature_only(train)
    def t_prob(part_data):
        return t_model.predict_proba(t_scaler.transform(part_data['z'][:, [TEMPERATURE]]))[:, 1]
    t_validation, t_test = t_prob(validation), t_prob(test)
    t_threshold = operating_threshold(t_validation, validation['y'])

    boosting = HistGradientBoostingClassifier(random_state=seed).fit(train['z'], train['y'])
    b_validation, b_test = boosting.predict_proba(validation['z'])[:, 1], boosting.predict_proba(test['z'])[:, 1]
    b_threshold = operating_threshold(b_validation, validation['y'])

    def evaluated(part_data, outputs, cut):
        return scores_of(part_data['y'], outputs, cut, train_rate)

    intervals = {}
    for name, part_data, sets in (
        ('validation', validation, {'shipped': (p_validation, threshold), 'temperatureOnly': (t_validation, t_threshold), 'gradientBoosting': (b_validation, b_threshold)}),
        ('test', test, {'shipped': (p_test, threshold), 'temperatureOnly': (t_test, t_threshold), 'gradientBoosting': (b_test, b_threshold)}),
    ):
        ranked = {key: Ranked(outputs, part_data['y'], cut) for key, (outputs, cut) in sets.items()}
        intervals[name] = bootstrap(ranked, part_data['patient'], seed, resamples)

    def comparison(name, threshold_value, outputs_validation, outputs_test):
        return {
            'threshold': threshold_value,
            'validation': evaluated(validation, outputs_validation, threshold_value),
            'test': evaluated(test, outputs_test, threshold_value),
            'testIntervals': intervals['test']['intervals'][name],
            'shippedMinusThis': {
                'test': {
                    key: {
                        'value': evaluated(test, p_test, threshold)[key] - evaluated(test, outputs_test, threshold_value)[key],
                        'ci95': intervals['test']['shippedMinus'][name][key],
                        'finding': finding_of(intervals['test']['shippedMinus'][name][key]),
                    }
                    for key in ('rocAuc', 'tss')
                },
            },
        }

    scenarios = scenario_scores(params, threshold)
    fever = [entry for entry in scenarios if entry['scenario'] == 'fever']
    model = {
        'schemaVersion': 1,
        'modelId': 'earth-hospital',
        'version': 'v1',
        'kind': 'logistic-regression',
        'createdAt': created_at,
        'label': '1: an ICU hour that carries the challenge\'s sepsis label (Sepsis-3 criteria; for a patient who develops sepsis, from 6 hours before onset). 0: any other hour.',
        'features': params['features'],
        'intercept': params['intercept'],
        'threshold': threshold,
        'targetFalsePositiveRate': TARGET_FALSE_POSITIVE_RATE,
        'thresholdRule': f'The lowest output at which at most {TARGET_FALSE_POSITIVE_RATE:.0%} of hospital A validation hours without the label are flagged (output at or above the threshold).',
        'headline': HEADLINE,
        'notableText': NOTABLE_TEXT,
        'caveat': CAVEAT,
        'hyperparameters': {'C': params['C'], 'penalty': 'l2', 'classWeight': None, 'cTrials': trials},
        'data': {
            'source': meta['dataset'],
            'version': meta['version'],
            'page': meta['page'],
            'doi': meta['datasetDoi'],
            'licenseOnPage': meta['license'],
            'licenseFileFirstLine': meta['licenseFile']['firstLine'],
            'citations': meta['citations'],
            'retrieved': meta['retrieved'],
            'baseline': summary['baseline'],
            'carryForwardHours': summary['carryForwardHours'],
            'floors': summary['floors'],
            'variables': summary['variables'],
            'hospitals': {code: {key: value for key, value in hospital.items() if key != 'observedValues'} for code, hospital in summary['hospitals'].items()},
            'splits': summary['splits'],
        },
        'metrics': {
            'validation': {**evaluated(validation, p_validation, threshold), 'intervals': intervals['validation']['intervals']['shipped']},
            'test': {**evaluated(test, p_test, threshold), 'intervals': intervals['test']['intervals']['shipped']},
            'highestTssOnValidation': best_tss_point(p_validation, validation['y']),
            'testReliability': reliability(test['y'], p_test),
            'testPatients': patient_level(test, p_test, threshold),
            'bootstrap': {key: intervals['test'][key] for key in ('resamples', 'used', 'seed', 'method')},
        },
        'comparisons': {
            'climatology': {'trainingBaseRate': train_rate},
            'temperatureOnly': comparison('temperatureOnly', t_threshold, t_validation, t_test),
            'gradientBoosting': comparison('gradientBoosting', b_threshold, b_validation, b_test),
        },
        'scenarioCheck': {
            'note': 'A sanity check in simulation, not a validation: the simulated scenarios scored like the app, today\'s routine readings against the app baseline.',
            'fever': fever,
            'notableAnywhere': [entry for entry in scenarios if entry['notable']],
        },
        'limitations': limitations(summary),
        'sourceIds': SOURCE_IDS,
        'software': {'seed': seed, 'python': platform.python_version(), 'numpy': np.__version__, 'scikitLearn': sklearn.__version__},
    }
    return model, parity_cases(params, threshold, seed)


# ---------------------------------------------------------------------------
# The model card


def _f(value: float | None, digits: int = 3) -> str:
    return 'not available' if value is None else f'{value:.{digits}f}'


def _pct(value: float | None) -> str:
    return 'not available' if value is None else f'{100 * value:.1f}%'


def _ci(pair: list[float], percent: bool = False) -> str:
    return f'{_pct(pair[0])} to {_pct(pair[1])}' if percent else f'{pair[0]:.3f} to {pair[1]:.3f}'


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    return ['| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)] + ['| ' + ' | '.join(row) + ' |' for row in rows]


def model_card(model: dict, sources: dict) -> str:
    lines: list[str] = []
    add = lines.append
    data, metrics, comparisons = model['data'], model['metrics'], model['comparisons']
    add(f"# Model card: Earth hospital second opinion ({model['modelId']} {model['version']})")
    add('')
    add(f"Generated by `ml/train_earth_hospital.py` on {model['createdAt']}. Every number below is written by the script. Do not edit this file by hand.")
    add('')
    add('**Learned from Earth ICU patients. Never tested on astronauts.** A second opinion only: in the app it can only show an insight, never an alert, a status, a route or a message by itself. The crew card shows no number, no percentage and no disease name.')
    add('')
    add('## What it does')
    add('')
    add('A logistic regression on five changes from each person\'s own baseline: heart rate, body temperature, systolic and diastolic blood pressure and glucose, each as a z-score against that person\'s own normal (decision D20: never an absolute value). It learned which combinations of changes came before the challenge\'s sepsis label in Earth ICU patients.')
    add('')
    add(f"Label: {model['label']}")
    add('')
    add(f"In the app, an insight appears when the output is at or above the threshold: headline \"{model['headline']}\", note \"{model['notableText']}\", caveat \"{model['caveat']}\". It needs today's routine readings for all five and a ready baseline for each.")
    add('')
    add('## Data')
    add('')
    add(f"- {data['source']}, version {data['version']}: {data['page']} ({data['doi']}). Retrieved {data['retrieved']['start']} to {data['retrieved']['end']}.")
    add(f"- Licence: the project page and its licence page say \"{data['licenseOnPage']}\". The LICENSE.txt file in the project's files begins \"{data['licenseFileFirstLine'].lstrip('# ')}\". This project follows the attribution terms of both, publishes no part of the database, and keeps the raw files out of git (decision D21).")
    add('- Citations, as PhysioNet asks:')
    for citation in data['citations']:
        add(f'  - {citation}')
    add('')
    add('Units, checked against the app before training:')
    add('')
    lines.extend(_table(['Variable', 'PhysioNet', 'App indicator', 'App unit'], [[v['variable'], v['physionet'], v['indicator'], v['app']] for v in data['variables']]))
    add('')
    add(f"Baseline: ICU hours {data['baseline']['hours'][0]} to {data['baseline']['hours'][1]}; {data['baseline']['formula']}. Floors: " + ', '.join(f'{k} {v:g}' for k, v in data['floors'].items()) + '.')
    add(f"Rows: every hour after hour 24 with all five values available, a missing value filled from an earlier hour only (vital signs up to {data['carryForwardHours']['HR']} hours, glucose up to {data['carryForwardHours']['Glucose']} hours).")
    add('')
    rows = []
    for code, hospital in data['hospitals'].items():
        ex = hospital['excluded']
        rows.append([code, str(hospital['patients']), str(ex['stayAtMost24Hours']), str(ex['labelInFirst24Hours']), str(ex['tooFewBaselineValues']), str(ex['noHourWithAllFive']), str(hospital['included']), str(hospital['rows']), str(hospital['positiveRows'])])
    lines.extend(_table(['Hospital', 'Patients', 'Stay 24 h or less', 'Label in first 24 h', 'Too few early values', 'No hour with all five', 'Included', 'Hours', 'Labelled hours'], rows))
    add('')
    lines.extend(_table(['Split', 'Hospital', 'Patients', 'Hours', 'Labelled hours', 'Patients with a labelled hour'],
                        [[name, split['hospital'], str(split['patients']), str(split['rows']), str(split['positiveRows']), str(split['patientsWithPositiveRow'])] for name, split in data['splits'].items()]))
    add('')
    add('Hospital A is split by patient (80% training, 20% validation, seed 42); no patient is in two splits. Hospital B is the external test, scored once after every choice was fixed.')
    add('')
    add('## Model')
    add('')
    add(f"Logistic regression, L2, no class weights; C = {model['hyperparameters']['C']:g}, chosen by hospital A validation ROC AUC from " + ', '.join(f"{t['C']:g} ({t['validationRocAuc']:.4f})" for t in model['hyperparameters']['cTrials']) + '.')
    add('')
    lines.extend(_table(['Feature', 'Mean', 'Scale', 'Coefficient'], [[f['name'], f'{f["mean"]:+.4f}', f'{f["scale"]:.4f}', f'{f["coef"]:+.4f}'] for f in model['features']]))
    add('')
    add(f"Intercept {model['intercept']:+.4f}. Output = 1 / (1 + exp(-(intercept + sum of coefficient x (z - mean) / scale))).")
    add(f"Threshold {model['threshold']:.6f}: {model['thresholdRule']}")
    add('')
    add('## Results at the operating point')
    add('')
    def result_row(name, scores, intervals):
        return [name, f"{_f(scores['rocAuc'])} ({_ci(intervals['rocAuc'])})", _f(scores['prAuc']), f"{_pct(scores['sensitivity'])} ({_ci(intervals['sensitivity'], True)})",
                f"{_pct(scores['falsePositiveRate'])} ({_ci(intervals['falsePositiveRate'], True)})", _pct(scores['precision']), f"{_f(scores['tss'])} ({_ci(intervals['tss'])})", _f(scores['brierSkill'])]
    lines.extend(_table(['Split', 'ROC AUC (95% interval)', 'PR AUC', 'Sensitivity', 'Unlabelled hours flagged', 'Precision', 'TSS', 'Brier skill vs training rate'],
                        [result_row('Hospital A validation', metrics['validation'], metrics['validation']['intervals']), result_row('Hospital B (external test)', metrics['test'], metrics['test']['intervals'])]))
    add('')
    best = metrics['highestTssOnValidation']
    add(f"For comparison, the highest-TSS point on validation: TSS {best['tss']:.3f} at sensitivity {_pct(best['sensitivity'])} and {_pct(best['falsePositiveRate'])} of unlabelled hours flagged: far too many for a second opinion that must stay quiet.")
    patients = metrics['testPatients']
    add(f"Hospital B patients: {patients['ofThemFlaggedAtLeastOnce']} of {patients['patientsWithLabel']} with a labelled hour had at least one flagged hour; {patients['ofThemFlaggedAtLeastOnceWithout']} of {patients['patientsWithoutLabel']} without one had at least one flagged hour.")
    add(f"Intervals: {metrics['bootstrap']['method']}, {metrics['bootstrap']['used']} of {metrics['bootstrap']['resamples']} resamples, seed {metrics['bootstrap']['seed']}.")
    add('')
    add('## Comparisons on hospital B')
    add('')
    temperature = comparisons['temperatureOnly']['shippedMinusThis']['test']['rocAuc']
    if temperature['finding'] != 'higher':
        add(f"**The shipped model does not beat temperature change alone on hospital B:** the ROC AUC difference interval ({_ci(temperature['ci95'])}) {'includes zero' if temperature['finding'] == 'inconclusive' else 'lies below zero'}. This is no evidence that the other four changes help, and the app shows the model for transparency, not for a claimed gain.")
        add('')
    for key, words in (('temperatureOnly', 'Temperature change alone'), ('gradientBoosting', 'Gradient boosting benchmark (scikit-learn HistGradientBoostingClassifier, default settings)')):
        entry = comparisons[key]
        add(f"- {words}: ROC AUC {_f(entry['test']['rocAuc'])} ({_ci(entry['testIntervals']['rocAuc'])}), TSS {_f(entry['test']['tss'])} at its own 1% point.")
        for metric in ('rocAuc', 'tss'):
            diff = entry['shippedMinusThis']['test'][metric]
            add(f"  - Shipped minus this, {metric}: {diff['value']:+.3f} (95% interval {_ci(diff['ci95'])}): {diff['finding']}.")
    add('')
    add('## Reliability on hospital B')
    add('')
    lines.extend(_table(['Output from', 'to', 'Hours', 'Mean output', 'Share labelled'], [[f"{r['from']:.4f}", f"{r['to']:.4f}", str(r['n']), f"{r['meanOutput']:.4f}", f"{r['observed']:.4f}"] for r in metrics['testReliability']]))
    add('')
    add('## Sanity check in simulation (not a validation)')
    add('')
    add(model['scenarioCheck']['note'])
    add('')
    for entry in model['scenarioCheck']['fever']:
        if entry['scored']:
            add(f"- `fever`, {entry['crewId']}, {entry['moment']} (day {entry['day']}): output {entry['output']:.4f} against threshold {model['threshold']:.4f}: {'an insight' if entry['notable'] else 'no insight'}.")
        else:
            add(f"- `fever`, {entry['crewId']}, {entry['moment']} (day {entry['day']}): not scored, because there are no readings for that day at 09:00.")
    notable = model['scenarioCheck']['notableAnywhere']
    add('')
    add('Insights anywhere in the scenarios: ' + ('; '.join(f"{e['scenario']} {e['crewId']} {e['moment']} (output {e['output']:.4f})" for e in notable) if notable else 'none.'))
    add('')
    add('## Limitations')
    add('')
    for line in model['limitations']:
        add(f'- {line}')
    add('')
    add('## Sources')
    add('')
    for source_id in model['sourceIds']:
        add(f"- `{source_id}`: {sources[source_id]['title']}. {sources[source_id]['url']}")
    add('')
    add('## Reproduce')
    add('')
    add('```')
    add('python ml/fetch_physionet_sepsis.py')
    add('python ml/build_hospital_dataset.py')
    add(f"python ml/train_earth_hospital.py --seed {model['software']['seed']}")
    add('```')
    add('')
    s = model['software']
    add(f"Run with Python {s['python']}, numpy {s['numpy']} and scikit-learn {s['scikitLearn']}. A second run gives the same model file apart from `createdAt`.")
    return '\n'.join(lines) + '\n'


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


def run(seed: int = 42, app_models_dir: Path = APP_MODELS_DIR, artifacts_dir: Path = ARTIFACTS_DIR,
        reports_dir: Path = REPORTS_DIR, created_at: str | None = None, resamples: int = BOOTSTRAP_RESAMPLES) -> dict:
    created = created_at or dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    model, parity = build(seed, created, resamples)
    sources = {entry['id']: entry for entry in json.loads(SOURCES_PATH.read_text(encoding='utf-8'))['sources']}
    _write(app_models_dir / f'{NAME}.json', json.dumps(model, indent=2, allow_nan=False, ensure_ascii=False) + '\n')
    _write(artifacts_dir / f'{NAME}-parity.json', json.dumps(parity, indent=2, allow_nan=False) + '\n')
    _write(reports_dir / f'{NAME}.md', model_card(model, sources))
    return model


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args(argv)
    model = run(seed=args.seed)
    test, validation = model['metrics']['test'], model['metrics']['validation']
    print(f"C {model['hyperparameters']['C']:g}; threshold {model['threshold']:.6f}")
    print(f"validation: ROC AUC {validation['rocAuc']:.3f}, sensitivity {_pct(validation['sensitivity'])}, unlabelled hours flagged {_pct(validation['falsePositiveRate'])}")
    print(f"hospital B: ROC AUC {test['rocAuc']:.3f} ({_ci(test['intervals']['rocAuc'])}), sensitivity {_pct(test['sensitivity'])}, unlabelled hours flagged {_pct(test['falsePositiveRate'])}")
    for key in ('temperatureOnly', 'gradientBoosting'):
        diff = model['comparisons'][key]['shippedMinusThis']['test']['rocAuc']
        print(f"  shipped minus {key}, ROC AUC: {diff['value']:+.3f} ({_ci(diff['ci95'])}): {diff['finding']}")
    for entry in model['scenarioCheck']['fever']:
        print(f"  fever {entry['crewId']} {entry['moment']}: {'output %.4f, notable %s' % (entry['output'], entry['notable']) if entry['scored'] else 'not scored (no readings that day)'}")
    print('insights anywhere in the scenarios:', [(e['scenario'], e['crewId'], e['moment']) for e in model['scenarioCheck']['notableAnywhere']])
    return 0


if __name__ == '__main__':
    sys.exit(main())
