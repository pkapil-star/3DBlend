"""Generate the seed scenario files (ARCHITECTURE.md section 24).

Usage:
    python tools/simulator/generate.py --all --seed 42
    python tools/simulator/generate.py --scenario solar-storm --seed 42
    python tools/simulator/generate.py --suit --seed 42

Writes public/seed/<scenario>.json, and with --all also public/seed/index.json,
public/seed/suit-replay.json (also alone with --suit) and
public/data/space-weather.json. Standard library only. The same seed always
gives byte-identical files. Never edit the generated files by hand.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import random
import sys
from pathlib import Path

import model
import scenarios
import suit
from scenarios import Scenario

SEED_DIR = model.REPO_ROOT / 'public' / 'seed'
DATA_DIR = model.REPO_ROOT / 'public' / 'data'
DONKI_DIR = model.REPO_ROOT / 'ml' / 'data' / 'raw' / 'donki'
# The labelled flares written by ml/build_dataset.py (section 26.4).
FLARES_CSV = model.REPO_ROOT / 'ml' / 'data' / 'processed' / 'flares.csv'


def build_readings(scenario: Scenario, rng: random.Random, indicators: dict) -> list:
    readings = []
    for crew in model.CREW:
        last_day = scenario.mission_day if crew['id'] in scenario.checkin_today else scenario.mission_day - 1
        for day in range(1, last_day + 1):
            days_before = scenario.mission_day - day
            for indicator in model.INDICATOR_ORDER:
                definition = indicators[indicator]
                if not model.is_due(definition, day):
                    continue
                if days_before == 0 and model.reading_time_ms(indicator, day) % model.MS_PER_DAY != model.MORNING_MS:
                    continue  # by 09:00 today's check-in holds only the morning readings
                effect = scenario.effects.get((crew['id'], indicator, days_before), 0.0)
                noise_scale = 0.4 if effect and scenario.quiet_effects else 1.0
                value = model.daily_value(rng, crew['id'], indicator, day, definition, effect, noise_scale)
                readings.append({
                    'crewId': crew['id'],
                    'indicator': indicator,
                    'value': value,
                    'day': day,
                    'atMs': model.reading_time_ms(indicator, day),
                    'origin': 'seed',
                })
    for crew_id, indicator, value in scenario.today_readings:
        readings.append({
            'crewId': crew_id,
            'indicator': indicator,
            'value': value,
            'day': scenario.mission_day,
            'atMs': model.reading_time_ms(indicator, scenario.mission_day),
            'origin': 'seed',
        })
    return readings


def build_context(scenario: Scenario, rng: random.Random) -> list:
    dose = model.DAILY_DOSE_MSV[scenario.environment_id]
    return [
        {
            'day': day,
            'cabin_co2': model.cabin_co2(rng),
            'radiation_dose': dose,
            'solar_event': scenario.solar_event_today and day == scenario.mission_day,
        }
        for day in range(1, scenario.mission_day + 1)
    ]


def locate_donki_event(event_id: str, donki_dir: Path = DONKI_DIR) -> tuple[dict, str] | None:
    """A real SEP record in the cached DONKI files and its file name as meta.json lists it, or None."""
    for path in sorted((donki_dir / 'SEP').glob('*.json.gz')):
        with gzip.open(path, 'rt', encoding='utf-8') as handle:
            for record in json.load(handle):
                if record.get('sepID') == event_id:
                    return record, f'SEP/{path.name}'
    return None


def find_donki_event(event_id: str, donki_dir: Path = DONKI_DIR) -> dict | None:
    """Looks a real SEP record up in the cached DONKI files, or returns None."""
    found = locate_donki_event(event_id, donki_dir)
    return found[0] if found else None


def find_flare(flare_id: str, flares_csv: Path = FLARES_CSV) -> dict:
    """One labelled flare from flares.csv. Only flares of the model's test years may be used."""
    if not flares_csv.exists():
        raise SystemExit(f'{flares_csv} is missing. Run ml/build_dataset.py first.')
    with flares_csv.open(encoding='utf-8', newline='') as handle:
        for row in csv.DictReader(handle):
            if row['flrID'] == flare_id:
                if row['split'] != 'test':
                    # The demo must never show the model a flare it was trained or tuned on.
                    raise SystemExit(f"Flare {flare_id} is in the {row['split']} years; scenarios use test-year flares only.")
                return row
    raise SystemExit(f'Flare {flare_id} is not in {flares_csv}; never type a flare in by hand here.')


def _number(text: str) -> int | float:
    value = float(text)
    return int(value) if value.is_integer() else value


def flare_observations(scenario: Scenario, flares_csv: Path = FLARES_CSV) -> list:
    """The scenario's real flares as FlareObservation records (section 26.11)."""
    observations = []
    for flare_id, days_before, clock in scenario.flares:
        row = find_flare(flare_id, flares_csv)
        hours, minutes = (int(part) for part in clock.split(':'))
        day = scenario.mission_day - days_before
        observations.append({
            'donkiId': row['flrID'],
            'link': row['link'],
            'day': day,
            'peakMs': (day - 1) * model.MS_PER_DAY + (hours * 60 + minutes) * 60_000,
            'classType': row['classType'],
            'sourceLocation': row['sourceLocation'],
            'riseMin': _number(row['riseMin']),
            'durationMin': _number(row['durationMin']) if row['durationMin'] else None,
            'cme': {
                'speedKms': _number(row['cmeSpeedKms']),
                'halfAngleDeg': _number(row['cmeHalfAngleDeg']),
            } if row['cmeId'] else None,
        })
    return observations


def based_on(scenario: Scenario, donki_dir: Path = DONKI_DIR, flares_csv: Path = FLARES_CSV) -> str | None:
    """Which real DONKI events the scenario replays, in words, or None when everything is fictional."""
    sentences = []
    if scenario.donki_event_id is not None:
        record = find_donki_event(scenario.donki_event_id, donki_dir)
        if record is None:
            raise SystemExit(
                f'{scenario.scenario_id}: DONKI event {scenario.donki_event_id} is not in {donki_dir}. '
                'Run ml/fetch_donki.py first; never type an event in by hand here.'
            )
        sentences.append(f"Timing from NASA DONKI solar particle event {record['sepID']} ({record['eventTime']}).")
    for flare_id, _days_before, _clock in scenario.flares:
        row = find_flare(flare_id, flares_csv)
        sentences.append(
            f"Real solar flare from NASA DONKI: {row['flrID']}, class {row['classType']}, peak {row['peakTime']}, "
            'replayed on the mission timeline.'
        )
    if not sentences:
        return None
    return ' '.join(sentences + ['The crew and their health readings are simulated.'])


def build_scenario(scenario: Scenario, seed: int, indicators: dict) -> dict:
    # A separate, named random stream per scenario: adding a scenario never
    # changes the others.
    rng = random.Random(f'{seed}:{scenario.scenario_id}')
    return {
        'schemaVersion': 1,
        'scenarioId': scenario.scenario_id,
        'title': scenario.title,
        'simulated': True,
        'generator': f'tools/simulator seed={seed}',
        'missionDay': scenario.mission_day,
        'environmentId': scenario.environment_id,
        'crew': [dict(member) for member in model.CREW],
        'readings': build_readings(scenario, rng, indicators),
        'symptoms': [],
        'context': build_context(scenario, rng),
        'spaceWeather': flare_observations(scenario),
        'basedOn': based_on(scenario),
        'expectedAlerts': [
            {'crewId': crew_id, 'ruleId': rule_id} for crew_id, rule_id in scenario.expected_alerts
        ],
        'expectedInsights': [
            {'crewId': crew_id, 'modelId': model_id} for crew_id, model_id in scenario.expected_insights
        ],
    }


def to_text(document: dict) -> str:
    """JSON with one list item per line: small on disk, still readable in a diff."""
    lines = ['{']
    keys = list(document)
    for index, key in enumerate(keys):
        value = document[key]
        comma = ',' if index < len(keys) - 1 else ''
        if isinstance(value, list) and value and isinstance(value[0], dict):
            lines.append(f'  {json.dumps(key)}: [')
            for item_index, item in enumerate(value):
                item_comma = ',' if item_index < len(value) - 1 else ''
                lines.append(f'    {json.dumps(item, ensure_ascii=False)}{item_comma}')
            lines.append(f'  ]{comma}')
        else:
            lines.append(f'  {json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}{comma}')
    lines.append('}')
    return '\n'.join(lines) + '\n'


def build_index() -> dict:
    return {
        'schemaVersion': 1,
        'simulated': True,
        'defaultScenarioId': scenarios.DEFAULT_SCENARIO_ID,
        'scenarios': [
            {
                'scenarioId': scenario.scenario_id,
                'title': scenario.title,
                'environmentId': scenario.environment_id,
                'missionDay': scenario.mission_day,
                'basedOn': based_on(scenario),
            }
            for scenario in scenarios.SCENARIOS
        ],
    }


def build_space_weather(
    donki_dir: Path = DONKI_DIR, scenario_list: tuple = scenarios.SCENARIOS, flares_csv: Path = FLARES_CSV
) -> dict:
    """The real DONKI events the scenarios use, with where they came from and when they were retrieved."""
    meta_path = donki_dir / 'meta.json'
    files = json.loads(meta_path.read_text(encoding='utf-8')).get('files', {}) if meta_path.exists() else {}
    events: dict[str, dict] = {}
    retrieved = []

    def add(event_id: str, kind: str, event_time: str, link: str, file_name: str, scenario_id: str) -> None:
        # meta.json records a retrieval time per downloaded file; without it the date is unknown.
        retrieved_at = files.get(file_name, {}).get('retrievedAt')
        if not retrieved_at:
            raise SystemExit(f'{meta_path} has no retrieval time for {file_name}.')
        retrieved.append(retrieved_at)
        event = events.setdefault(
            event_id, {'donkiId': event_id, 'type': kind, 'eventTime': event_time, 'link': link, 'usedIn': []}
        )
        if scenario_id not in event['usedIn']:
            event['usedIn'].append(scenario_id)

    for scenario in scenario_list:
        if scenario.donki_event_id is not None:
            found = locate_donki_event(scenario.donki_event_id, donki_dir)
            if found is None:
                raise SystemExit(f'DONKI event {scenario.donki_event_id} is not in {donki_dir}.')
            record, file_name = found
            add(record['sepID'], 'SEP', record['eventTime'], record['link'], file_name, scenario.scenario_id)
        for flare_id, _days_before, _clock in scenario.flares:
            row = find_flare(flare_id, flares_csv)
            # The downloader files a flare by the year of its begin time, which starts its id.
            add(row['flrID'], 'FLR', row['peakTime'], row['link'], f"FLR/{row['flrID'][:4]}.json.gz", scenario.scenario_id)
    if events:
        note = (
            'Real events from the NASA CCMC DONKI catalog, replayed in scenarios. '
            'The crew and their health readings in every scenario are simulated.'
        )
    else:
        note = 'No real DONKI event is recorded: every scenario uses fictional timing.'
    return {
        'schemaVersion': 1,
        'source': 'NASA CCMC DONKI',
        'retrievedAt': max(retrieved) if retrieved else None,
        'note': note,
        'events': list(events.values()),
    }


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # newline='\n' keeps the bytes identical on Windows, macOS and Linux.
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--all', action='store_true', help='generate every scenario and the index')
    group.add_argument('--scenario', help='generate one scenario by id')
    group.add_argument('--suit', action='store_true', help='generate only the suit sensor replay')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--out', default=str(SEED_DIR), help='folder for the scenario files')
    args = parser.parse_args(argv)

    out_dir = Path(args.out)
    if args.all or args.suit:
        replay = suit.build_replay(args.seed)
        write(out_dir / 'suit-replay.json', to_text(replay))
        print(f"suit-replay.json: {len(replay['samples'])} samples")
    if args.suit:
        return 0
    indicators = model.load_indicators()
    selected = scenarios.SCENARIOS if args.all else (scenarios.by_id(args.scenario),)
    for scenario in selected:
        document = build_scenario(scenario, args.seed, indicators)
        write(out_dir / f'{scenario.scenario_id}.json', to_text(document))
        print(f"{scenario.scenario_id}: {len(document['readings'])} readings, day {scenario.mission_day}")
    if args.all:
        write(out_dir / 'index.json', json.dumps(build_index(), indent=2) + '\n')
        write(DATA_DIR / 'space-weather.json', json.dumps(build_space_weather(), indent=2) + '\n')
        print('index.json and space-weather.json written')
    return 0


if __name__ == '__main__':
    sys.exit(main())
