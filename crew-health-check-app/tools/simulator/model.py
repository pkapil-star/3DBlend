"""Fictional physiology model for the seed scenarios (ARCHITECTURE.md section 24.2).

Every value this module produces is simulated. The personal means, noise
levels and drift shapes are design values chosen to give believable, stable
histories; they are not reference ranges and not statistics about anyone.

A daily value is: personal mean + adaptation drift(day) + noise + scenario effect,
clipped to the indicator's input range and rounded to its step. Ranges and
steps are read from src/data/indicators.json, so the app and the simulator
share one source.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
INDICATORS_PATH = REPO_ROOT / 'src' / 'data' / 'indicators.json'

MS_PER_DAY = 86_400_000
MORNING_MS = 8 * 3_600_000  # routine morning readings are logged at 08:00
EVENING_MS = 20 * 3_600_000  # exercise is logged at 20:00

# Fictional crew: generic names only, never real astronauts.
CREW = (
    {'id': 'c1', 'name': 'Crew member A', 'role': 'Commander'},
    {'id': 'c2', 'name': 'Crew member B', 'role': 'Flight engineer'},
    {'id': 'c3', 'name': 'Crew member C', 'role': 'Mission specialist'},
)

# Order in which indicators are generated; fixed so output is reproducible.
INDICATOR_ORDER = (
    'sleep_hours',
    'mood',
    'systolic_bp',
    'diastolic_bp',
    'heart_rate',
    'body_temp',
    'blood_glucose',
    'exercise_minutes',
    'reaction_time',
    'near_vision',
)

# Fictional personal values before flight adaptation.
PERSONAL_MEANS = {
    'c1': {
        'systolic_bp': 122, 'diastolic_bp': 78, 'heart_rate': 62, 'body_temp': 36.6,
        'blood_glucose': 90, 'sleep_hours': 6.5, 'mood': 4.0, 'reaction_time': 285,
        'exercise_minutes': 125, 'near_vision': 8.0,
    },
    'c2': {
        'systolic_bp': 116, 'diastolic_bp': 74, 'heart_rate': 66, 'body_temp': 36.5,
        'blood_glucose': 86, 'sleep_hours': 6.25, 'mood': 3.9, 'reaction_time': 300,
        'exercise_minutes': 115, 'near_vision': 7.6,
    },
    'c3': {
        'systolic_bp': 126, 'diastolic_bp': 80, 'heart_rate': 58, 'body_temp': 36.7,
        'blood_glucose': 93, 'sleep_hours': 7.0, 'mood': 4.2, 'reaction_time': 270,
        'exercise_minutes': 135, 'near_vision': 8.2,
    },
}

# Day-to-day noise (standard deviation), in each indicator's unit.
NOISE_SD = {
    'systolic_bp': 3.5, 'diastolic_bp': 2.5, 'heart_rate': 2.5, 'body_temp': 0.12,
    'blood_glucose': 4.0, 'sleep_hours': 0.35, 'mood': 0.45, 'reaction_time': 12.0,
    'exercise_minutes': 12.0, 'near_vision': 0.4,
}

# Placeholder daily radiation dose per environment, in mSv (section 24.2).
# Illustrative only.
DAILY_DOSE_MSV = {
    'leo_station': 0.5,
    'lunar_surface': 0.5,
    'mars_transit': 1.5,
    'mars_surface': 0.5,
    'mars_rover': 0.5,
}

CABIN_CO2_MEAN = 2.1  # mmHg, worst 1-hour average of an ordinary day
CABIN_CO2_SD = 0.15
CABIN_CO2_RANGE = (1.2, 2.8)  # ordinary days stay under the 3 mmHg limit


def load_indicators(path: Path = INDICATORS_PATH) -> dict:
    """Indicator definitions from the app's data file, keyed by id."""
    data = json.loads(path.read_text(encoding='utf-8'))
    return {entry['id']: entry for entry in data['indicators']}


def decimals_of(step: float) -> int:
    text = repr(float(step)).rstrip('0')
    return len(text.split('.')[1]) if '.' in text else 0


def round_to_step(value: float, step: float) -> float:
    """Rounds to the indicator's step without floating-point leftovers."""
    return round(round(value / step) * step, decimals_of(step))


def clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def adaptation_drift(indicator: str, day: int) -> float:
    """Slow in-flight change, seeded from the sources and otherwise illustrative.

    Temperature rises toward about +1 degC over 75 days (temp-stahn-2017).
    Blood pressure settles about 8 (upper) and 9 (lower) mmHg below the ground
    value (bp-norsk-2015); the 30-day ramp is a design value.
    """
    if indicator == 'body_temp':
        return 1.0 * min(day / 75, 1.0)
    if indicator == 'systolic_bp':
        return -8.0 * min(day / 30, 1.0)
    if indicator == 'diastolic_bp':
        return -9.0 * min(day / 30, 1.0)
    return 0.0


def daily_value(rng: random.Random, crew_id: str, indicator: str, day: int,
                definition: dict, effect: float = 0.0, noise_scale: float = 1.0) -> float:
    """One simulated reading, clipped to the input range and rounded to the step."""
    raw = (
        PERSONAL_MEANS[crew_id][indicator]
        + adaptation_drift(indicator, day)
        + rng.gauss(0.0, NOISE_SD[indicator] * noise_scale)
        + effect
    )
    clipped = clip(raw, definition['inputMin'], definition['inputMax'])
    value = round_to_step(clipped, definition['step'])
    return int(value) if decimals_of(definition['step']) == 0 else value


def reading_time_ms(indicator: str, day: int) -> int:
    offset = EVENING_MS if indicator == 'exercise_minutes' else MORNING_MS
    return (day - 1) * MS_PER_DAY + offset


def is_due(definition: dict, day: int) -> bool:
    """Daily indicators every day; weekly ones every seventh day."""
    return day % definition['cadenceDays'] == 0


def cabin_co2(rng: random.Random) -> float:
    return round(clip(rng.gauss(CABIN_CO2_MEAN, CABIN_CO2_SD), *CABIN_CO2_RANGE), 1)
