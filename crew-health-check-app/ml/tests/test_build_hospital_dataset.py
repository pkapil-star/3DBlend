"""Tests for ml/build_hospital_dataset.py (ARCHITECTURE.md section 26.19), on synthetic patients only.

They need numpy (inside .venv):
    python -m unittest discover -s ml/tests
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR))

HAVE_PACKAGES = all(importlib.util.find_spec(name) for name in ('numpy', 'sklearn'))
NEEDS = 'needs numpy and scikit-learn: activate .venv first (see ml/README.md)'

if HAVE_PACKAGES:
    import numpy as np

    import build_hospital_dataset as dataset

FLOORS = {'HR': 3.0, 'Temp': 0.2, 'SBP': 5.0, 'DBP': 4.0, 'Glucose': 5.0}


def patient(hours, overrides=None, labels=None, glucose_every=1):
    """Synthetic hourly values: every variable every hour unless overridden; glucose every n hours."""
    overrides = overrides or {}
    values = {
        'HR': [80.0 + (hour % 3) for hour in hours],
        'Temp': [37.0 + 0.1 * (hour % 2) for hour in hours],
        'SBP': [120.0 + (hour % 4) for hour in hours],
        'DBP': [70.0 + (hour % 3) for hour in hours],
        'Glucose': [120.0 + (hour % 5) if hour % glucose_every == 0 else None for hour in hours],
    }
    for name, series in overrides.items():
        values[name] = series
    return list(hours), values, labels or [0] * len(hours)


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class BaselineTests(unittest.TestCase):
    def test_floors_come_from_the_app_indicators(self):
        self.assertEqual(dataset.load_floors(), FLOORS)

    def test_baseline_is_the_app_formula(self):
        center, spread = dataset.baseline_of([1.0, 2.0, 3.0, 4.0, 100.0], 0.1)
        self.assertEqual(center, 3.0)
        self.assertAlmostEqual(spread, 1.4826 * 1.0)
        self.assertEqual(dataset.baseline_of([5.0, 5.0, 5.0], 2.0), (5.0, 2.0))

    def test_only_hours_1_to_24_form_the_baseline(self):
        hours = range(1, 31)
        temps = [37.0] * 24 + [40.0] * 6  # a late rise must not move the baseline
        status, rows = dataset.patient_rows(*patient(hours, {'Temp': temps}), FLOORS)
        self.assertEqual(status, 'kept')
        self.assertEqual(rows['bases']['Temp'], (37.0, 0.2))
        self.assertEqual(rows['hours'], list(range(25, 31)))
        self.assertAlmostEqual(rows['z'][0][1], (40.0 - 37.0) / 0.2)


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class ExclusionTests(unittest.TestCase):
    def test_a_stay_of_24_hours_or_less(self):
        self.assertEqual(dataset.patient_rows(*patient(range(1, 25)), FLOORS)[0], 'stayAtMost24Hours')

    def test_a_label_in_the_first_24_hours(self):
        hours = range(1, 40)
        labels = [1 if hour == 20 else 0 for hour in hours]
        self.assertEqual(dataset.patient_rows(*patient(hours, labels=labels), FLOORS)[0], 'labelInFirst24Hours')

    def test_too_few_early_values(self):
        hours = list(range(1, 40))
        few_dbp = [70.0 if hour in (3, 30) else None for hour in hours]  # one early value; vitals need 3
        status, details = dataset.patient_rows(*patient(hours, {'DBP': few_dbp}), FLOORS)
        self.assertEqual((status, details['variables']), ('tooFewBaselineValues', ['DBP']))
        one_glucose = [120.0 if hour in (5, 30) else None for hour in hours]  # glucose needs 2
        status, details = dataset.patient_rows(*patient(hours, {'Glucose': one_glucose}), FLOORS)
        self.assertEqual(details['variables'], ['Glucose'])
        two_glucose = [120.0 if hour in (5, 6, 30) else None for hour in hours]
        self.assertEqual(dataset.patient_rows(*patient(hours, {'Glucose': two_glucose}), FLOORS)[0], 'kept')

    def test_no_later_hour_with_all_five(self):
        hours = list(range(1, 40))
        early_only = [70.0 if hour <= 10 else None for hour in hours]  # DBP stops at hour 10: too old after 24
        self.assertEqual(dataset.patient_rows(*patient(hours, {'DBP': early_only}), FLOORS)[0], 'noHourWithAllFive')


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class CarryForwardTests(unittest.TestCase):
    def test_vital_signs_carry_for_4_hours_and_glucose_for_24(self):
        hours = list(range(1, 51))
        hr = [80.0 if hour <= 26 or hour >= 40 else None for hour in hours]  # gap 27..39
        status, rows = dataset.patient_rows(*patient(hours, {'HR': hr}), FLOORS)
        self.assertEqual(status, 'kept')
        kept = set(rows['hours'])
        self.assertTrue({27, 28, 29, 30} <= kept)  # 1 to 4 hours after the last value
        self.assertFalse({31, 35, 39} & kept)  # more than 4 hours: no row
        self.assertIn(40, kept)
        glucose = [120.0 if hour in (2, 20) else None for hour in hours]
        status, rows = dataset.patient_rows(*patient(hours, {'Glucose': glucose}), FLOORS)
        self.assertEqual(max(rows['hours']), 44)  # 24 hours after hour 20

    def test_a_row_never_uses_a_later_value(self):
        hours = list(range(1, 41))
        base = patient(hours)
        changed = patient(hours, {'Temp': base[1]['Temp'][:35] + [41.0] * 5})
        _, before = dataset.patient_rows(*base, FLOORS)
        _, after = dataset.patient_rows(*changed, FLOORS)
        until = before['hours'].index(35)
        self.assertEqual(before['z'][:until], after['z'][:until])


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class SplitTests(unittest.TestCase):
    def test_patients_never_share_a_split_and_the_shares_hold(self):
        patients = np.array([f'p{index:06d}' for index in range(100) for _ in range(3)])
        assignment = dataset.split_hospital_a(patients)
        self.assertEqual(len(assignment), 100)
        self.assertEqual(sum(1 for split in assignment.values() if split == 'validation'), 20)
        self.assertEqual(assignment, dataset.split_hospital_a(patients))

    def test_reading_a_patient_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'p000001.psv'
            path.write_text('HR|Temp|SBP|DBP|Glucose|Age|ICULOS|SepsisLabel\n'
                            '80|NaN|120|70|NaN|60|2|0\n'
                            '81|37.1|121|71|130|60|1|0\n', encoding='ascii')
            hours, values, labels = dataset.read_patient(path)
        self.assertEqual(hours, [1, 2])  # sorted by ICU hour
        self.assertEqual(values['Temp'], [37.1, None])
        self.assertEqual(labels, [0, 0])

    def test_units_must_match_the_app(self):
        good = {'units': {'HR': 'Heart rate (beats per minute)', 'Temp': 'Temperature (Deg C)', 'SBP': 'Systolic BP (mm Hg)',
                          'DBP': 'Diastolic BP (mm Hg)', 'Glucose': 'Serum glucose (mg/dL)'}}
        self.assertTrue(all(check['same'] for check in dataset.unit_check(good)))
        bad = json.loads(json.dumps(good))
        bad['units']['Temp'] = 'Temperature (Deg F)'
        self.assertFalse(all(check['same'] for check in dataset.unit_check(bad)))


if __name__ == '__main__':
    unittest.main()
