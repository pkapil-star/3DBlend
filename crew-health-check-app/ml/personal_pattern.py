"""Personal pattern model, the offline twin of the app's (ARCHITECTURE.md section 26.18).

Is today's combination of daily readings unusual for this crew member, given how their own
readings usually move together? The app runs the same steps in
src/engine/models/personalPattern.ts and linalg.ts. ml/eval_personal_pattern.py writes cases
from this file into ml/artifacts/personal-pattern-v1-parity.json, and a test in the app must
reproduce them within 1e-9.

Steps for one crew member on one day:
1. Baselines as in src/engine/baseline.ts (section 10): the median and 1.4826 x the median
   absolute deviation, floored at the indicator's minSpread, over days today-30 to today-3.
2. Today's indicators: the model's indicators with a routine reading today. With fewer than
   minIndicatorsToday nothing is scored.
3. Baseline days: the window days on which all of today's indicators were recorded. With fewer
   than minDays the model is not ready.
4. z-scores of the baseline days and of today, against those baselines.
5. Ledoit-Wolf shrinkage of the second-moment matrix about zero (scikit-learn's LedoitWolf with
   assume_centered=True), and today's squared Mahalanobis distance through a Cholesky
   factorization.
6. The leave-one-out distance of every baseline day. Today is notable when its distance is
   higher than all of them; score = distance / largest leave-one-out distance.
7. Each indicator's contribution z_i x (S^-1 z)_i; the contributions add up to the distance.

minIndicatorsToday and minDays are design values, kept in the model file.
"""

from __future__ import annotations

import math

import numpy as np
from sklearn.covariance import LedoitWolf

MODEL_ID = 'personal-pattern'
VERSION = 'v1'
KIND = 'shrinkage-mahalanobis'

# The model's daily indicators, in the order of section 26.18. exercise_minutes is left out:
# today's value is incomplete until the day ends.
INDICATORS = (
    'systolic_bp',
    'diastolic_bp',
    'heart_rate',
    'body_temp',
    'blood_glucose',
    'sleep_hours',
    'mood',
    'reaction_time',
)
MIN_INDICATORS_TODAY = 4  # design value
MIN_DAYS = 14  # design value

# The daily baseline of src/engine/baseline.ts (BASELINE_WINDOWS.daily) and stats.ts.
MAD_SCALE = 1.4826
WINDOW_DAYS = 28
EXCLUDE_RECENT_DAYS = 3
MIN_READINGS = 7


def baseline_window(today: int) -> tuple[int, int]:
    """First and last day of the baseline window, as computeBaseline in baseline.ts."""
    return today - WINDOW_DAYS - EXCLUDE_RECENT_DAYS + 1, today - EXCLUDE_RECENT_DAYS


def median(values: list[float]) -> float:
    """As median() in src/engine/stats.ts, so the two give the same bits."""
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def baseline(by_day: dict[int, float], min_spread: float, today: int) -> tuple[float, float] | None:
    """(center, spread) of one indicator, or None while fewer than MIN_READINGS days are in the window."""
    first, last = baseline_window(today)
    values = [value for day, value in sorted(by_day.items()) if first <= day <= last]
    if len(values) < MIN_READINGS:
        return None
    center = median(values)
    spread = max(MAD_SCALE * median([abs(value - center) for value in values]), min_spread)
    return center, spread


def shrunk_second_moment(rows: np.ndarray) -> tuple[np.ndarray, float]:
    """Ledoit-Wolf shrinkage of the second-moment matrix about zero, and the shrinkage used."""
    fitted = LedoitWolf(assume_centered=True).fit(rows)
    return fitted.covariance_, float(fitted.shrinkage_)


def cholesky(matrix: np.ndarray) -> list[list[float]] | None:
    """Lower factor L with L L^T = matrix, or None when the matrix is not positive definite.

    Written out as in linalg.ts rather than with numpy, so both refuse exactly the same matrices.
    """
    size = len(matrix)
    lower = [[0.0] * size for _ in range(size)]
    for i in range(size):
        for j in range(i + 1):
            total = float(matrix[i][j])
            for k in range(j):
                total -= lower[i][k] * lower[j][k]
            if i == j:
                if not (math.isfinite(total) and total > 0):
                    return None
                lower[i][i] = math.sqrt(total)
            else:
                lower[i][j] = total / lower[j][j]
    return lower


def solve_cholesky(lower: list[list[float]], vector: list[float]) -> list[float]:
    """x with L L^T x = vector: forward, then back substitution."""
    size = len(lower)
    forward = [0.0] * size
    for i in range(size):
        total = vector[i]
        for k in range(i):
            total -= lower[i][k] * forward[k]
        forward[i] = total / lower[i][i]
    solution = [0.0] * size
    for i in reversed(range(size)):
        total = forward[i]
        for k in range(i + 1, size):
            total -= lower[k][i] * solution[k]
        solution[i] = total / lower[i][i]
    return solution


def squared_distance(matrix: np.ndarray, z: list[float]) -> tuple[float, list[float]] | None:
    """(z^T S^-1 z, the contributions z_i (S^-1 z)_i), or None when S cannot be factorized."""
    lower = cholesky(matrix)
    if lower is None:
        return None
    solved = solve_cholesky(lower, z)
    contributions = [value * weight for value, weight in zip(z, solved)]
    return sum(contributions), contributions


def leave_one_out(rows: np.ndarray) -> list[float] | None:
    """Each baseline day's distance under a fit on the other baseline days."""
    distances = []
    for index in range(len(rows)):
        matrix, _ = shrunk_second_moment(np.delete(rows, index, axis=0))
        result = squared_distance(matrix, [float(value) for value in rows[index]])
        if result is None:
            return None
        distances.append(result[0])
    return distances


def score_today(rows: np.ndarray, z: list[float], loo: list[float] | None = None) -> dict | None:
    """Today's numbers from the baseline days' z-scores (one row per day) and today's z-scores.

    `loo` may be passed when it is already known: it depends on the baseline days only.
    None when a matrix cannot be factorized (only with degenerate, constant readings).
    """
    matrix, shrinkage = shrunk_second_moment(rows)
    today = squared_distance(matrix, z)
    if loo is None:
        loo = leave_one_out(rows)
    if today is None or loo is None:
        return None
    distance, contributions = today
    largest = max(loo)
    notable = largest > 0 and distance > largest
    return {
        'shrinkage': shrinkage,
        'matrix': matrix,
        'squaredDistance': distance,
        'contributions': contributions,
        'looDistances': loo,
        'maxLoo': largest,
        'score': distance / largest if largest > 0 else None,
        'notable': notable,
    }


def top_factors(indicators: list[str], z: list[float], contributions: list[float], count: int = 3) -> list[dict]:
    """The largest positive contributions, largest first; on a tie the model's indicator order wins."""
    order = sorted(range(len(indicators)), key=lambda index: (-contributions[index], index))
    return [
        {'indicator': indicators[index], 'z': z[index], 'contribution': contributions[index]}
        for index in order[:count]
        if contributions[index] > 0
    ]


def days_with_enough_indicators(daily: dict[str, dict[int, float]], first: int, last: int, needed: int) -> int:
    """Before today's check-in: window days on which at least `needed` of the model's indicators were recorded."""
    days = {day for indicator in INDICATORS for day in daily.get(indicator, {}) if first <= day <= last}
    return sum(1 for day in days if sum(1 for indicator in INDICATORS if day in daily.get(indicator, {})) >= needed)


def assess(
    daily: dict[str, dict[int, float]],
    today: int,
    min_spreads: dict[str, float],
    min_indicators_today: int = MIN_INDICATORS_TODAY,
    min_days: int = MIN_DAYS,
) -> dict:
    """Readiness and, when the model can score today, today's numbers, for one crew member.

    `daily` holds one routine value per indicator and day (urgent re-checks never enter it).
    """
    first, last = baseline_window(today)
    present = [indicator for indicator in INDICATORS if today in daily.get(indicator, {})]
    readiness = {
        'daysNeeded': min_days,
        'indicatorsToday': len(present),
        'indicatorsNeeded': min_indicators_today,
    }
    if len(present) < min_indicators_today:
        available = days_with_enough_indicators(daily, first, last, min_indicators_today)
        return {'readiness': {'ready': available >= min_days, 'daysAvailable': available, **readiness}, 'indicators': present}

    complete = [day for day in range(first, last + 1) if all(day in daily[indicator] for indicator in present)]
    readiness = {'ready': len(complete) >= min_days, 'daysAvailable': len(complete), **readiness}
    if not readiness['ready']:
        return {'readiness': readiness, 'indicators': present}

    # Every indicator has a value on at least min_days >= MIN_READINGS window days, so each baseline is ready.
    centers = [baseline(daily[indicator], min_spreads[indicator], today) for indicator in present]
    rows = np.array(
        [[(daily[indicator][day] - center) / spread for indicator, (center, spread) in zip(present, centers)] for day in complete],
        dtype=float,
    )
    z = [(daily[indicator][today] - center) / spread for indicator, (center, spread) in zip(present, centers)]
    return {'readiness': readiness, 'indicators': present, 'rows': rows, 'z': z, 'result': score_today(rows, z)}
