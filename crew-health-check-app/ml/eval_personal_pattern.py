"""Simulated evaluation and export of the personal pattern model (ARCHITECTURE.md section 26.18).

Usage:
    python ml/eval_personal_pattern.py --seed 42

Every number this script reports comes from fictional crew histories made with the project's own
simulator (tools/simulator/model.py, section 24.2). The numbers show how the method behaves on
that simulator. They do not show that it notices real illness, and every place that shows them
says so.

Reads   src/data/indicators.json   input ranges, steps and spread floors
        src/data/rules.json        the app's rules, for the rules-only comparison
        src/data/sources.json      titles and links for the model card
Writes  src/data/models/personal-pattern-v1.json      the model file the app loads
        ml/artifacts/personal-pattern-v1-parity.json  cases the TypeScript twin must reproduce
        ml/reports/personal-pattern-v1.md             the model card

How the evaluation works:
- HISTORIES_PER_PROFILE fictional histories for each of the simulator's three crew profiles.
  Each history is evaluated on one day, drawn from mission days FIRST_DAY to LAST_DAY, so the
  baseline window is full and the histories are independent of each other.
- On that day the clean history gives the false-notice rate. Shifted copies of the same history
  add a shift to the last SHIFT_DAYS days (the days the baseline leaves out), on top of the same
  noise, for each pattern and size. A size is a multiple of the simulator's day-to-day noise of
  each indicator.
- Three ways to notice a day: this model; the rules alone (a Python copy of the app's rules on
  these indicators); and scikit-learn's IsolationForest fitted on the same baseline days, which
  flags today when it scores today lower than every baseline day.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import platform
import random
import sys
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import IsolationForest

import personal_pattern as pattern

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'tools' / 'simulator'))
import model as simulator  # noqa: E402  (the app's simulator, standard library only)

NAME = f'{pattern.MODEL_ID}-{pattern.VERSION}'
DATA_DIR = REPO_ROOT / 'src' / 'data'
INDICATORS_PATH = DATA_DIR / 'indicators.json'
RULES_PATH = DATA_DIR / 'rules.json'
SOURCES_PATH = DATA_DIR / 'sources.json'
APP_MODELS_DIR = DATA_DIR / 'models'
ARTIFACTS_DIR = REPO_ROOT / 'ml' / 'artifacts'
REPORTS_DIR = REPO_ROOT / 'ml' / 'reports'

HISTORIES_PER_PROFILE = 300
FIRST_DAY = 31  # the first day whose 28-day baseline window starts on mission day 1
LAST_DAY = 120
SHIFT_DAYS = 3  # the shift covers the days the baseline leaves out (section 10)
SIZES = (1.0, 1.5, 2.0, 2.5, 3.0)
PATTERNS = (
    {
        'id': 'combined',
        'label': 'Sleep and mood lower, resting heart rate and reaction time higher',
        'directions': {'sleep_hours': -1, 'mood': -1, 'heart_rate': 1, 'reaction_time': 1},
    },
    {
        'id': 'temperature-heart-rate',
        'label': 'Body temperature and resting heart rate higher',
        'directions': {'body_temp': 1, 'heart_rate': 1},
    },
    {
        'id': 'sleep-only',
        'label': 'Sleep lower, nothing else',
        'directions': {'sleep_hours': -1},
    },
)
# scikit-learn's defaults, written out so the model card can name them.
ISOLATION_FOREST = {'n_estimators': 100, 'max_samples': 'auto', 'contamination': 'auto'}
WILSON_Z = 1.959963984540054  # two-sided 95%
SIMULATOR_SOURCE_IDS = ['temp-stahn-2017', 'bp-norsk-2015', 'sleep-barger-2014']
HEADLINE = 'Unusual pattern for you'
NOTABLE_TEXT = 'More unusual than any day in your recent baseline'
CAVEAT = 'Learned from your own readings. Tested only on simulated data. A second opinion only.'
REFERENCES = (
    ('scikit-learn LedoitWolf', 'https://scikit-learn.org/stable/modules/generated/sklearn.covariance.LedoitWolf.html'),
    ('scikit-learn IsolationForest', 'https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html'),
)


# ---------------------------------------------------------------------------
# Data files


def load_indicators(path: Path = INDICATORS_PATH) -> dict[str, dict]:
    return {entry['id']: entry for entry in json.loads(path.read_text(encoding='utf-8'))['indicators']}


def load_rules(path: Path = RULES_PATH) -> list[dict]:
    return json.loads(path.read_text(encoding='utf-8'))['rules']


# ---------------------------------------------------------------------------
# The rules alone: a Python copy of src/engine/conditions.ts for conditions on readings.

TOLERANCE = 1e-9  # as comparison.ts
INDICATOR_CONDITIONS = ('latest', 'streak', 'average')


def compare(value: float, op: str, target: float) -> bool:
    if op == 'gt':
        return value > target + TOLERANCE
    if op == 'gte':
        return value >= target - TOLERANCE
    if op == 'lt':
        return value < target - TOLERANCE
    return value <= target + TOLERANCE


def target_of(test: dict, base: tuple[float, float] | None) -> float | None:
    """The value a reading is compared with (targetFor in comparison.ts); None when it cannot run."""
    if test['kind'] == 'absolute':
        return test['value']
    if base is None or test['kind'] == 'modelThreshold':
        return None
    center, spread = base
    if test['kind'] == 'baselineOffset':
        return center + test['offset']
    if test['kind'] == 'baselinePercent':
        return center * (1 + test['percent'] / 100)
    return center + test['z'] * spread


def uses_readings_only(condition: dict, simulated: set[str]) -> bool:
    """True when every part of the condition looks at simulated readings (no feed, symptom or model)."""
    if condition['type'] in ('any', 'all'):
        return all(uses_readings_only(part, simulated) for part in condition['of'])
    return condition['type'] in INDICATOR_CONDITIONS and condition['indicator'] in simulated


def condition_met(condition: dict, daily: dict[str, dict[int, float]], bases: dict, today: int) -> bool:
    kind = condition['type']
    if kind == 'any':
        return any(condition_met(part, daily, bases, today) for part in condition['of'])
    if kind == 'all':
        return all(condition_met(part, daily, bases, today) for part in condition['of'])
    values = daily.get(condition['indicator'], {})
    target = target_of(condition['test'], bases.get(condition['indicator']))
    if target is None or not values:
        return False
    if kind == 'latest':
        # Every simulated reading is routine and logged at 08:00, so the newest is the latest day's.
        day = max(day for day in values if day <= today)
        if 'maxAgeDays' in condition and today - day > condition['maxAgeDays']:
            return False
        return compare(values[day], condition['test']['op'], target)
    recent = [value for day, value in sorted(values.items()) if today - condition['windowDays'] < day <= today]
    if kind == 'streak':
        return sum(compare(value, condition['test']['op'], target) for value in recent) >= condition['minCount']
    if len(recent) < condition['minReadings']:
        return False
    return compare(sum(recent) / len(recent), condition['test']['op'], target)


def rules_on_readings(rules: list[dict], simulated: set[str]) -> tuple[list[dict], list[str]]:
    """(rules this simulation can trigger, ids of the rest)."""
    usable = [rule for rule in rules if uses_readings_only(rule['when'], simulated)]
    return usable, [rule['id'] for rule in rules if rule not in usable]


def rule_alerts(rules: list[dict], daily: dict[str, dict[int, float]], bases: dict, today: int) -> list[str]:
    return [rule['id'] for rule in rules if condition_met(rule['when'], daily, bases, today)]


# ---------------------------------------------------------------------------
# Simulated histories


def shift_amounts(directions: dict[str, int], size: float) -> dict[str, float]:
    return {indicator: direction * size * simulator.NOISE_SD[indicator] for indicator, direction in directions.items()}


def variants() -> list[tuple[str, dict[str, float]]]:
    """('clean', no shift) first, then every pattern at every size."""
    shifted = [
        (f"{entry['id']}@{size:g}", shift_amounts(entry['directions'], size)) for entry in PATTERNS for size in SIZES
    ]
    return [('clean', {})] + shifted


def simulate_history(crew_id: str, rng: random.Random, today: int, indicators: dict[str, dict], kinds: list) -> dict:
    """Daily values of the model's indicators, days 1 to today, for every variant.

    Days before the shift are shared. On each shift day every variant starts from the same
    random state, so the variants differ only by the shift (paired comparison).
    """
    shared = {indicator: {} for indicator in pattern.INDICATORS}
    shifted = {name: {indicator: {} for indicator in pattern.INDICATORS} for name, _ in kinds}
    for day in range(1, today + 1):
        for indicator in pattern.INDICATORS:
            definition = indicators[indicator]
            if day <= today - SHIFT_DAYS:
                shared[indicator][day] = simulator.daily_value(rng, crew_id, indicator, day, definition)
                continue
            state = rng.getstate()
            for name, amounts in kinds:
                rng.setstate(state)
                shifted[name][indicator][day] = simulator.daily_value(
                    rng, crew_id, indicator, day, definition, amounts.get(indicator, 0.0)
                )
    return {
        name: {indicator: {**shared[indicator], **shifted[name][indicator]} for indicator in pattern.INDICATORS}
        for name, _ in kinds
    }


def history_rng(seed: int, crew_id: str, index: int) -> random.Random:
    # A named stream per history, so adding histories never changes the earlier ones.
    return random.Random(f'{seed}:{pattern.MODEL_ID}:{crew_id}:{index}')


# ---------------------------------------------------------------------------
# One history, three ways to notice


def evaluate_history(daily_by_variant: dict, today: int, indicators: dict[str, dict], rules: list[dict], seed: int) -> dict:
    min_spreads = {indicator: indicators[indicator]['minSpread'] for indicator in pattern.INDICATORS}
    clean = pattern.assess(daily_by_variant['clean'], today, min_spreads)
    if clean.get('result') is None:
        raise RuntimeError(f'day {today}: the model could not score a full simulated baseline')
    rows, loo = clean['rows'], clean['result']['looDistances']
    present = clean['indicators']
    bases = {indicator: pattern.baseline(daily_by_variant['clean'][indicator], min_spreads[indicator], today) for indicator in present}

    names = list(daily_by_variant)
    todays = [
        [(daily_by_variant[name][indicator][today] - bases[indicator][0]) / bases[indicator][1] for indicator in present]
        for name in names
    ]
    forest = IsolationForest(random_state=seed, **ISOLATION_FOREST).fit(rows)
    lowest_baseline = forest.score_samples(rows).min()
    forest_today = forest.score_samples(np.array(todays))

    outcome = {}
    for index, name in enumerate(names):
        result = pattern.score_today(rows, todays[index], loo)
        outcome[name] = {
            'model': bool(result is not None and result['notable']),
            'rulesOnly': bool(rule_alerts(rules, daily_by_variant[name], bases, today)),
            'isolationForest': bool(forest_today[index] < lowest_baseline),
            'result': result,
            'z': todays[index],
        }
    return {'today': today, 'indicators': present, 'rows': rows, 'variants': outcome}


# ---------------------------------------------------------------------------
# Rates


def wilson(count: int, total: int) -> list[float]:
    """Wilson score 95% interval for a proportion."""
    share = count / total
    z2 = WILSON_Z * WILSON_Z
    middle = (share + z2 / (2 * total)) / (1 + z2 / total)
    half = WILSON_Z * math.sqrt(share * (1 - share) / total + z2 / (4 * total * total)) / (1 + z2 / total)
    # At 0 or all, one end is exactly 0 or 1; rounding would leave a crumb such as 4e-19.
    low = 0.0 if count == 0 else max(0.0, middle - half)
    high = 1.0 if count == total else min(1.0, middle + half)
    return [low, high]


def rate(count: int, total: int) -> dict:
    return {'flagged': count, 'of': total, 'rate': count / total, 'ci95': wilson(count, total)}


METHODS = ('model', 'rulesOnly', 'isolationForest')


def summarize(histories: list[dict]) -> tuple[dict, list[dict]]:
    total = len(histories)

    def count(name: str, method: str) -> int:
        return sum(1 for history in histories if history['variants'][name][method])

    false_notice = {method: rate(count('clean', method), total) for method in METHODS}
    detection = [
        {
            'pattern': entry['id'],
            'size': size,
            **{method: rate(count(f"{entry['id']}@{size:g}", method), total) for method in METHODS},
        }
        for entry in PATTERNS
        for size in SIZES
    ]
    return false_notice, detection


# ---------------------------------------------------------------------------
# Parity cases for src/engine/models/personalPattern.ts


def _matrix_case(case_id: str, rows: np.ndarray, z: list[float]) -> dict:
    result = pattern.score_today(rows, z)
    if result is None:
        raise RuntimeError(f'parity case {case_id} cannot be scored')
    if result['maxLoo'] > 0 and abs(result['squaredDistance'] - result['maxLoo']) < 1e-6:
        raise RuntimeError(f'parity case {case_id} sits on the threshold; pick another')
    return {
        'id': case_id,
        'rows': rows.tolist(),
        'z': list(z),
        'shrinkage': result['shrinkage'],
        'matrix': result['matrix'].tolist(),
        'squaredDistance': result['squaredDistance'],
        'contributions': result['contributions'],
        'looDistances': result['looDistances'],
        'maxLoo': result['maxLoo'],
        'score': result['score'],
        'notable': result['notable'],
    }


def _history_case(case_id: str, daily: dict[str, dict[int, float]], today: int, indicators: dict[str, dict]) -> dict:
    min_spreads = {indicator: indicators[indicator]['minSpread'] for indicator in pattern.INDICATORS}
    assessed = pattern.assess(daily, today, min_spreads)
    result = assessed.get('result')
    expected = {'readiness': assessed['readiness'], 'indicators': assessed['indicators'], 'z': assessed.get('z')}
    if result is None:
        expected.update({'squaredDistance': None, 'maxLoo': None, 'score': None, 'notable': False, 'factors': []})
    else:
        expected.update({
            'squaredDistance': result['squaredDistance'],
            'maxLoo': result['maxLoo'],
            'score': result['score'],
            'notable': result['notable'],
            'factors': pattern.top_factors(assessed['indicators'], assessed['z'], result['contributions']),
        })
    return {
        'id': case_id,
        'today': today,
        'dailyValues': {indicator: [[day, value] for day, value in sorted(daily[indicator].items())] for indicator in pattern.INDICATORS},
        'expected': expected,
    }


def _drop_today(daily: dict, today: int, keep: set[str]) -> dict:
    return {
        indicator: {day: value for day, value in values.items() if day != today or indicator in keep}
        for indicator, values in daily.items()
    }


def parity_cases(samples: dict, indicators: dict[str, dict], seed: int) -> dict:
    """Fixed cases from the first histories of each profile, plus small and early ones."""
    c1, c2, c3 = samples['c1'], samples['c2'], samples['c3']
    matrix_cases = [
        _matrix_case('c1-clean', c1['evaluated']['rows'], c1['evaluated']['variants']['clean']['z']),
        _matrix_case('c1-combined-2.5', c1['evaluated']['rows'], c1['evaluated']['variants']['combined@2.5']['z']),
        _matrix_case(
            'c2-temperature-heart-rate-3',
            c2['evaluated']['rows'],
            c2['evaluated']['variants']['temperature-heart-rate@3']['z'],
        ),
        # Four indicators and exactly minDays baseline days: the smallest fit the app makes.
        _matrix_case('c3-four-indicators-14-days', c3['evaluated']['rows'][: pattern.MIN_DAYS, :4], c3['evaluated']['variants']['clean']['z'][:4]),
        _matrix_case('c3-sleep-only-3', c3['evaluated']['rows'], c3['evaluated']['variants']['sleep-only@3']['z']),
    ]
    # A negative contribution: two readings that usually move together, and today only one of them moves.
    # The simulator's noise is independent, so this case is built from numbers, not from a history.
    generator = np.random.default_rng(seed)
    pair = generator.normal(size=(20, 4))
    pair[:, 1] = 0.95 * pair[:, 0] + 0.3 * pair[:, 1]
    matrix_cases.append(_matrix_case('synthetic-one-of-a-pair-moves', pair, [2.0, 0.4, 0.0, 0.0]))
    if not any(value < 0 for case in matrix_cases for value in case['contributions']):
        raise RuntimeError('no parity case has a negative contribution')

    early_rng = history_rng(seed, 'c1', -1)
    early = simulate_history('c1', early_rng, 12, indicators, [('clean', {})])['clean']
    history_cases = [
        _history_case('c1-combined-2.5-all-eight', c1['daily']['combined@2.5'], c1['evaluated']['today'], indicators),
        _history_case(
            'c2-clean-six-today',
            _drop_today(c2['daily']['clean'], c2['evaluated']['today'], set(pattern.INDICATORS) - {'mood', 'reaction_time'}),
            c2['evaluated']['today'],
            indicators,
        ),
        _history_case(
            'c3-three-today',
            _drop_today(c3['daily']['clean'], c3['evaluated']['today'], {'sleep_hours', 'mood', 'heart_rate'}),
            c3['evaluated']['today'],
            indicators,
        ),
        _history_case('c1-early-day-12', early, 12, indicators),
    ]
    return {
        'schemaVersion': 1,
        'modelId': pattern.MODEL_ID,
        'version': pattern.VERSION,
        'tolerance': 1e-9,
        'note': 'Written by ml/eval_personal_pattern.py from simulated histories. Never edit by hand.',
        'matrixCases': matrix_cases,
        'historyCases': history_cases,
    }


# ---------------------------------------------------------------------------
# The model file


def limitations(rules_skipped: list[str], baseline_days: int) -> list[str]:
    return [
        'Evaluated only on simulated data from this project\'s own simulator. The results show that the method works as designed on that simulator; they do not show that it notices real illness.',
        'The simulator draws each reading\'s day-to-day noise independently, so the way the readings move together is simpler than in real physiology.',
        'A person whose readings are often unusual raises their own threshold, because the threshold is their own most unusual baseline day.',
        'A slow drift over weeks becomes part of the baseline, by design (the baseline engine, section 10).',
        f'On stable readings a notice still appears by chance now and then. If today were just like the {baseline_days} baseline days, it would be the most unusual of {baseline_days + 1} days about one time in {baseline_days + 1}; the false-notice rate measures it on the simulator.',
        'An insight can repeat what an alert already says.',
        f'minIndicatorsToday ({pattern.MIN_INDICATORS_TODAY}) and minDays ({pattern.MIN_DAYS}) are design values, not fitted.',
        f'The shifts are added for {SHIFT_DAYS} days on top of the simulator\'s ordinary noise; a real change may build up differently.',
        'The rules-only comparison runs a Python copy of the app\'s rules on readings. Rules on habitat feeds, space weather or symptoms are not part of this simulation: ' + ', '.join(rules_skipped) + '.',
        'IsolationForest uses scikit-learn\'s default settings and is scored on the same baseline days it was fitted on (no leave-one-out, to keep the run short). It is a benchmark, not tuned.',
    ]


def build(seed: int, histories_per_profile: int, created_at: str) -> tuple[dict, dict]:
    indicators = load_indicators()
    usable_rules, skipped_rules = rules_on_readings(load_rules(), set(pattern.INDICATORS))
    kinds = variants()
    histories, samples = [], {}
    for crew in simulator.CREW:
        for index in range(histories_per_profile):
            rng = history_rng(seed, crew['id'], index)
            today = rng.randint(FIRST_DAY, LAST_DAY)
            daily = simulate_history(crew['id'], rng, today, indicators, kinds)
            evaluated = evaluate_history(daily, today, indicators, usable_rules, seed)
            histories.append(evaluated)
            if index == 0:
                samples[crew['id']] = {'daily': daily, 'evaluated': evaluated}

    false_notice, detection = summarize(histories)
    baseline_days = pattern.WINDOW_DAYS
    model = {
        'schemaVersion': 1,
        'modelId': pattern.MODEL_ID,
        'version': pattern.VERSION,
        'kind': pattern.KIND,
        'createdAt': created_at,
        'label': 'A second opinion: today\'s combination of daily readings compared with how this crew member\'s own readings usually move together.',
        'indicators': list(pattern.INDICATORS),
        'minIndicatorsToday': pattern.MIN_INDICATORS_TODAY,
        'minDays': pattern.MIN_DAYS,
        'designValues': ['minIndicatorsToday', 'minDays'],
        'thresholdRule': 'Notable when today\'s squared distance is higher than the leave-one-out distance of every baseline day: the score (today\'s distance divided by the largest leave-one-out distance) is above 1.',
        'headline': HEADLINE,
        'notableText': NOTABLE_TEXT,
        'caveat': CAVEAT,
        'evaluation': {
            'simulated': True,
            'simulator': 'tools/simulator/model.py (ARCHITECTURE.md section 24.2)',
            'seed': seed,
            'crewProfiles': [crew['id'] for crew in simulator.CREW],
            'historiesPerProfile': histories_per_profile,
            'histories': len(histories),
            'evaluationDays': [FIRST_DAY, LAST_DAY],
            'baselineDays': baseline_days,
            'chanceIfExchangeable': 1 / (baseline_days + 1),
            'shiftDays': SHIFT_DAYS,
            'sizeUnit': 'times the simulator\'s day-to-day noise of each shifted indicator',
            'sizes': list(SIZES),
            'patterns': [dict(entry) for entry in PATTERNS],
            'methods': {
                'model': 'This model: notable when today is more unusual than every baseline day.',
                'rulesOnly': 'Any of the app\'s rules on these readings is met today (Python copy of the rules engine).',
                'isolationForest': 'scikit-learn IsolationForest fitted on the same baseline days; flags today when its score is lower than every baseline day\'s.',
            },
            'rulesEvaluated': [rule['id'] for rule in usable_rules],
            'rulesNotEvaluated': skipped_rules,
            'isolationForest': {'nEstimators': ISOLATION_FOREST['n_estimators'], 'maxSamples': ISOLATION_FOREST['max_samples'], 'contamination': ISOLATION_FOREST['contamination'], 'randomState': seed},
            'falseNotice': false_notice,
            'detection': detection,
        },
        'limitations': limitations(skipped_rules, baseline_days),
        'sourceIds': SIMULATOR_SOURCE_IDS,
        'software': {
            'seed': seed,
            'python': platform.python_version(),
            'numpy': np.__version__,
            'scikitLearn': sklearn.__version__,
        },
    }
    return model, parity_cases(samples, indicators, seed)


# ---------------------------------------------------------------------------
# The model card


def _pct(entry: dict) -> str:
    return f"{100 * entry['rate']:.1f}% ({entry['flagged']} of {entry['of']})"


def _interval(entry: dict) -> str:
    low, high = entry['ci95']
    return f'{100 * low:.1f} to {100 * high:.1f}%'


def _cell(entry: dict) -> str:
    return f"{_pct(entry)}, 95% interval {_interval(entry)}"


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    lines = ['| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)]
    lines.extend('| ' + ' | '.join(row) + ' |' for row in rows)
    return lines


def _detection_at(model: dict, pattern_id: str, size: float) -> dict:
    return next(entry for entry in model['evaluation']['detection'] if entry['pattern'] == pattern_id and entry['size'] == size)


def findings(model: dict) -> list[str]:
    """Plain sentences, every number read from the model dictionary."""
    evaluation = model['evaluation']
    false_notice = evaluation['falseNotice']
    lines = [
        f"On clean simulated days the model gave a notice on {_pct(false_notice['model'])} of days; "
        f"if today were just like the baseline days, that would happen about {100 * evaluation['chanceIfExchangeable']:.1f}% of the time. "
        f"The rules alone gave {_pct(false_notice['rulesOnly'])} and IsolationForest {_pct(false_notice['isolationForest'])}.",
    ]
    for entry in evaluation['patterns']:
        middle = _detection_at(model, entry['id'], 2.0)
        top = _detection_at(model, entry['id'], max(evaluation['sizes']))
        lines.append(
            f"{entry['label']}: at size 2 the model noticed {_pct(middle['model'])} of shifted days, the rules alone "
            f"{_pct(middle['rulesOnly'])} and IsolationForest {_pct(middle['isolationForest'])}; at size {max(evaluation['sizes']):g}, "
            f"{_pct(top['model'])}, {_pct(top['rulesOnly'])} and {_pct(top['isolationForest'])}."
        )
    rule_counts = [false_notice['rulesOnly']['flagged']] + [entry['rulesOnly']['flagged'] for entry in evaluation['detection']]
    if not any(rule_counts):
        lines.append('No rule fired on any simulated day, clean or shifted: every shift is smaller or shorter than the rules\' triggers. That is the gap a second opinion is meant to cover.')
    return lines


def model_card(model: dict, sources: dict[str, dict]) -> str:
    evaluation = model['evaluation']
    lines: list[str] = []
    add = lines.append
    add(f"# Model card: personal pattern ({model['modelId']} {model['version']})")
    add('')
    add(f"Generated by `ml/eval_personal_pattern.py` on {model['createdAt']}. Every number below is written by the script. Do not edit this file by hand.")
    add('')
    add('**Evaluated only on simulated data.** The results come from fictional crew histories made with this project\'s own simulator. They show that the method works as designed on that simulator. They do not show that it notices real illness.')
    add('')
    add('## What it does')
    add('')
    add(model['label'])
    add(f"It looks at all of a crew member's daily readings together and asks whether today's combination is unusual for this person. When it is, the app shows an insight headed \"{model['headline']}\" with the note \"{model['notableText']}\" and the caveat \"{model['caveat']}\"")
    add('')
    add('An insight is a second opinion. It never sets a region status, never creates or hides an alert, never changes a triage route and never sends a message by itself. The crew may choose to send it to the ground. The crew card shows no number and no percentage; this card explains the score.')
    add('')
    add('## Inputs and settings')
    add('')
    add('Indicators: ' + ', '.join(f'`{indicator}`' for indicator in model['indicators']) + '. Exercise is left out because today\'s value is incomplete until the day ends.')
    add('')
    add(f"- Each reading becomes a z-score against the crew member's own baseline (median and 1.4826 x median absolute deviation, floored, over days today-30 to today-3; section 10). Urgent re-checks, such as a blood sugar re-check that is not fasting, never enter it.")
    add(f"- At least {model['minIndicatorsToday']} of these readings must be in today. Design value.")
    add(f"- The baseline days are the window days with all of today's readings recorded. With fewer than {model['minDays']} the model says \"Learning your pattern\". Design value.")
    add('')
    add('## How it works')
    add('')
    add('1. Ledoit-Wolf shrinkage of the second-moment matrix of the baseline days\' z-scores about zero (scikit-learn `LedoitWolf`, `assume_centered=True`). Shrinkage keeps the estimate stable with few days.')
    add('2. Today\'s squared Mahalanobis distance d² = zᵀ S⁻¹ z, solved with a Cholesky factorization.')
    add('3. The leave-one-out distance of every baseline day: fit on the other baseline days, then score that day.')
    add(f"4. {model['thresholdRule']} No fixed cut-off is used; the person's own history is the threshold.")
    add('5. Each indicator\'s contribution z_i × (S⁻¹ z)_i. The contributions add up to d²; one can be negative when readings that usually move together move apart. The app names the three largest positive ones, with the direction of z_i ("higher than your normal" or "lower than your normal").')
    add('')
    add('The app runs the same steps in `src/engine/models/personalPattern.ts`. A test matches it to this script\'s parity file within 1e-9.')
    add('')
    add('## Simulated evaluation')
    add('')
    add(f"- {evaluation['histories']} fictional histories: {evaluation['historiesPerProfile']} for each of the simulator's crew profiles ({', '.join(evaluation['crewProfiles'])}), seed {evaluation['seed']}.")
    add(f"- Each history is evaluated on one day drawn from mission days {evaluation['evaluationDays'][0]} to {evaluation['evaluationDays'][1]}, so the {evaluation['baselineDays']}-day baseline window is full and the histories are independent.")
    add(f"- The clean day gives the false-notice rate. Shifted copies of the same history add a shift to the last {evaluation['shiftDays']} days, on top of the same noise, so each shifted day is compared with its own clean twin.")
    add(f"- Sizes: {', '.join(f'{size:g}' for size in evaluation['sizes'])}, {evaluation['sizeUnit']}.")
    add('- Patterns:')
    for entry in evaluation['patterns']:
        directions = ', '.join(f"`{indicator}` {'up' if sign > 0 else 'down'}" for indicator, sign in entry['directions'].items())
        add(f"  - `{entry['id']}`: {entry['label']} ({directions}).")
    add('- Three ways to notice a day:')
    for key, text in evaluation['methods'].items():
        add(f'  - `{key}`: {text}')
    add(f"- Rules the simulation can trigger: {', '.join(evaluation['rulesEvaluated'])}. Not part of the simulation: {', '.join(evaluation['rulesNotEvaluated'])}.")
    forest = evaluation['isolationForest']
    add(f"- IsolationForest settings: {forest['nEstimators']} trees, max_samples {forest['maxSamples']}, contamination {forest['contamination']}, random_state {forest['randomState']}.")
    add('')
    add('### False notices on clean days')
    add('')
    lines.extend(_table(['Method', 'Days with a notice'], [[method, _cell(evaluation['falseNotice'][method])] for method in METHODS]))
    add('')
    add('### Shifted days noticed')
    for entry in evaluation['patterns']:
        add('')
        add(f"`{entry['id']}`: {entry['label']}.")
        add('')
        rows = [
            [f'{size:g}'] + [_cell(_detection_at(model, entry['id'], size)[method]) for method in METHODS]
            for size in evaluation['sizes']
        ]
        lines.extend(_table(['Size', 'model', 'rulesOnly', 'isolationForest'], rows))
    add('')
    add('### Findings, in words')
    add('')
    for line in findings(model):
        add(f'- {line}')
    add('')
    add('## Limitations')
    add('')
    for line in model['limitations']:
        add(f'- {line}')
    add('')
    add('## Sources and references')
    add('')
    add('The simulator\'s in-flight drift shapes are seeded from these sources; its personal means and noise levels are design values:')
    add('')
    for source_id in model['sourceIds']:
        source = sources[source_id]
        add(f"- `{source_id}`: {source['title']}. {source['url']}")
    add('')
    add('Methods:')
    add('')
    for name, url in REFERENCES:
        add(f'- {name}: {url}')
    add('')
    add('## Reproduce')
    add('')
    add('```')
    add(f"python ml/eval_personal_pattern.py --seed {evaluation['seed']}")
    add('```')
    add('')
    software = model['software']
    add(f"Run with Python {software['python']}, numpy {software['numpy']} and scikit-learn {software['scikitLearn']}. A second run gives the same model file apart from `createdAt`.")
    return '\n'.join(lines) + '\n'


# ---------------------------------------------------------------------------


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline='\n' keeps the bytes identical on Windows, macOS and Linux.
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


def run(
    seed: int = 42,
    histories_per_profile: int = HISTORIES_PER_PROFILE,
    app_models_dir: Path = APP_MODELS_DIR,
    artifacts_dir: Path = ARTIFACTS_DIR,
    reports_dir: Path = REPORTS_DIR,
    created_at: str | None = None,
) -> dict:
    created = created_at or dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    model, parity = build(seed, histories_per_profile, created)
    registry = json.loads(SOURCES_PATH.read_text(encoding='utf-8'))
    sources = {entry['id']: entry for entry in registry['sources']}
    _write(app_models_dir / f'{NAME}.json', json.dumps(model, indent=2, allow_nan=False, ensure_ascii=False) + '\n')
    _write(artifacts_dir / f'{NAME}-parity.json', json.dumps(parity, indent=2, allow_nan=False) + '\n')
    _write(reports_dir / f'{NAME}.md', model_card(model, sources))
    return model


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args(argv)
    model = run(seed=args.seed)
    for line in findings(model):
        print(line)
    print(f'Written: {APP_MODELS_DIR / (NAME + ".json")}, {ARTIFACTS_DIR / (NAME + "-parity.json")} and {REPORTS_DIR / (NAME + ".md")}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
