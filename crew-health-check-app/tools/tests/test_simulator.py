"""Tests for the seed simulator. Run: python -m unittest discover -s tools/tests"""

import csv
import gzip
import json
import math
import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'simulator'))

import generate  # noqa: E402
import model  # noqa: E402
import scenarios  # noqa: E402


class RoundingTests(unittest.TestCase):
    def test_decimals_of_step(self):
        self.assertEqual(model.decimals_of(1), 0)
        self.assertEqual(model.decimals_of(0.1), 1)
        self.assertEqual(model.decimals_of(0.25), 2)

    def test_round_to_step_has_no_float_leftovers(self):
        self.assertEqual(model.round_to_step(6.74, 0.25), 6.75)
        self.assertEqual(model.round_to_step(36.94, 0.1), 36.9)
        self.assertEqual(model.round_to_step(61.6, 1), 62)

    def test_clip(self):
        self.assertEqual(model.clip(5, 0, 3), 3)
        self.assertEqual(model.clip(-1, 0, 3), 0)
        self.assertEqual(model.clip(2, 0, 3), 2)


class ModelTests(unittest.TestCase):
    def setUp(self):
        self.indicators = model.load_indicators()

    def test_every_indicator_has_means_and_noise(self):
        for crew in model.CREW:
            for indicator in model.INDICATOR_ORDER:
                self.assertIn(indicator, model.PERSONAL_MEANS[crew['id']])
                self.assertIn(indicator, model.NOISE_SD)
        self.assertEqual(set(model.INDICATOR_ORDER), set(self.indicators))

    def test_values_stay_in_the_input_range_and_on_the_step(self):
        rng = random.Random(1)
        for indicator, definition in self.indicators.items():
            for day in (1, 40, 200):
                value = model.daily_value(rng, 'c1', indicator, day, definition, effect=1000)
                self.assertLessEqual(value, definition['inputMax'])
                value = model.daily_value(rng, 'c1', indicator, day, definition)
                self.assertGreaterEqual(value, definition['inputMin'])
                self.assertEqual(value, model.round_to_step(value, definition['step']))

    def test_drift_follows_the_documented_shape(self):
        self.assertEqual(model.adaptation_drift('body_temp', 0), 0)
        self.assertAlmostEqual(model.adaptation_drift('body_temp', 75), 1.0)
        self.assertAlmostEqual(model.adaptation_drift('body_temp', 300), 1.0)
        self.assertAlmostEqual(model.adaptation_drift('systolic_bp', 30), -8.0)
        self.assertAlmostEqual(model.adaptation_drift('diastolic_bp', 60), -9.0)
        self.assertEqual(model.adaptation_drift('sleep_hours', 50), 0)

    def test_weekly_indicators_are_due_every_seventh_day(self):
        weekly = self.indicators['near_vision']
        self.assertEqual([day for day in range(1, 22) if model.is_due(weekly, day)], [7, 14, 21])
        self.assertTrue(model.is_due(self.indicators['sleep_hours'], 5))

    def test_crew_names_are_fictional(self):
        for crew in model.CREW:
            self.assertRegex(crew['name'], r'^Crew member [A-Z]$')

    def test_ordinary_cabin_co2_stays_under_the_limit(self):
        rng = random.Random(2)
        self.assertTrue(all(model.cabin_co2(rng) <= 2.8 for _ in range(2000)))


class ScenarioTests(unittest.TestCase):
    def setUp(self):
        self.indicators = model.load_indicators()

    def build(self, scenario_id, seed=42):
        return generate.build_scenario(scenarios.by_id(scenario_id), seed, self.indicators)

    def test_same_seed_gives_identical_output(self):
        for scenario in scenarios.SCENARIOS:
            first = generate.to_text(self.build(scenario.scenario_id))
            second = generate.to_text(self.build(scenario.scenario_id))
            self.assertEqual(first, second)

    def test_a_different_seed_changes_the_readings(self):
        self.assertNotEqual(self.build('sleep-debt', 42)['readings'], self.build('sleep-debt', 43)['readings'])

    def test_scenario_file_shape(self):
        document = self.build('sleep-debt')
        self.assertIs(document['simulated'], True)
        self.assertEqual(document['schemaVersion'], 1)
        self.assertEqual(document['generator'], 'tools/simulator seed=42')
        self.assertEqual([member['id'] for member in document['crew']], ['c1', 'c2', 'c3'])
        self.assertEqual(document['expectedAlerts'], [{'crewId': 'c1', 'ruleId': 'R-SLEEP-01'}])
        self.assertEqual(document['expectedInsights'], [])
        self.assertIsNone(document['basedOn'])

    def test_history_stops_the_day_before_the_mission_day(self):
        document = self.build('baseline-healthy')
        mission_day = document['missionDay']
        self.assertEqual(max(reading['day'] for reading in document['readings']), mission_day - 1)
        self.assertEqual(len(document['context']), mission_day)
        self.assertEqual(document['context'][-1]['day'], mission_day)

    def test_sleep_debt_has_five_short_nights_for_crew_a_only(self):
        document = self.build('sleep-debt')
        mission_day = document['missionDay']

        def nights(crew_id):
            return {
                reading['day']: reading['value']
                for reading in document['readings']
                if reading['crewId'] == crew_id and reading['indicator'] == 'sleep_hours'
            }

        crew_a = nights('c1')
        short = [day for day in range(mission_day - 5, mission_day) if crew_a[day] < 5.5]
        self.assertEqual(len(short), 5)
        crew_b = nights('c2')
        self.assertTrue(all(crew_b[day] > 5.0 for day in range(mission_day - 5, mission_day)))

    def test_low_glucose_logs_one_low_reading_this_morning(self):
        document = self.build('low-glucose')
        today = [reading for reading in document['readings'] if reading['day'] == document['missionDay']]
        self.assertEqual(len(today), 1)
        self.assertEqual((today[0]['crewId'], today[0]['indicator'], today[0]['value']), ('c1', 'blood_glucose', 62))

    def test_pattern_shift_moves_four_readings_of_crew_a_for_three_days(self):
        scenario = scenarios.by_id('pattern-shift')
        shifted = {(crew, indicator) for crew, indicator, _ in scenario.effects}
        self.assertEqual(shifted, {('c1', indicator) for indicator in scenarios.PATTERN_SHIFT_DIRECTIONS})
        self.assertEqual({days for _, _, days in scenario.effects}, {0, 1, 2})
        for (crew, indicator, _), amount in scenario.effects.items():
            direction = scenarios.PATTERN_SHIFT_DIRECTIONS[indicator]
            self.assertAlmostEqual(amount, direction * scenarios.PATTERN_SHIFT_SIZE * model.NOISE_SD[indicator])
        self.assertEqual(scenario.expected_alerts, ())
        self.assertEqual(scenario.expected_insights, (('c1', 'personal-pattern'),))

    def test_pattern_shift_logs_crew_a_morning_check_in_today_only(self):
        document = self.build('pattern-shift')
        today = [reading for reading in document['readings'] if reading['day'] == document['missionDay']]
        self.assertEqual({reading['crewId'] for reading in today}, {'c1'})
        indicators = {reading['indicator'] for reading in today}
        self.assertNotIn('exercise_minutes', indicators)
        self.assertTrue({'sleep_hours', 'mood', 'heart_rate', 'reaction_time'} <= indicators)
        morning = (document['missionDay'] - 1) * model.MS_PER_DAY + model.MORNING_MS
        self.assertTrue(all(reading['atMs'] == morning for reading in today))
        self.assertEqual(document['expectedInsights'], [{'crewId': 'c1', 'modelId': 'personal-pattern'}])

    def test_other_scenarios_expect_no_insight(self):
        for scenario in scenarios.SCENARIOS:
            if scenario.scenario_id != 'pattern-shift':
                self.assertEqual(self.build(scenario.scenario_id)['expectedInsights'], [], scenario.scenario_id)

    def test_solar_storm_marks_only_the_mission_day(self):
        document = self.build('solar-storm')
        flagged = [sample['day'] for sample in document['context'] if sample['solar_event']]
        self.assertEqual(flagged, [document['missionDay']])
        self.assertEqual(document['environmentId'], 'leo_station')

    def test_index_lists_every_scenario_and_the_default(self):
        index = generate.build_index()
        self.assertEqual(index['defaultScenarioId'], 'sleep-debt')
        self.assertEqual(
            [entry['scenarioId'] for entry in index['scenarios']],
            [scenario.scenario_id for scenario in scenarios.SCENARIOS],
        )

    def test_to_text_is_valid_json_with_one_reading_per_line(self):
        document = self.build('early-mission')
        text = generate.to_text(document)
        self.assertEqual(json.loads(text), document)
        self.assertTrue(text.endswith('}\n'))
        self.assertIn('\n    {"crewId": "c1", "indicator": "sleep_hours"', text)


class DonkiLookupTests(unittest.TestCase):
    RECORD = {'sepID': 'TEST-SEP-001', 'eventTime': '2000-01-01T00:00Z', 'link': 'https://example.org/'}

    @staticmethod
    def write_donki(folder, records, retrieved_at='2000-02-01T00:00:00Z'):
        sep_dir = Path(folder) / 'SEP'
        sep_dir.mkdir()
        with gzip.open(sep_dir / '2000.json.gz', 'wt', encoding='utf-8') as handle:
            json.dump(records, handle)
        files = {'SEP/2000.json.gz': {'retrievedAt': retrieved_at}} if retrieved_at else {}
        (Path(folder) / 'meta.json').write_text(json.dumps({'files': files}), encoding='utf-8')

    @staticmethod
    def storm(event_id='TEST-SEP-001'):
        return scenarios.Scenario(
            scenario_id='test-storm', title='Test', mission_day=10, environment_id='leo_station', donki_event_id=event_id
        )

    def test_finds_a_cached_sep_record_by_id(self):
        with tempfile.TemporaryDirectory() as folder:
            self.write_donki(folder, [self.RECORD])
            self.assertEqual(generate.find_donki_event('TEST-SEP-001', Path(folder)), self.RECORD)
            self.assertIsNone(generate.find_donki_event('MISSING', Path(folder)))

    def test_space_weather_file_says_so_when_no_real_event_is_recorded(self):
        with tempfile.TemporaryDirectory() as folder:
            document = generate.build_space_weather(Path(folder), (scenarios.by_id('sleep-debt'),))
        self.assertEqual(document['events'], [])
        self.assertIsNone(document['retrievedAt'])
        self.assertIn('No real DONKI event', document['note'])

    def test_space_weather_lists_a_real_event_with_the_retrieval_time_of_its_file(self):
        with tempfile.TemporaryDirectory() as folder:
            self.write_donki(folder, [self.RECORD])
            document = generate.build_space_weather(Path(folder), (self.storm(),))
        self.assertEqual(
            document['events'],
            [{'donkiId': 'TEST-SEP-001', 'type': 'SEP', 'eventTime': '2000-01-01T00:00Z', 'link': 'https://example.org/', 'usedIn': ['test-storm']}],
        )
        self.assertEqual(document['retrievedAt'], '2000-02-01T00:00:00Z')

    def test_an_event_without_a_retrieval_time_stops_generation(self):
        with tempfile.TemporaryDirectory() as folder:
            self.write_donki(folder, [self.RECORD], retrieved_at=None)
            with self.assertRaises(SystemExit):
                generate.build_space_weather(Path(folder), (self.storm(),))

    def test_an_event_missing_from_the_files_stops_generation(self):
        with tempfile.TemporaryDirectory() as folder:
            self.write_donki(folder, [self.RECORD])
            with self.assertRaises(SystemExit):
                generate.build_space_weather(Path(folder), (self.storm('MISSING'),))

    def test_solar_storm_takes_its_timing_from_a_measured_sep_record_before_0900_utc(self):
        scenario = scenarios.by_id('solar-storm')
        record = generate.find_donki_event(scenario.donki_event_id)
        self.assertIsNotNone(record, 'the event must be in the committed DONKI files')
        self.assertLess(record['eventTime'][11:16], '09:00')
        self.assertFalse(any(item['displayName'].startswith('MODEL:') for item in record['instruments']))
        self.assertIn(scenario.donki_event_id, generate.based_on(scenario))


class RealFlareTests(unittest.TestCase):
    """Scenario flares come from ml/data/processed/flares.csv, never from typed values (section 24.6)."""

    STORM_FLARE = '2023-08-07T20:30:00-FLR-001'

    @classmethod
    def setUpClass(cls):
        with generate.FLARES_CSV.open(encoding='utf-8', newline='') as handle:
            cls.rows = {row['flrID']: row for row in csv.DictReader(handle)}

    def test_finds_a_test_year_flare(self):
        row = generate.find_flare(self.STORM_FLARE)
        self.assertEqual((row['split'], row['classType']), ('test', self.rows[self.STORM_FLARE]['classType']))

    def test_refuses_a_flare_the_model_was_trained_or_tuned_on(self):
        for split in ('train', 'validation'):
            flare_id = next(row['flrID'] for row in self.rows.values() if row['split'] == split)
            with self.assertRaises(SystemExit):
                generate.find_flare(flare_id)

    def test_refuses_a_flare_that_is_not_in_the_file(self):
        with self.assertRaises(SystemExit):
            generate.find_flare('2099-01-01T00:00:00-FLR-001')
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(SystemExit):
                generate.find_flare(self.STORM_FLARE, Path(folder) / 'missing.csv')

    def test_flares_are_placed_on_the_mission_timeline_with_their_real_values(self):
        watch = scenarios.by_id('solar-flare-watch')
        (flare,) = generate.flare_observations(watch)
        row = self.rows[flare['donkiId']]
        self.assertEqual(flare['day'], watch.mission_day)
        self.assertEqual(flare['peakMs'], (watch.mission_day - 1) * model.MS_PER_DAY + (7 * 60 + 30) * 60_000)
        self.assertEqual(flare['classType'], row['classType'])
        self.assertEqual(flare['sourceLocation'], row['sourceLocation'])
        self.assertEqual(flare['link'], row['link'])
        self.assertEqual(float(flare['riseMin']), float(row['riseMin']))
        self.assertEqual(float(flare['durationMin']), float(row['durationMin']))
        self.assertEqual(float(flare['cme']['speedKms']), float(row['cmeSpeedKms']))
        self.assertEqual(float(flare['cme']['halfAngleDeg']), float(row['cmeHalfAngleDeg']))

        storm = scenarios.by_id('solar-storm')
        (before,) = generate.flare_observations(storm)
        self.assertEqual(before['donkiId'], self.STORM_FLARE)
        self.assertEqual(before['day'], storm.mission_day - 1)
        self.assertEqual(before['peakMs'], (storm.mission_day - 2) * model.MS_PER_DAY + 15 * 3_600_000)
        # Inside the 24 hours before 09:00 on the mission day (section 26.10).
        nine = (storm.mission_day - 1) * model.MS_PER_DAY + 9 * 3_600_000
        self.assertTrue(nine - 24 * 3_600_000 < before['peakMs'] <= nine)

    def test_a_scenario_without_flares_has_none(self):
        self.assertEqual(generate.flare_observations(scenarios.by_id('sleep-debt')), [])
        self.assertIsNone(generate.based_on(scenarios.by_id('sleep-debt')))

    def test_the_note_names_every_real_event_and_says_the_crew_is_simulated(self):
        for scenario_id in ('solar-storm', 'solar-flare-watch'):
            scenario = scenarios.by_id(scenario_id)
            note = generate.based_on(scenario)
            for flare_id, _days_before, _clock in scenario.flares:
                self.assertIn(flare_id, note)
            self.assertTrue(note.endswith('The crew and their health readings are simulated.'))
        self.assertIn('2023-08-08T01:00:00-SEP-001', generate.based_on(scenarios.by_id('solar-storm')))

    def test_the_index_carries_each_scenario_note(self):
        for entry in generate.build_index()['scenarios']:
            self.assertEqual(entry['basedOn'], generate.based_on(scenarios.by_id(entry['scenarioId'])))

    def test_the_space_weather_file_lists_every_real_event_once(self):
        document = generate.build_space_weather()
        listed = {event['donkiId']: event for event in document['events']}
        self.assertEqual(len(listed), len(document['events']))
        for scenario in scenarios.SCENARIOS:
            for flare_id, _days_before, _clock in scenario.flares:
                self.assertEqual(listed[flare_id]['type'], 'FLR')
                self.assertIn(scenario.scenario_id, listed[flare_id]['usedIn'])
                self.assertEqual(listed[flare_id]['link'], self.rows[flare_id]['link'])
        self.assertEqual(listed['2023-08-08T01:00:00-SEP-001']['usedIn'], ['solar-storm'])
        meta = json.loads((generate.DONKI_DIR / 'meta.json').read_text(encoding='utf-8'))
        self.assertEqual(
            document['retrievedAt'],
            max(meta['files'][name]['retrievedAt'] for name in ('SEP/2023.json.gz', 'FLR/2023.json.gz')),
        )
        self.assertIn('simulated', document['note'])

    def test_the_flare_watch_flare_follows_its_selection_rule(self):
        """The earliest X-class positive of the test years that the frozen model scores at or
        above its threshold, other than the solar-storm flare (scenarios.py)."""
        sys.path.insert(0, str(model.REPO_ROOT / 'ml'))
        import features  # noqa: E402  (standard library only)

        trained = json.loads(
            (model.REPO_ROOT / 'src' / 'data' / 'models' / 'sep-risk-v1.json').read_text(encoding='utf-8')
        )
        impute = next(item['impute'] for item in trained['features'] if item['impute'] is not None)

        def output(row):
            seen = {
                'classType': row['classType'],
                'sourceLocation': row['sourceLocation'],
                'riseMin': float(row['riseMin']),
                'durationMin': float(row['durationMin']) if row['durationMin'] else None,
                'cme': {
                    'speedKms': float(row['cmeSpeedKms']),
                    'halfAngleDeg': float(row['cmeHalfAngleDeg']),
                } if row['cmeId'] else None,
            }
            logit = trained['intercept']
            for value, item in zip(features.flare_features(seen, impute), trained['features']):
                logit += item['coef'] * (value - item['mean']) / item['scale']
            return 1 / (1 + math.exp(-logit))

        candidates = [
            row for row in self.rows.values()
            if row['split'] == 'test' and row['labelStatus'] == 'positive' and row['classType'].startswith('X')
            and row['flrID'] != self.STORM_FLARE and output(row) >= trained['threshold']
        ]
        earliest = min(candidates, key=lambda row: row['peakTime'])
        ((chosen, _days_before, _clock),) = scenarios.by_id('solar-flare-watch').flares
        self.assertEqual(chosen, earliest['flrID'])
        # The solar-storm flare is a test-year positive too; R-RAD-01 supersedes its outlook.
        storm = self.rows[self.STORM_FLARE]
        self.assertEqual((storm['split'], storm['labelStatus']), ('test', 'positive'))
        self.assertGreaterEqual(output(storm), trained['threshold'])


if __name__ == '__main__':
    unittest.main()
