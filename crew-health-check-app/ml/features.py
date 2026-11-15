"""Features of the sep-risk model (ARCHITECTURE.md section 26.5).

Standard library only. This file is the single definition of the features:
the TypeScript twin, src/engine/models/sepRisk.ts, mirrors it line by line,
and the parity file proves that the two agree.
"""

from __future__ import annotations

import datetime as dt
import math
import re

# (name, display group), in the order of the model file.
FEATURES = (
    ('log10_peak_flux', 'Flare class'),
    ('lon_sin', 'Source location'),
    ('lon_cos', 'Source location'),
    ('log1p_rise_min', 'Rise time'),
    ('log1p_duration_min', 'Duration'),
    ('has_cme', 'CME'),
    ('log1p_cme_speed', 'CME'),
    ('cme_half_angle_deg', 'CME'),
)
FEATURE_NAMES = tuple(name for name, _group in FEATURES)
DURATION_FEATURE = 'log1p_duration_min'

# Peak X-ray flux in W/m2 of class 1.0 of each GOES letter.
CLASS_BASE = {'A': 1e-8, 'B': 1e-7, 'C': 1e-6, 'M': 1e-5, 'X': 1e-4}

_CLASS = re.compile(r'^([ABCMX])(\d+(?:\.\d+)?)$')
_LOCATION = re.compile(r'^([NS])(\d{1,2})([EW])(\d{1,3})$')
_TIME_FORMATS = ('%Y-%m-%dT%H:%MZ', '%Y-%m-%dT%H:%M:%SZ')


def parse_class(text: object) -> tuple[str, float] | None:
    """'X2.2' -> ('X', 2.2); None for anything that is not a letter A, B, C, M or X and a positive number."""
    if not isinstance(text, str):
        return None
    match = _CLASS.match(text.strip())
    if not match:
        return None
    number = float(match.group(2))
    return (match.group(1), number) if number > 0 else None


def is_m1_or_above(text: object) -> bool:
    parsed = parse_class(text)
    if parsed is None:
        return False
    letter, number = parsed
    return letter == 'X' or (letter == 'M' and number >= 1.0)


def log10_peak_flux(text: object) -> float | None:
    parsed = parse_class(text)
    if parsed is None:
        return None
    letter, number = parsed
    return math.log10(CLASS_BASE[letter] * number)


def parse_location(text: object) -> tuple[float, float] | None:
    """'S17W33' -> (-17.0, 33.0): latitude north positive, longitude west positive, in degrees."""
    if not isinstance(text, str):
        return None
    match = _LOCATION.match(text.strip())
    if not match:
        return None
    latitude, longitude = float(match.group(2)), float(match.group(4))
    if latitude > 90 or longitude > 180:
        return None
    return (
        latitude if match.group(1) == 'N' else -latitude,
        longitude if match.group(3) == 'W' else -longitude,
    )


def parse_time(text: object) -> dt.datetime | None:
    """A DONKI time such as '2024-05-09T08:45Z', in UTC."""
    if not isinstance(text, str):
        return None
    for layout in _TIME_FORMATS:
        try:
            return dt.datetime.strptime(text.strip(), layout).replace(tzinfo=dt.timezone.utc)
        except ValueError:
            continue
    return None


def minutes_between(start: object, end: object) -> float | None:
    first, last = parse_time(start), parse_time(end)
    if first is None or last is None:
        return None
    return (last - first).total_seconds() / 60.0


def flare_features(observation: dict, duration_impute: float | None = None) -> list[float]:
    """The feature values of one flare, in the order of FEATURE_NAMES.

    `observation` holds what the app receives (section 26.11): classType,
    sourceLocation, riseMin, durationMin (None when DONKI has no end time) and
    cme (None, or speedKms and halfAngleDeg of the chosen analysis).
    `duration_impute` replaces log1p_duration_min when durationMin is None.
    """
    flux = log10_peak_flux(observation['classType'])
    if flux is None:
        raise ValueError(f"flare class cannot be read: {observation['classType']!r}")
    location = parse_location(observation['sourceLocation'])
    if location is None:
        raise ValueError(f"source location cannot be read: {observation['sourceLocation']!r}")
    longitude = location[1] * math.pi / 180.0
    rise = observation['riseMin']
    if rise is None or rise < 0:
        raise ValueError(f'rise time must be zero or more minutes: {rise!r}')
    duration = observation['durationMin']
    if duration is None:
        if duration_impute is None:
            raise ValueError('no end time, and no value to use instead')
        log_duration = duration_impute
    elif duration < 0:
        raise ValueError(f'duration must be zero or more minutes: {duration!r}')
    else:
        log_duration = math.log1p(duration)
    cme = observation.get('cme')
    return [
        flux,
        math.sin(longitude),
        math.cos(longitude),
        math.log1p(rise),
        log_duration,
        1.0 if cme else 0.0,
        math.log1p(cme['speedKms']) if cme else 0.0,
        float(cme['halfAngleDeg']) if cme else 0.0,
    ]
