"""Scenario definitions (ARCHITECTURE.md section 24.3).

A scenario is a mission day, an environment, and a few scripted changes on top
of the ordinary simulated history. `expected_alerts` is what the app's rules
must show at 09:00 on the mission day, and `expected_insights` what the
second-opinion models must show then; the golden tests check both exactly.

Seed histories run to the day before the mission day, so the crew member still
has today's check-in to do. A scenario adds readings for today only where its
story needs them.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import model


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    title: str
    mission_day: int
    environment_id: str
    # (crew id, indicator, days before the mission day) -> amount added to the value
    effects: dict = field(default_factory=dict)
    # Indicators whose noise is reduced on effect days, so the story is not blurred.
    quiet_effects: bool = True
    # Readings logged this morning: (crew id, indicator, value)
    today_readings: tuple = ()
    solar_event_today: bool = False
    # DONKI id of the real event this scenario takes its timing from, or None.
    donki_event_id: str | None = None
    # Real DONKI flares replayed on the mission timeline (section 24.6):
    # (DONKI flare id, days before the mission day, 'HH:MM' of the flare peak).
    flares: tuple = ()
    # Crew members whose morning check-in today is already logged (simulated, with the effects of day 0).
    checkin_today: tuple = ()
    expected_alerts: tuple = ()
    # Second-opinion insights at 09:00 on the mission day: (crew id, model id).
    expected_insights: tuple = ()


def _sleep_debt_effects() -> dict:
    # Five short nights for crew member A, ending last night.
    return {('c1', 'sleep_hours', days_before): -1.7 for days_before in range(1, 6)}


def _fever_effects() -> dict:
    # Temperature climbs over the last two days; resting heart rate rises with it.
    return {
        ('c1', 'body_temp', 2): 0.9,
        ('c1', 'body_temp', 1): 1.6,
        ('c1', 'heart_rate', 2): 8.0,
        ('c1', 'heart_rate', 1): 16.0,
    }


# The "combined" pattern of the personal pattern model's simulated evaluation
# (ml/eval_personal_pattern.py, PATTERNS); a test in ml/tests checks the two agree.
PATTERN_SHIFT_DIRECTIONS = {'sleep_hours': -1, 'mood': -1, 'heart_rate': 1, 'reaction_time': 1}
# One of the evaluation's sizes: 2.5 times the simulator's day-to-day noise of each reading.
PATTERN_SHIFT_SIZE = 2.5


def _pattern_shift_effects() -> dict:
    # Crew member A, today and the two days before: the days the baseline leaves out.
    return {
        ('c1', indicator, days_before): direction * PATTERN_SHIFT_SIZE * model.NOISE_SD[indicator]
        for indicator, direction in PATTERN_SHIFT_DIRECTIONS.items()
        for days_before in range(0, 3)
    }


SCENARIOS = (
    Scenario(
        scenario_id='baseline-healthy',
        title='An ordinary day: nothing unusual',
        mission_day=90,
        environment_id='lunar_surface',
    ),
    Scenario(
        scenario_id='sleep-debt',
        title='Sleep debt building over five nights',
        mission_day=142,
        environment_id='mars_transit',
        effects=_sleep_debt_effects(),
        expected_alerts=(('c1', 'R-SLEEP-01'),),
    ),
    Scenario(
        scenario_id='solar-storm',
        title='A solar particle event starts today',
        mission_day=120,
        # Starts at the station: 0 s delay, reply estimate 5 min (section 14).
        environment_id='leo_station',
        solar_event_today=True,
        # Timing from a real particle event (section 24.6), picked by rule: the earliest
        # SEP record of the model's test years (2023 on) that GOES measured, that starts
        # before 09:00 UTC, and that DONKI links to an X-class flare peaking the day
        # before (X1.5, peak 2023-08-07T20:46Z), so A2 can add that flare.
        donki_event_id='2023-08-08T01:00:00-SEP-001',
        # The X1.5 flare that DONKI links to that particle event, at 15:00 the day
        # before. Its model outlook (R-RAD-03) is superseded by R-RAD-01.
        flares=(('2023-08-07T20:30:00-FLR-001', 1, '15:00'),),
        expected_alerts=(
            ('c1', 'R-RAD-01'),
            ('c2', 'R-RAD-01'),
            ('c3', 'R-RAD-01'),
        ),
    ),
    Scenario(
        scenario_id='solar-flare-watch',
        title='A large solar flare this morning: the model outlook',
        mission_day=150,
        # A Mars environment, so the delay slider can show that the route of a
        # model outlook never changes (section 13.5).
        environment_id='mars_transit',
        # Picked by rule (section 24.6): the earliest X-class flare of the model's
        # test years that is a positive under decision D22, that the model scores
        # at or above its threshold, and that is not the solar-storm flare. The
        # demo therefore shows a hit by construction; the golden test proves the alert.
        flares=(('2023-08-05T21:45:00-FLR-001', 0, '07:30'),),
        expected_alerts=(
            ('c1', 'R-RAD-03'),
            ('c2', 'R-RAD-03'),
            ('c3', 'R-RAD-03'),
        ),
    ),
    Scenario(
        scenario_id='fever',
        title='Temperature climbing over two days',
        # A4 (section 26.19): at 09:00 on the mission day nobody has logged today's
        # readings, so the earth-hospital model does not run and no insight is
        # expected. On the last logged day it flags crew member A (model card,
        # "Sanity check in simulation"). The scenario was not changed for the model.
        mission_day=100,
        environment_id='mars_surface',
        effects=_fever_effects(),
        expected_alerts=(('c1', 'R-TEMP-02'),),
    ),
    Scenario(
        scenario_id='low-glucose',
        title='One low fasting blood sugar reading today',
        mission_day=75,
        environment_id='mars_transit',
        today_readings=(('c1', 'blood_glucose', 62),),
        expected_alerts=(('c1', 'R-GLU-02'),),
    ),
    Scenario(
        scenario_id='early-mission',
        title='Mission day 4: still learning your normal',
        mission_day=4,
        environment_id='leo_station',
    ),
    Scenario(
        scenario_id='pattern-shift',
        title='Several readings shift a little at once',
        mission_day=130,
        environment_id='mars_surface',
        # Built to show the personal pattern model (section 26.18), so the insight appears
        # by construction: an illustration, not a measure of how often the model notices
        # such a shift (the simulated evaluation in its model card measures that). No rule
        # fires: each change is smaller or shorter than the rules' triggers. As in every
        # scenario story, the noise is reduced on the shifted days.
        effects=_pattern_shift_effects(),
        checkin_today=('c1',),
        expected_insights=(('c1', 'personal-pattern'),),
    ),
)

DEFAULT_SCENARIO_ID = 'sleep-debt'


def by_id(scenario_id: str) -> Scenario:
    for scenario in SCENARIOS:
        if scenario.scenario_id == scenario_id:
            return scenario
    raise KeyError(f'unknown scenario: {scenario_id}')
