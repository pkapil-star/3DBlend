"""Tests for ml/features.py. Run: python -m unittest discover -s ml/tests"""

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import features  # noqa: E402


class ClassTests(unittest.TestCase):
    def test_reads_a_letter_and_a_number(self):
        self.assertEqual(features.parse_class('X2.2'), ('X', 2.2))
        self.assertEqual(features.parse_class('M1'), ('M', 1.0))
        self.assertEqual(features.parse_class('C9.9'), ('C', 9.9))
        self.assertEqual(features.parse_class(' B4.5 '), ('B', 4.5))

    def test_bad_strings_give_none(self):
        for text in ('', 'Z1.0', 'M', 'X1.2.3', 'M-1', 'M0', 'm1.0', '1.0M', 'X 2.2', None, 12):
            self.assertIsNone(features.parse_class(text), text)

    def test_only_m1_and_above_is_kept(self):
        for text in ('M1.0', 'M1', 'M9.9', 'X1.0', 'X28'):
            self.assertTrue(features.is_m1_or_above(text), text)
        for text in ('C9.9', 'B5.0', 'A1.0', 'M0.9', 'nonsense', None):
            self.assertFalse(features.is_m1_or_above(text), text)

    def test_peak_flux_uses_the_goes_scale(self):
        self.assertAlmostEqual(features.log10_peak_flux('M1.0'), -5.0, places=12)
        self.assertAlmostEqual(features.log10_peak_flux('C1.0'), -6.0, places=12)
        self.assertAlmostEqual(features.log10_peak_flux('X2.2'), math.log10(2.2e-4), places=12)
        self.assertIsNone(features.log10_peak_flux('bad'))


class LocationTests(unittest.TestCase):
    def test_west_and_north_are_positive(self):
        self.assertEqual(features.parse_location('S17W33'), (-17.0, 33.0))
        self.assertEqual(features.parse_location('N05E80'), (5.0, -80.0))
        self.assertEqual(features.parse_location('N9W99'), (9.0, 99.0))
        self.assertEqual(features.parse_location('S20W100'), (-20.0, 100.0))

    def test_bad_strings_give_none(self):
        for text in ('', 'S17', 'W33S17', 'S91W10', 'S10W181', 'S17W', 'X17W33', 's17w33', None, 1733):
            self.assertIsNone(features.parse_location(text), text)


class TimeTests(unittest.TestCase):
    def test_minutes_between_two_donki_times(self):
        self.assertEqual(features.minutes_between('2024-05-09T08:45Z', '2024-05-09T09:13Z'), 28.0)
        self.assertEqual(features.minutes_between('2024-05-09T23:50Z', '2024-05-10T00:20Z'), 30.0)
        self.assertEqual(features.minutes_between('2024-05-09T08:45:00Z', '2024-05-09T08:46:30Z'), 1.5)
        self.assertEqual(features.minutes_between('2024-05-09T09:00Z', '2024-05-09T08:45Z'), -15.0)

    def test_a_missing_or_bad_time_gives_none(self):
        self.assertIsNone(features.minutes_between(None, '2024-05-09T09:13Z'))
        self.assertIsNone(features.minutes_between('2024-05-09T08:45Z', ''))
        self.assertIsNone(features.minutes_between('09 May 2024', '2024-05-09T09:13Z'))


class FlareFeatureTests(unittest.TestCase):
    OBSERVATION = {
        'classType': 'X2.2',
        'sourceLocation': 'S17W33',
        'riseMin': 28,
        'durationMin': 61,
        'cme': {'speedKms': 1200.0, 'halfAngleDeg': 45.0},
    }

    def test_eight_features_in_the_order_of_the_model_file(self):
        self.assertEqual(
            features.FEATURE_NAMES,
            ('log10_peak_flux', 'lon_sin', 'lon_cos', 'log1p_rise_min', 'log1p_duration_min', 'has_cme', 'log1p_cme_speed', 'cme_half_angle_deg'),
        )
        values = features.flare_features(self.OBSERVATION)
        expected = [
            math.log10(2.2e-4),
            math.sin(math.radians(33)),
            math.cos(math.radians(33)),
            math.log1p(28),
            math.log1p(61),
            1.0,
            math.log1p(1200.0),
            45.0,
        ]
        self.assertEqual(len(values), 8)
        for value, wanted in zip(values, expected):
            self.assertAlmostEqual(value, wanted, places=12)

    def test_an_eastern_flare_has_a_negative_sine(self):
        values = features.flare_features({**self.OBSERVATION, 'sourceLocation': 'N05E80'})
        self.assertAlmostEqual(values[1], -math.sin(math.radians(80)), places=12)
        self.assertAlmostEqual(values[2], math.cos(math.radians(80)), places=12)

    def test_no_cme_gives_three_zeros(self):
        values = features.flare_features({**self.OBSERVATION, 'cme': None})
        self.assertEqual(values[5:], [0.0, 0.0, 0.0])

    def test_a_missing_end_time_uses_the_given_value(self):
        values = features.flare_features({**self.OBSERVATION, 'durationMin': None}, duration_impute=3.25)
        self.assertEqual(values[4], 3.25)
        with self.assertRaises(ValueError):
            features.flare_features({**self.OBSERVATION, 'durationMin': None})

    def test_unusable_inputs_are_refused(self):
        for change in ({'classType': 'bad'}, {'sourceLocation': 'bad'}, {'riseMin': -1}, {'riseMin': None}, {'durationMin': -5}):
            with self.assertRaises(ValueError):
                features.flare_features({**self.OBSERVATION, **change})


if __name__ == '__main__':
    unittest.main()
