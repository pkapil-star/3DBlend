"""Simulated suit skin-temperature replay (ARCHITECTURE.md section 24.5).

Builds public/seed/suit-replay.json, written by generate.py --suit (and --all).
Every number below is an illustrative simulation parameter, not a reference
value: the app labels these readings "Simulated skin temperature" and never
compares them with anything. Standard library only; the same seed always gives
the same file.
"""

from __future__ import annotations

import random

INTERVAL_MIN = 5
FROM_OFFSET_MIN = -120
TO_OFFSET_MIN = 1440
CREW = ('c1', 'c2')
SITES = ('chest', 'upper_back', 'forearm_l')

# Chest: steady with small noise.
CHEST_C = 34.0
# Upper back: a steady warming from the first sample until +60 min, then flat.
UPPER_BACK_START_C = 33.0
UPPER_BACK_RISE_C = 1.5
UPPER_BACK_RISE_END_MIN = 60
# Left forearm: steady, and loses contact after -35 min, so at the anchor it
# already shows "No current reading" with a last valid reading 35 minutes old.
FOREARM_C = 32.5
FOREARM_LAST_CONTACT_MIN = -35
NOISE_C = 0.1


def offsets() -> range:
    return range(FROM_OFFSET_MIN, TO_OFFSET_MIN + 1, INTERVAL_MIN)


def upper_back_c(offset_min: int) -> float:
    span = UPPER_BACK_RISE_END_MIN - FROM_OFFSET_MIN
    progress = min(1.0, (offset_min - FROM_OFFSET_MIN) / span)
    return UPPER_BACK_START_C + UPPER_BACK_RISE_C * progress


def sample(crew_id: str, site: str, offset_min: int, rng: random.Random) -> dict:
    if site == 'forearm_l' and offset_min > FOREARM_LAST_CONTACT_MIN:
        return {'crewId': crew_id, 'site': site, 'offsetMin': offset_min, 'contact': False, 'tempC': None}
    if site == 'chest':
        value = CHEST_C + rng.uniform(-NOISE_C, NOISE_C)
    elif site == 'upper_back':
        value = upper_back_c(offset_min)
    else:
        value = FOREARM_C + rng.uniform(-NOISE_C, NOISE_C)
    return {'crewId': crew_id, 'site': site, 'offsetMin': offset_min, 'contact': True, 'tempC': round(value, 1)}


def build_replay(seed: int) -> dict:
    rng = random.Random(f'{seed}:suit')
    samples = [
        sample(crew_id, site, offset_min, rng)
        for crew_id in CREW
        for site in SITES
        for offset_min in offsets()
    ]
    return {
        'schemaVersion': 1,
        'simulated': True,
        'label': 'Simulated skin temperature',
        'generator': f'tools/simulator/suit.py seed={seed}',
        'intervalMin': INTERVAL_MIN,
        'fromOffsetMin': FROM_OFFSET_MIN,
        'toOffsetMin': TO_OFFSET_MIN,
        'samples': samples,
    }
