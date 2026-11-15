"""Train, evaluate and export the sep-risk model (ARCHITECTURE.md sections 26.6 to 26.9).

Usage:
    python ml/train_sep_risk.py --seed 42

Reads   ml/data/processed/flares.csv and dataset_summary.json   (written by ml/build_dataset.py)
        src/data/sources.json                                    (titles and links for the references)
Writes  ml/artifacts/sep-risk-v1.json           the model file; every number in it comes from this script
        ml/artifacts/sep-risk-v1-parity.json    rows that the TypeScript twin must reproduce
        ml/reports/sep-risk-v1.md               the model card
        ml/reports/sep-risk-v1-*.png            ROC curve, reliability diagram, coefficients
        src/data/models/sep-risk-v1.json        a copy of the model file for the app

Honest split: the scaler, the coefficients and the value used for a missing
end time come from the training years only. C and the threshold are chosen
on the validation years only. The test years are scored once, at the end,
and nothing is chosen from them. Ambiguous flares are never used.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import platform
import sys
from pathlib import Path

import matplotlib

matplotlib.use('Agg')  # no window: the plots go straight to files

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import sklearn  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import average_precision_score, roc_auc_score, roc_curve  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402

import features  # noqa: E402

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
DATA_DIR = ML_DIR / 'data' / 'processed'
ARTIFACTS_DIR = ML_DIR / 'artifacts'
REPORTS_DIR = ML_DIR / 'reports'
APP_MODELS_DIR = REPO_ROOT / 'src' / 'data' / 'models'
SOURCES_PATH = REPO_ROOT / 'src' / 'data' / 'sources.json'

MODEL_ID = 'sep-risk'
VERSION = 'v1'
NAME = f'{MODEL_ID}-{VERSION}'
C_VALUES = (0.01, 0.1, 1.0, 10.0)
BOOTSTRAP_RESAMPLES = 1000
RELIABILITY_BINS = 5
PARITY_ROWS = 50
SPLITS = ('train', 'validation', 'test')
SOURCE_IDS = ('donki', 'sep-ml-inceoglu-2018', 'sep-gsep-2023')

LABEL_TEXT = (
    '1: flare linked in DONKI, directly or through one linked CME, to a solar energetic particle record '
    'observed by an instrument. 0: no qualifying recorded SEP association. Flares whose only SEP evidence '
    'is model output or of unknown origin are excluded as ambiguous.'
)
THRESHOLD_RULE = 'Highest TSS on the validation set; ties go to the higher threshold'
FILTERS = (
    'GOES class M1.0 or above',
    'begin and peak time present, and the peak not before the begin',
    'source location parseable',
)

# ARCHITECTURE.md section 26.14. Sentences with numbers are added by the script.
LIMITATIONS = (
    "DONKI links are analysts' judgments, and catalog practice changed over time (DONKI notes that the Moon to Mars "
    'Space Weather Analysis Office analyzed its primary catalog entries from June 2020 onward); labels carry that noise.',
    'DONKI keeps SEP records per instrument and energy channel, and some records are model output (instrument names '
    'starting MODEL:). A positive label means "linked to at least one SEP record observed by an instrument", not a '
    'particular intensity or energy. A negative label means "no qualifying recorded SEP association", not that no '
    'particle event occurred.',
    'Flares whose only SEP evidence is model output or of unknown origin are excluded as ambiguous. The model was '
    'neither trained nor tested on them.',
    'DONKI attributes some particle events to CMEs from the far side of the Sun with no visible flare. A flare-based '
    'model cannot see those.',
    'CME analyses can come hours after the flare, so the full estimate is not available in the first minutes.',
    'Positive labels rest on particle events recorded by instruments that DONKI lists and that official instrument '
    'documentation supports as measurements. Names without that support count as unknown. How well the estimate '
    'carries over to a crew elsewhere in the solar system is not tested.',
    'Positive cases are few, so the intervals are wide. This is a prototype estimate for a hackathon, not an '
    'operational forecast.',
)

FEATURE_WORDS = {
    'log10_peak_flux': 'How strong the flare was: the logarithm of its peak X-ray flux, from the GOES class (for example X2.2)',
    'lon_sin': 'Where on the Sun the flare was, east to west: the sine of its longitude, with west positive',
    'lon_cos': 'How close to the centre of the disk the flare was: the cosine of its longitude',
    'log1p_rise_min': 'How fast the flare rose: the logarithm of the minutes from begin to peak',
    'log1p_duration_min': 'How long the flare lasted: the logarithm of the minutes from begin to end',
    'has_cme': 'Whether DONKI links a coronal mass ejection (CME) analysis to the flare: 1 or 0',
    'log1p_cme_speed': 'How fast that CME was: the logarithm of its speed in km/s (0 without a CME)',
    'cme_half_angle_deg': 'How wide that CME was: its half-angle in degrees (0 without a CME)',
}


# --- Data ------------------------------------------------------------------------


def load_rows(path: Path) -> list[dict]:
    """Every row of flares.csv as text; numbers are parsed here, so nothing is rounded on the way."""
    return pd.read_csv(path, dtype=str, keep_default_na=False).to_dict('records')


def observation(row: dict) -> dict:
    """The raw inputs the app receives for one flare (section 26.11)."""
    return {
        'classType': row['classType'],
        'sourceLocation': row['sourceLocation'],
        'riseMin': float(row['riseMin']),
        'durationMin': float(row['durationMin']) if row['durationMin'] else None,
        'cme': {'speedKms': float(row['cmeSpeedKms']), 'halfAngleDeg': float(row['cmeHalfAngleDeg'])} if row['cmeId'] else None,
    }


def scored(rows: list[dict], split: str) -> list[dict]:
    """The positive and negative flares of one split. Ambiguous flares are never trained on or scored."""
    return [row for row in rows if row['split'] == split and row['labelStatus'] in ('positive', 'negative')]


def duration_impute(train_rows: list[dict]) -> float:
    """The training median of log1p_duration_min, used when DONKI has no usable end time."""
    values = [math.log1p(float(row['durationMin'])) for row in train_rows if row['durationMin']]
    return float(np.median(values))


def matrix(rows: list[dict], impute: float) -> np.ndarray:
    return np.array([features.flare_features(observation(row), impute) for row in rows], dtype=float)


def labels(rows: list[dict]) -> np.ndarray:
    return np.array([int(row['label']) for row in rows], dtype=int)


# --- The model as the app evaluates it ------------------------------------------------


def probability(params: dict, values: list[float]) -> float:
    """Plain arithmetic, exactly what src/engine/models/sepRisk.ts does with the model file."""
    logit = params['intercept']
    for value, mean, scale, coef in zip(values, params['mean'], params['scale'], params['coef']):
        logit += coef * (value - mean) / scale
    return 1.0 / (1.0 + math.exp(-logit))


def predict(params: dict, x: np.ndarray) -> np.ndarray:
    return np.array([probability(params, [float(value) for value in row]) for row in x], dtype=float)


# --- Fitting: training years for the fit, validation years for the choices ------------------


def fit_logistic(x_train: np.ndarray, y_train: np.ndarray, x_val: np.ndarray, y_val: np.ndarray) -> tuple[dict, list[dict]]:
    """StandardScaler then L2 logistic regression; C by validation ROC AUC, ties to the smaller C."""
    candidates = []
    for c_value in C_VALUES:
        scaler = StandardScaler().fit(x_train)
        model = LogisticRegression(C=c_value, max_iter=1000).fit(scaler.transform(x_train), y_train)
        params = {
            'C': c_value,
            'mean': [float(value) for value in scaler.mean_],
            'scale': [float(value) for value in scaler.scale_],
            'coef': [float(value) for value in model.coef_[0]],
            'intercept': float(model.intercept_[0]),
        }
        # The exported numbers must give what scikit-learn gives.
        ours = predict(params, x_val)
        theirs = model.predict_proba(scaler.transform(x_val))[:, 1]
        if not np.allclose(ours, theirs, rtol=0, atol=1e-12):
            raise AssertionError('the exported parameters do not reproduce the fitted model')
        params['validationRocAuc'] = float(roc_auc_score(y_val, ours))
        candidates.append(params)
    best = max(candidates, key=lambda item: (item['validationRocAuc'], -item['C']))
    return best, [{'C': item['C'], 'validationRocAuc': item['validationRocAuc']} for item in candidates]


def best_threshold(y: np.ndarray, p: np.ndarray) -> float:
    """The probability with the highest TSS; of equal ones the higher threshold wins."""
    positives, negatives = int(y.sum()), int(len(y) - y.sum())
    best_tss, best_value = -math.inf, None
    for value in sorted(set(float(item) for item in p)):
        flagged = p >= value
        tss = float((flagged & (y == 1)).sum()) / positives - float((flagged & (y == 0)).sum()) / negatives
        if tss >= best_tss:
            best_tss, best_value = tss, value
    return float(best_value)


def fit_all(x_train: np.ndarray, y_train: np.ndarray, x_val: np.ndarray, y_val: np.ndarray, seed: int) -> dict:
    """Every fit and every choice. The test years are not an argument, so they cannot influence anything here."""
    full, full_candidates = fit_logistic(x_train, y_train, x_val, y_val)
    class_only, class_candidates = fit_logistic(x_train[:, :1], y_train, x_val[:, :1], y_val)
    boosting = HistGradientBoostingClassifier(random_state=seed).fit(x_train, y_train)
    return {
        'full': full,
        'fullCandidates': full_candidates,
        'fullThreshold': best_threshold(y_val, predict(full, x_val)),
        'classOnly': class_only,
        'classOnlyCandidates': class_candidates,
        'classOnlyThreshold': best_threshold(y_val, predict(class_only, x_val[:, :1])),
        'boosting': boosting,
        'boostingThreshold': best_threshold(y_val, boosting.predict_proba(x_val)[:, 1]),
        'baseRate': float(y_train.mean()),
    }


# --- Scores ------------------------------------------------------------------------


def confusion(y: np.ndarray, p: np.ndarray, threshold: float) -> dict[str, int]:
    flagged = p >= threshold
    return {
        'tp': int((flagged & (y == 1)).sum()),
        'fp': int((flagged & (y == 0)).sum()),
        'tn': int((~flagged & (y == 0)).sum()),
        'fn': int((~flagged & (y == 1)).sum()),
    }


def _ratio(top: float, bottom: float) -> float | None:
    return float(top) / float(bottom) if bottom else None


def tss_of(counts: dict[str, int]) -> float | None:
    recall, false_rate = _ratio(counts['tp'], counts['tp'] + counts['fn']), _ratio(counts['fp'], counts['fp'] + counts['tn'])
    return None if recall is None or false_rate is None else recall - false_rate


def hss_of(counts: dict[str, int]) -> float | None:
    tp, fp, tn, fn = counts['tp'], counts['fp'], counts['tn'], counts['fn']
    return _ratio(2.0 * (tp * tn - fp * fn), (tp + fn) * (fn + tn) + (tp + fp) * (fp + tn))


def brier(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def scores(y: np.ndarray, p: np.ndarray, threshold: float, base_rate: float) -> dict:
    """ROC AUC, PR AUC, Brier and its skill, and the scores at the threshold.

    `brierSkill` compares with always forecasting the training base rate
    (section 26.7). `brierSkillVsOwnBaseRate` compares with the split's own
    share of positives: a harder reference that nobody could know in
    advance, reported so that a shift in the base rate cannot flatter the model.
    """
    counts = confusion(y, p, threshold)
    reference = brier(y, np.full(len(y), base_rate))
    own = brier(y, np.full(len(y), float(y.mean())))
    return {
        'rocAuc': float(roc_auc_score(y, p)),
        'prAuc': float(average_precision_score(y, p)),
        'brier': brier(y, p),
        'brierSkill': 1.0 - brier(y, p) / reference if reference else None,
        'brierSkillVsOwnBaseRate': 1.0 - brier(y, p) / own if own else None,
        'tss': tss_of(counts),
        'hss': hss_of(counts),
        'precision': _ratio(counts['tp'], counts['tp'] + counts['fp']),
        'recall': _ratio(counts['tp'], counts['tp'] + counts['fn']),
        'falseAlarmRatio': _ratio(counts['fp'], counts['tp'] + counts['fp']),
        'confusion': counts,
    }


def reliability(y: np.ndarray, p: np.ndarray, bins: int = RELIABILITY_BINS) -> list[dict]:
    """Equal-width probability bins: count, mean estimate and observed share of positives."""
    table = []
    for index in range(bins):
        low, high = index / bins, (index + 1) / bins
        inside = (p >= low) & ((p < high) if index < bins - 1 else (p <= high))
        count = int(inside.sum())
        table.append({
            'binFrom': low,
            'binTo': high,
            'n': count,
            'meanPredicted': float(p[inside].mean()) if count else None,
            'observed': float(y[inside].mean()) if count else None,
        })
    return table


def bootstrap(y: np.ndarray, estimates: dict[str, np.ndarray], thresholds: dict[str, float], seed: int, resamples: int = BOOTSTRAP_RESAMPLES) -> dict:
    """95% percentile intervals from resamples of the test set, the same resamples for every model.

    Resamples that hold only one class are skipped. Differences are the
    shipped model minus the other model on the same resample.
    """
    rng = np.random.default_rng(seed)
    names = list(estimates)
    values: dict[str, list[float]] = {}
    used = 0
    for _ in range(resamples):
        picked = rng.integers(0, len(y), len(y))
        sample = y[picked]
        if sample.min() == sample.max():
            continue
        used += 1
        auc = {name: float(roc_auc_score(sample, estimates[name][picked])) for name in names}
        tss = {name: tss_of(confusion(sample, estimates[name][picked], thresholds[name])) for name in names}
        for name in names:
            values.setdefault(f'{name}.rocAuc', []).append(auc[name])
            values.setdefault(f'{name}.tss', []).append(tss[name])
            if name != names[0]:
                values.setdefault(f'{name}.rocAucDifference', []).append(auc[names[0]] - auc[name])
                values.setdefault(f'{name}.tssDifference', []).append(tss[names[0]] - tss[name])
    intervals = {key: [float(value) for value in np.percentile(series, [2.5, 97.5])] for key, series in values.items()}
    return {'resamples': resamples, 'used': used, 'intervals': intervals}


# --- The three outputs ----------------------------------------------------------------


def _number(value: float | None) -> int | float | None:
    if value is None:
        return None
    return int(value) if float(value).is_integer() else float(value)


def parity_rows(test_rows: list[dict], params: dict, impute: float) -> list[dict]:
    """Up to 50 test flares, spread over the split, with at least one without an end time and one with and without a CME."""
    ordered = sorted(test_rows, key=lambda row: row['flrID'])
    if len(ordered) <= PARITY_ROWS:
        chosen = ordered
    else:
        step = len(ordered) / PARITY_ROWS
        chosen = [ordered[int(index * step)] for index in range(PARITY_ROWS)]
        wanted = (
            lambda row: not row['durationMin'],
            lambda row: bool(row['cmeId']),
            lambda row: not row['cmeId'],
        )
        for position, check in enumerate(wanted):
            if not any(check(row) for row in chosen):
                extra = next((row for row in ordered if check(row) and row not in chosen), None)
                if extra is not None:
                    chosen[-1 - position] = extra
        chosen = sorted(chosen, key=lambda row: row['flrID'])
    result = []
    for row in chosen:
        seen = observation(row)
        values = features.flare_features(seen, impute)
        result.append({
            'donkiId': row['flrID'],
            'input': {
                'classType': seen['classType'],
                'sourceLocation': seen['sourceLocation'],
                'riseMin': _number(seen['riseMin']),
                'durationMin': _number(seen['durationMin']),
                'cme': seen['cme'],
            },
            'features': dict(zip(features.FEATURE_NAMES, values)),
            'probability': probability(params, values),
        })
    return result


def _finding(what: str, other: str, interval: list[float]) -> str:
    low, high = interval
    if low > 0:
        return f'The whole interval is above zero: on the test years the shipped model had the higher {what} than {other}.'
    if high < 0:
        return f'The whole interval is below zero: on the test years the shipped model had the lower {what} than {other}.'
    return f'The interval includes zero: the test years do not show a difference in {what} between the shipped model and {other}.'


def build_model(rows: list[dict], summary: dict, seed: int, created_at: str, resamples: int = BOOTSTRAP_RESAMPLES) -> tuple[dict, dict, dict]:
    """Fits, scores and assembles the model file. Returns it with the parity file and what the plots need."""
    parts = {name: scored(rows, name) for name in SPLITS}
    impute = duration_impute(parts['train'])
    x = {name: matrix(parts[name], impute) for name in SPLITS}
    y = {name: labels(parts[name]) for name in SPLITS}

    fitted = fit_all(x['train'], y['train'], x['validation'], y['validation'], seed)
    full, class_only, boosting = fitted['full'], fitted['classOnly'], fitted['boosting']
    base_rate = fitted['baseRate']

    # From here on nothing is chosen any more: the test years are only scored.
    estimates = {
        name: {
            'full': predict(full, x[name]),
            'classOnly': predict(class_only, x[name][:, :1]),
            'gradientBoosting': boosting.predict_proba(x[name])[:, 1],
        }
        for name in ('validation', 'test')
    }
    thresholds = {'full': fitted['fullThreshold'], 'classOnly': fitted['classOnlyThreshold'], 'gradientBoosting': fitted['boostingThreshold']}
    result = {
        split: {name: scores(y[split], estimates[split][name], thresholds[name], base_rate) for name in thresholds}
        for split in ('validation', 'test')
    }
    boot = bootstrap(y['test'], estimates['test'], thresholds, seed, resamples)
    intervals = boot['intervals']

    test = dict(result['test']['full'])
    test['rocAucCi95'] = intervals['full.rocAuc']
    test['tssCi95'] = intervals['full.tss']
    flagged = int((estimates['test']['full'] >= thresholds['full']).sum())

    def comparison(name: str, words: str) -> dict:
        ours, theirs = result['test']['full'], result['test'][name]
        return {
            'threshold': thresholds[name],
            'validation': {key: result['validation'][name][key] for key in ('rocAuc', 'tss', 'brierSkill')},
            'test': {
                'rocAuc': theirs['rocAuc'],
                'rocAucCi95': intervals[f'{name}.rocAuc'],
                'prAuc': theirs['prAuc'],
                'tss': theirs['tss'],
                'tssCi95': intervals[f'{name}.tss'],
                'brierSkill': theirs['brierSkill'],
                'brierSkillVsOwnBaseRate': theirs['brierSkillVsOwnBaseRate'],
            },
            'shippedMinusThis': {
                'rocAuc': ours['rocAuc'] - theirs['rocAuc'],
                'rocAucCi95': intervals[f'{name}.rocAucDifference'],
                'tss': ours['tss'] - theirs['tss'],
                'tssCi95': intervals[f'{name}.tssDifference'],
            },
            'finding': ' '.join((
                _finding('ROC AUC', words, intervals[f'{name}.rocAucDifference']),
                _finding('TSS', words, intervals[f'{name}.tssDifference']),
            )),
        }

    by_split = summary['flares']['labelsBySplit']
    splits = {
        name: {
            'years': summary['splits']['years'][name],
            'n': len(parts[name]),
            'positives': int(y[name].sum()),
            'excludedAmbiguous': by_split[name]['ambiguous'],
        }
        for name in SPLITS
    }
    for name in SPLITS:
        if (splits[name]['n'], splits[name]['positives']) != (by_split[name]['scored'], by_split[name]['positive']):
            raise AssertionError('flares.csv and dataset_summary.json disagree; run ml/build_dataset.py again')

    rates = {name: splits[name]['positives'] / splits[name]['n'] for name in SPLITS}
    limitations = list(LIMITATIONS) + [
        f"The validation years hold only {splits['validation']['positives']} positive flares out of {splits['validation']['n']}, "
        'so the choice of C and the threshold rest on few cases.',
        f"The share of positive flares differs between the splits: {100 * rates['train']:.1f}% in the training years, "
        f"{100 * rates['validation']:.1f}% in the validation years and {100 * rates['test']:.1f}% in the test years. "
        'DONKI lists many more flares per year in the recent years, so estimates learned from the early years can be '
        'too high or too low for the recent ones.',
    ]
    # What the test years showed. These sentences report; they choose nothing.
    false_alarms = test['confusion']['fp']
    limitations.append(
        f'On the test years the threshold flagged {flagged} flares, and {false_alarms} of them '
        f'({100 * false_alarms / flagged:.1f}%) had no qualifying recorded SEP association'
        + ('; most alerts from this model are expected to be false alarms.' if false_alarms > flagged / 2 else '.')
    )
    reliability_table = reliability(y['test'], estimates['test']['full'])
    lowest = reliability_table[0]
    if lowest['n'] and lowest['meanPredicted'] > lowest['observed']:
        limitations.append(
            f"On the test years the estimates below {100 * lowest['binTo']:.0f}% were too high on average: the mean "
            f"estimate was {100 * lowest['meanPredicted']:.1f}%, and {100 * lowest['observed']:.1f}% of those flares were positive."
        )

    model = {
        'schemaVersion': 1,
        'modelId': MODEL_ID,
        'version': VERSION,
        'kind': 'logistic-regression',
        'createdAt': created_at,
        'label': LABEL_TEXT,
        'data': {
            'source': summary['source']['name'],
            'sourceId': 'donki',
            'apiBase': summary['source']['apiBase'],
            'retrievedFrom': summary['source']['retrievedFrom'],
            'retrievedAt': summary['source']['retrievedTo'],
            'firstFlare': min(row['peakTime'] for name in SPLITS for row in parts[name]),
            'lastFlare': max(row['peakTime'] for name in SPLITS for row in parts[name]),
            'filters': list(FILTERS),
            'dropped': summary['flares']['dropped'],
            'sepRecordClasses': summary['sepRecordClasses']['total'],
            'splits': splits,
        },
        'features': [
            {
                'name': name,
                'group': group,
                'mean': full['mean'][index],
                'scale': full['scale'][index],
                'coef': full['coef'][index],
                'impute': impute if name == features.DURATION_FEATURE else None,
            }
            for index, (name, group) in enumerate(features.FEATURES)
        ],
        'intercept': full['intercept'],
        'hyperparameters': {'C': full['C'], 'penalty': 'l2', 'classWeight': None, 'candidates': fitted['fullCandidates']},
        'threshold': thresholds['full'],
        'thresholdRule': THRESHOLD_RULE,
        'metrics': {
            'validation': result['validation']['full'],
            'test': test,
            'testFlaggedAtThreshold': {'flagged': flagged, 'of': len(y['test'])},
            'bootstrap': {'resamples': boot['resamples'], 'used': boot['used'], 'seed': seed, 'method': 'percentile'},
            'reliability': reliability_table,
        },
        'comparisons': {
            'climatology': {
                'trainingBaseRate': base_rate,
                'test': {'brier': brier(y['test'], np.full(len(y['test']), base_rate))},
            },
            'classOnly': {'C': class_only['C'], **comparison('classOnly', 'flare class alone')},
            'gradientBoosting': comparison('gradientBoosting', 'gradient boosting'),
        },
        'limitations': limitations,
        'sourceIds': list(SOURCE_IDS),
        'training': {
            'seed': seed,
            'python': platform.python_version(),
            'numpy': np.__version__,
            'scikitLearn': sklearn.__version__,
            'pandas': pd.__version__,
            'matplotlib': matplotlib.__version__,
        },
    }
    parity = {
        'schemaVersion': 1,
        'modelId': MODEL_ID,
        'version': VERSION,
        'note': 'Rows from the test years. The TypeScript model must give each feature within 1e-12 and the probability within 1e-9.',
        'rows': parity_rows(parts['test'], full, impute),
    }
    plots = {
        'y': y['test'],
        'estimates': estimates['test'],
        'threshold': thresholds['full'],
        'point': (result['test']['full']['confusion'], y['test']),
    }
    return model, parity, plots


# --- Plots ----------------------------------------------------------------------------


def _save(figure, path: Path) -> None:
    # No software stamp, so the same data gives the same file.
    figure.savefig(path, dpi=150, metadata={'Software': None})
    plt.close(figure)


def write_plots(model: dict, plots: dict, out_dir: Path) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    names = {'roc': f'{NAME}-roc.png', 'reliability': f'{NAME}-reliability.png', 'coefficients': f'{NAME}-coefficients.png'}

    figure, axis = plt.subplots(figsize=(6, 6))
    for key, text in (('full', 'Shipped model'), ('classOnly', 'Flare class alone'), ('gradientBoosting', 'Gradient boosting')):
        false_rate, true_rate, _ = roc_curve(plots['y'], plots['estimates'][key])
        axis.plot(false_rate, true_rate, label=text)
    counts = model['metrics']['test']['confusion']
    axis.plot(
        [counts['fp'] / (counts['fp'] + counts['tn'])], [counts['tp'] / (counts['tp'] + counts['fn'])],
        marker='o', linestyle='none', color='black', label='Shipped model at its threshold',
    )
    axis.plot([0, 1], [0, 1], linestyle='--', color='gray', label='Chance')
    axis.set_xlabel('Share of negative flares flagged (false positive rate)')
    axis.set_ylabel('Share of positive flares flagged (true positive rate)')
    axis.set_title(f'{NAME}: ROC curve on the test years')
    axis.legend(loc='lower right')
    figure.tight_layout()
    _save(figure, out_dir / names['roc'])

    figure, axis = plt.subplots(figsize=(6, 6))
    filled = [row for row in model['metrics']['reliability'] if row['n']]
    axis.plot([0, 1], [0, 1], linestyle='--', color='gray', label='Perfectly reliable')
    axis.plot([row['meanPredicted'] for row in filled], [row['observed'] for row in filled], marker='o', label='Shipped model')
    for row in filled:
        axis.annotate(f"n={row['n']}", (row['meanPredicted'], row['observed']), textcoords='offset points', xytext=(6, 6))
    axis.set_xlim(0, 1)
    axis.set_ylim(0, 1)
    axis.set_xlabel('Mean estimated chance in the bin')
    axis.set_ylabel('Share of positive flares in the bin')
    axis.set_title(f'{NAME}: reliability on the test years')
    axis.legend(loc='upper left')
    figure.tight_layout()
    _save(figure, out_dir / names['reliability'])

    figure, axis = plt.subplots(figsize=(7, 4.5))
    labels_, values = [item['name'] for item in model['features']], [item['coef'] for item in model['features']]
    axis.barh(labels_[::-1], values[::-1])
    axis.axvline(0, color='black', linewidth=0.8)
    axis.set_xlabel('Coefficient (per standard deviation of the feature)')
    axis.set_title(f'{NAME}: coefficients')
    figure.tight_layout()
    _save(figure, out_dir / names['coefficients'])
    return names


# --- The model card ---------------------------------------------------------------------


def _f(value: float | None, digits: int = 3) -> str:
    return 'n/a' if value is None else f'{value:.{digits}f}'


def _pct(value: float | None) -> str:
    return 'n/a' if value is None else f'{100 * value:.1f}%'


def _range(pair: list[float]) -> str:
    return f'{pair[0]:.3f} to {pair[1]:.3f}'


def _table(header: list[str], rows: list[list[object]]) -> list[str]:
    lines = ['| ' + ' | '.join(header) + ' |', '|' + '|'.join('---' for _ in header) + '|']
    lines += ['| ' + ' | '.join(str(cell) for cell in row) + ' |' for row in rows]
    return lines


def model_card(model: dict, summary: dict, sources: dict[str, dict], plot_names: dict[str, str]) -> str:
    data, metrics, comparisons = model['data'], model['metrics'], model['comparisons']
    validation, test = metrics['validation'], metrics['test']
    flares = summary['flares']
    classes = summary['sepRecordClasses']
    by_name = {item['name']: item for item in model['features']}
    lines: list[str] = []
    add = lines.append

    add(f'# Model card: {MODEL_ID} {VERSION}')
    add('')
    add(f"Generated by `ml/train_sep_risk.py` on {model['createdAt']}. Every number below is written by the script. Do not edit this file by hand.")
    add('')
    add('## Purpose')
    add('')
    add('For a solar flare of class M1.0 or above, the model gives an output between 0 and 1 for whether NASA DONKI analysts link it to a solar energetic particle (SEP) event that an instrument observed. The app shows this output to the crew as an "Experimental model score" out of 100, never as a percent chance; "Reliability on the test years" below shows how the output compares with what was recorded.')
    add('')
    add('In the app the estimate may raise one watch-level alert, `R-RAD-03`, labeled "Model estimate". It never raises an act-level alert and never changes a route by itself.')
    add('')
    add('It is a logistic regression on eight features from DONKI flare and CME records, evaluated on held-out years. It is a prototype for a hackathon, not an operational forecast.')
    add('')
    add('## Data and retrieval')
    add('')
    add(f"- Source: {data['source']} (NASA Community Coordinated Modeling Center), from `{data['apiBase']}`.")
    add(f"- Retrieved from {data['retrievedFrom']} to {data['retrievedAt']}, for {summary['source']['requested']['start']} to {summary['source']['requested']['end']}.")
    add(f"- Raw records: {summary['source']['rawRecords']['FLR']} flares, {summary['source']['rawRecords']['CME']} CMEs and {summary['source']['rawRecords']['SEP']} SEP records. The raw files are only read, never changed.")
    add(f"- Flares used: peak times from {data['firstFlare']} to {data['lastFlare']}.")
    catalogs = summary['catalogs']
    add('- Catalogs: ' + '; '.join(
        f"{kind}: " + ', '.join(f"{name} ({sum(years.values())})" for name, years in catalogs[kind].items()) for kind in ('FLR', 'CME', 'SEP')
    ) + '.')
    add('- DONKI describes its content as experimental research information. Official U.S. space weather forecasts come from NOAA\'s Space Weather Prediction Center.')
    add('')
    add('## Label and selection policy')
    add('')
    add('Team decision D22 (ARCHITECTURE.md section 26.4):')
    add('')
    add(f"- **Positive (1):** {summary['labelPolicy']['positive']}.")
    add(f"- **Excluded as ambiguous:** {summary['labelPolicy']['ambiguous']}.")
    add(f"- **Negative (0):** {summary['labelPolicy']['negative']}.")
    add('')
    add(f"Why: {classes['total']['modelOnly']} of the {sum(classes['total'].values())} SEP records are model output, not measurements. Counting them would let model output become the answer this model learns. Turning them into negatives would hide real uncertainty.")
    add('')
    add('### Instrument names and their classes')
    add('')
    add('A name counts as `observed` only when official instrument documentation shows an instrument that measures particles and the DONKI record context fits a measurement. A name that starts with `MODEL:` is `model`, also when it contains a real instrument. Every other name is `unknown`.')
    add('')
    checked = summary['instrumentTable']['checked'] or {}
    add(f"Checked on {checked.get('on')} by: {checked.get('by')}")
    add('')
    lines += _table(
        ['Instrument name in DONKI', 'Class', 'SEP records', 'Basis', 'Sources'],
        [
            [
                f"`{item['displayName']}`", item['class'], item['records'], item['basis'],
                ', '.join(f"[{source['title']}]({source['url']})" for source in item['sources']) or 'none',
            ]
            for item in summary['instrumentInventory']
        ],
    )
    add('')
    add('### SEP record classes')
    add('')
    add('A record is observed-only when every instrument name is observed, mixed when it has an observed name together with model or unknown names, model-only when every name is model, and unknown otherwise. Observed-only and mixed records count as instrument-observed.')
    add('')
    header = ['', 'Observed-only', 'Mixed', 'Model-only', 'Unknown']
    keys = ('observedOnly', 'mixed', 'modelOnly', 'unknown')
    lines += _table(['Split'] + header[1:], [[f"{name} ({summary['splits']['years'][name]})"] + [classes['bySplit'][name][key] for key in keys] for name in SPLITS] + [['all'] + [classes['total'][key] for key in keys]])
    add('')
    lines += _table(['Year of the SEP record'] + header[1:], [[year] + [counts[key] for key in keys] for year, counts in classes['byYear'].items()])
    add('')
    other = summary['mixedRecordOtherNames']
    if other:
        add('Model and unknown names inside mixed records, kept and reported:')
        add('')
        lines += _table(['Name', 'Class', 'Records'], [[f"`{item['displayName']}`", item['class'], item['records']] for item in other])
    else:
        add('No record in this download is mixed: every SEP record lists exactly one instrument name, so there are no model or unknown parts inside observed records to report.')
    add('')
    add('### Flare labels and exclusions')
    add('')
    label_keys = ('positive', 'negative', 'ambiguous')
    lines += _table(
        ['Split', 'Positive', 'Negative', 'Excluded as ambiguous', 'Scored (positive + negative)'],
        [[f"{name} ({summary['splits']['years'][name]})"] + [flares['labelsBySplit'][name][key] for key in label_keys] + [flares['labelsBySplit'][name]['scored']] for name in SPLITS]
        + [['all'] + [flares['labels'][key] for key in label_keys] + [flares['labels']['scored']]],
    )
    add('')
    lines += _table(
        ['Flare peak year', 'Positive', 'Negative', 'Excluded as ambiguous'],
        [[year] + [counts[key] for key in label_keys] for year, counts in flares['labelsByYear'].items()],
    )
    add('')
    add('Excluded flares by the kind of SEP record they reach: ' + (', '.join(f'{name}: {count}' for name, count in flares['ambiguousByEvidence'].items()) or 'none') + '.')
    add(f"{flares['positivesThatAlsoReachModelOrUnknownRecords']} positive flares also reach model-only or unknown records; they stay positive.")
    add('A negative label means "no qualifying recorded SEP association". It does not show that no particle event occurred.')
    add('')
    add('## Filters and drop counts')
    add('')
    add(f"Of {flares['raw']} flare records, {flares['eligible']} are eligible. Filters: " + '; '.join(data['filters']) + '.')
    add('')
    lines += _table(['Dropped because', 'Flares'], [[reason, count] for reason, count in data['dropped'].items()])
    add('')
    add(f"{flares['withoutUsableEndTime']} eligible flares have no usable end time ({flares['endTimeBeforePeakTreatedAsMissing']} of them have an end time before the peak, which counts as missing). Their duration feature uses the training median.")
    add(f"{flares['withLinkedCmeAnalysis']} eligible flares have a linked CME analysis.")
    add('')
    add('## Features')
    add('')
    lines += _table(['Feature', 'Group', 'In plain words'], [[f'`{name}`', group, FEATURE_WORDS[name]] for name, group in features.FEATURES])
    add('')
    add('Nothing known only after the particle event is used as a feature.')
    add('')
    add('## Splits')
    add('')
    add('By flare peak year (UTC), in time order. No shuffling across years.')
    add('')
    lines += _table(
        ['Split', 'Years', 'Flares scored', 'Positives', 'Share positive', 'Excluded as ambiguous'],
        [[name, data['splits'][name]['years'], data['splits'][name]['n'], data['splits'][name]['positives'], _pct(data['splits'][name]['positives'] / data['splits'][name]['n']), data['splits'][name]['excludedAmbiguous']] for name in SPLITS],
    )
    add('')
    changes = summary['splits']['boundaryChanges']
    if changes:
        add('Split boundaries moved because a split had fewer than ' + str(summary['splits']['minimumPositives']) + ' positives: ' + '; '.join(f"{item['boundary']} from {item['lastYearBefore']} to {item['lastYearAfter']} ({item['reason']})" for item in changes) + '.')
    else:
        add(f"The planned boundaries were kept: every split has at least {summary['splits']['minimumPositives']} positives.")
    add('')
    add('## Training choices')
    add('')
    add('- Standardization (mean and scale) and the coefficients are fitted on the training years only.')
    add(f"- A missing end time uses the training median of `log1p_duration_min`: {_f(by_name[features.DURATION_FEATURE]['impute'], 4)}.")
    add('- Logistic regression with an L2 penalty, the `lbfgs` solver, at most 1000 iterations, no class weights.')
    add('- `C` chosen on the validation years by ROC AUC, ties to the smaller value: ' + ', '.join(f"C={item['C']:g}: {_f(item['validationRocAuc'])}" for item in model['hyperparameters']['candidates']) + f". Chosen: C={model['hyperparameters']['C']:g}.")
    add(f"- Threshold rule: {model['thresholdRule']}. Value: {_f(model['threshold'], 4)}.")
    add('- The test years were scored once, after these choices. Nothing was chosen from them.')
    training = model['training']
    add(f"- Seed {training['seed']}. Python {training['python']}, numpy {training['numpy']}, scikit-learn {training['scikitLearn']}, pandas {training['pandas']}, matplotlib {training['matplotlib']}.")
    add('')
    add('## Results')
    add('')
    add('What the scores mean: ROC AUC says how well the estimates rank positive flares above negative ones (0.5 is chance, 1 is perfect). PR AUC is the average precision. The Brier score is the mean squared error of the estimates; its skill score compares it with always forecasting the training base rate (above 0 is better than that). TSS is the share of positives flagged minus the share of negatives flagged. HSS is the skill beyond chance agreement. The false alarm ratio is the share of flagged flares that were negative.')
    add('')

    def row(name: str, values: dict) -> list[object]:
        counts = values['confusion']
        return [name, _f(values['rocAuc']), _f(values['prAuc']), _f(values['brier'], 4), _f(values['brierSkill']), _f(values['tss']), _f(values['hss']), _f(values['precision']), _f(values['recall']), _f(values['falseAlarmRatio']), f"{counts['tp']} / {counts['fp']} / {counts['tn']} / {counts['fn']}"]

    lines += _table(
        ['Shipped model on', 'ROC AUC', 'PR AUC', 'Brier', 'Brier skill', 'TSS', 'HSS', 'Precision', 'Recall', 'False alarm ratio', 'TP / FP / TN / FN'],
        [row(f"validation ({data['splits']['validation']['years']})", validation), row(f"test ({data['splits']['test']['years']})", test)],
    )
    add('')
    boot = metrics['bootstrap']
    add(f"95% intervals on the test years ({boot['used']} of {boot['resamples']} bootstrap resamples used, seed {boot['seed']}, percentile method): ROC AUC {_range(test['rocAucCi95'])}; TSS {_range(test['tssCi95'])}.")
    add('')
    flagged = metrics['testFlaggedAtThreshold']
    add(f"At the threshold the model flags {flagged['flagged']} of the {flagged['of']} test flares ({_pct(flagged['flagged'] / flagged['of'])}). {test['confusion']['tp']} of the {test['confusion']['tp'] + test['confusion']['fn']} positive flares are among them, and {test['confusion']['fp']} of the flagged flares are negative.")
    add('')
    test_rate = data['splits']['test']['positives'] / data['splits']['test']['n']
    add(f"The Brier skill above compares with always forecasting the training base rate ({_pct(comparisons['climatology']['trainingBaseRate'])}). The test years have a much lower share of positives ({_pct(test_rate)}), so that reference is easy to beat. Against a constant forecast of the test years' own share, which nobody could know in advance, the Brier skill is {_f(test['brierSkillVsOwnBaseRate'])}.")
    add('')
    add('### Comparison with the planned baselines, on the same test years')
    add('')
    class_only, boosting = comparisons['classOnly'], comparisons['gradientBoosting']
    lines += _table(
        ['Model', 'ROC AUC (95% interval)', 'PR AUC', 'TSS (95% interval)', 'Brier skill (training base rate)', "Brier skill (test years' own base rate)"],
        [
            ['Shipped: logistic regression, eight features', f"{_f(test['rocAuc'])} ({_range(test['rocAucCi95'])})", _f(test['prAuc']), f"{_f(test['tss'])} ({_range(test['tssCi95'])})", _f(test['brierSkill']), _f(test['brierSkillVsOwnBaseRate'])],
            ['Baseline: logistic regression on flare class alone', f"{_f(class_only['test']['rocAuc'])} ({_range(class_only['test']['rocAucCi95'])})", _f(class_only['test']['prAuc']), f"{_f(class_only['test']['tss'])} ({_range(class_only['test']['tssCi95'])})", _f(class_only['test']['brierSkill']), _f(class_only['test']['brierSkillVsOwnBaseRate'])],
            ['Benchmark: gradient boosting (not shipped)', f"{_f(boosting['test']['rocAuc'])} ({_range(boosting['test']['rocAucCi95'])})", _f(boosting['test']['prAuc']), f"{_f(boosting['test']['tss'])} ({_range(boosting['test']['tssCi95'])})", _f(boosting['test']['brierSkill']), _f(boosting['test']['brierSkillVsOwnBaseRate'])],
            [f"Reference: always the training base rate ({_pct(comparisons['climatology']['trainingBaseRate'])})", '0.500 by definition', 'n/a', '0.000 by definition', '0.000 by definition', 'n/a'],
        ],
    )
    add('')
    add(f"On the validation years the ROC AUC was {_f(validation['rocAuc'])} for the shipped model, {_f(class_only['validation']['rocAuc'])} for flare class alone and {_f(boosting['validation']['rocAuc'])} for gradient boosting.")
    add('')
    for name, words in (('classOnly', 'flare class alone'), ('gradientBoosting', 'gradient boosting')):
        difference = comparisons[name]['shippedMinusThis']
        add(f"- Shipped model minus {words}: ROC AUC {difference['rocAuc']:+.3f} (95% interval {_range(difference['rocAucCi95'])}); TSS {difference['tss']:+.3f} (95% interval {_range(difference['tssCi95'])}). {comparisons[name]['finding']}")
    add('')
    add('Each model has its own threshold, chosen by the same rule on the validation years. The intervals use the same resamples for every model.')
    add('')
    add('### Reliability on the test years')
    add('')
    lines += _table(
        ['Model output', 'Flares', 'Mean output', 'Share that were positive'],
        [[f"{item['binFrom']:.1f} to {item['binTo']:.1f}", item['n'], _pct(item['meanPredicted']), _pct(item['observed'])] for item in metrics['reliability']],
    )
    add('')
    add('A reliable model has the two right-hand columns close to each other. Where the mean estimate is above the share that were positive, the estimates were too high.')
    add('')
    add('### Plots')
    add('')
    add(f"![ROC curve on the test years]({plot_names['roc']})")
    add('')
    add(f"ROC curve: the shipped model's ROC AUC on the test years is {_f(test['rocAuc'])}; flare class alone gives {_f(class_only['test']['rocAuc'])} and gradient boosting {_f(boosting['test']['rocAuc'])}.")
    add('')
    add(f"![Reliability diagram on the test years]({plot_names['reliability']})")
    add('')
    filled = [item for item in metrics['reliability'] if item['n']]
    add(f"Reliability: {filled[0]['n']} of the {flagged['of']} test flares fall in the lowest bin, where the mean estimate is {_pct(filled[0]['meanPredicted'])} and {_pct(filled[0]['observed'])} were positive.")
    add('')
    add(f"![Coefficients]({plot_names['coefficients']})")
    add('')
    largest = max(model['features'], key=lambda item: abs(item['coef']))
    add(f"Coefficients: the largest in size is `{largest['name']}` ({largest['coef']:+.3f} per standard deviation).")
    add('')
    add('## Model parameters')
    add('')
    lines += _table(
        ['Feature', 'Group', 'Mean', 'Scale', 'Coefficient'],
        [[f"`{item['name']}`", item['group'], _f(item['mean'], 4), _f(item['scale'], 4), f"{item['coef']:+.4f}"] for item in model['features']],
    )
    add('')
    add(f"Intercept: {model['intercept']:+.4f}. Output = 1 / (1 + exp(-(intercept + sum of coefficient x (value - mean) / scale))). The app shows it as an \"Experimental model score\": the output times 100, a whole number from 1 to 99, never a percent chance.")
    add('')
    add('## Limitations')
    add('')
    lines += [f'- {text}' for text in model['limitations']]
    add('')
    add('## References')
    add('')
    for source_id in model['sourceIds']:
        source = sources.get(source_id)
        if source:
            checked = 'verified by the team' if source.get('verified') else 'not yet verified by the team'
            add(f"- {source['title']}. {source['publisher']}. {source['url']} (`{source_id}`; {checked})")
    used = {source['id']: source for item in summary['instrumentInventory'] for source in item['sources']}
    for source in used.values():
        add(f"- {source['title']}. {source['publisher']}. {source['url']} (instrument documentation, `ml/sep_instrument_classes.json`)")
    add('')
    add('## How to reproduce')
    add('')
    add('```')
    add('python -m venv .venv                      # then activate it')
    add('pip install -r ml/requirements.txt')
    add('python ml/build_dataset.py                # flares.csv and dataset_summary.json from the raw DONKI files')
    add(f"python ml/train_sep_risk.py --seed {training['seed']}       # this card, the model file, the parity file and the plots")
    add('python -m unittest discover -s ml/tests')
    add('```')
    add('')
    add('A second run gives the same model file apart from `createdAt`.')
    return '\n'.join(lines) + '\n'


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline='\n' keeps the bytes identical on Windows, macOS and Linux.
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


def run(
    seed: int = 42,
    data_dir: Path = DATA_DIR,
    artifacts_dir: Path = ARTIFACTS_DIR,
    reports_dir: Path = REPORTS_DIR,
    app_models_dir: Path | None = APP_MODELS_DIR,
    created_at: str | None = None,
    resamples: int = BOOTSTRAP_RESAMPLES,
    plots: bool = True,
) -> dict:
    rows = load_rows(data_dir / 'flares.csv')
    summary = json.loads((data_dir / 'dataset_summary.json').read_text(encoding='utf-8'))
    created = created_at or dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    model, parity, plot_data = build_model(rows, summary, seed, created, resamples)

    model_text = json.dumps(model, indent=2, allow_nan=False) + '\n'
    _write(artifacts_dir / f'{NAME}.json', model_text)
    _write(artifacts_dir / f'{NAME}-parity.json', json.dumps(parity, indent=2, allow_nan=False) + '\n')
    plot_names = write_plots(model, plot_data, reports_dir) if plots else {key: f'{NAME}-{key}.png' for key in ('roc', 'reliability', 'coefficients')}
    registry = json.loads(SOURCES_PATH.read_text(encoding='utf-8'))
    sources = {entry['id']: entry for entry in registry['sources']}
    _write(reports_dir / f'{NAME}.md', model_card(model, summary, sources, plot_names))
    if app_models_dir is not None:
        _write(app_models_dir / f'{NAME}.json', model_text)
    return model


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args(argv)
    model = run(seed=args.seed)
    test, splits = model['metrics']['test'], model['data']['splits']
    print('Flares scored: ' + ', '.join(f"{name} {splits[name]['n']} ({splits[name]['positives']} positive)" for name in SPLITS))
    print(f"Chosen C: {model['hyperparameters']['C']:g}; threshold: {model['threshold']:.4f}")
    print(f"Test ROC AUC {test['rocAuc']:.3f} (95% interval {test['rocAucCi95'][0]:.3f} to {test['rocAucCi95'][1]:.3f}); TSS {test['tss']:.3f}")
    for name in ('classOnly', 'gradientBoosting'):
        print(f"  {name}: test ROC AUC {model['comparisons'][name]['test']['rocAuc']:.3f}; {model['comparisons'][name]['finding']}")
    print(f'Written: {ARTIFACTS_DIR / (NAME + ".json")}, its parity file, {REPORTS_DIR / (NAME + ".md")} and {APP_MODELS_DIR / (NAME + ".json")}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
