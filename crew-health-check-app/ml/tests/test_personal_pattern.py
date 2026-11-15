"""Tests for ml/personal_pattern.py (ARCHITECTURE.md section 26.18).

They need the packages in ml/requirements.txt, so run them inside the virtual environment:
    python -m unittest discover -s ml/tests
"""

import importlib.util
import sys
import unittest
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR))

HAVE_PACKAGES = all(importlib.util.find_spec(name) for name in ('numpy', 'sklearn'))
NEEDS = 'needs numpy and scikit-learn: activate .venv first (see ml/README.md)'

if HAVE_PACKAGES:
    import numpy as np

    import personal_pattern as pattern


def ledoit_wolf_by_hand(rows):
    """The Ledoit-Wolf formula with assume_centered=True, written out independently of scikit-learn.

    The app's TypeScript port follows these lines, so this checks that the formula is understood.
    """
    n, p = rows.shape
    squares = rows ** 2
    trace_terms = squares.sum(axis=0) / n
    mu = trace_terms.sum() / p
    beta_sum = (squares.T @ squares).sum()
    delta_sum = ((rows.T @ rows) ** 2).sum() / n ** 2
    beta = (beta_sum / n - delta_sum) / (p * n)
    delta = (delta_sum - 2 * mu * trace_terms.sum() + p * mu ** 2) / p
    beta = min(beta, delta)
    shrinkage = 0.0 if beta == 0 else beta / delta
    empirical = rows.T @ rows / n
    shrunk = (1 - shrinkage) * empirical
    shrunk[np.diag_indices(p)] += shrinkage * np.trace(empirical) / p
    return shrunk, shrinkage


def full_history(days, value=10.0):
    """Every model indicator on every day 1..days, with a little day-to-day variation."""
    return {
        indicator: {day: value + (day * (index + 3)) % 7 for day in range(1, days + 1)}
        for index, indicator in enumerate(pattern.INDICATORS)
    }


SPREADS = {indicator: 0.5 for indicator in pattern.INDICATORS}


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class BaselineTests(unittest.TestCase):
    """The same baseline as src/engine/baseline.ts (section 10)."""

    def test_median_of_odd_and_even_lists(self):
        self.assertEqual(pattern.median([3, 1, 2]), 2)
        self.assertEqual(pattern.median([4, 1, 3, 2]), 2.5)

    def test_window_runs_from_today_minus_30_to_today_minus_3(self):
        self.assertEqual(pattern.baseline_window(40), (10, 37))

    def test_days_outside_the_window_are_left_out(self):
        by_day = {day: 5.0 for day in range(10, 38)}
        by_day[9] = 1000.0  # one day too early
        by_day[38] = 1000.0  # inside the three recent days
        self.assertEqual(pattern.baseline(by_day, 0.1, 40), (5.0, 0.1))

    def test_spread_is_scaled_mad_with_its_floor(self):
        by_day = {day: float(day % 2) for day in range(10, 38)}
        center, spread = pattern.baseline(by_day, 0.1, 40)
        self.assertEqual(center, 0.5)
        self.assertAlmostEqual(spread, 1.4826 * 0.5)
        self.assertEqual(pattern.baseline(by_day, 2.0, 40)[1], 2.0)

    def test_fewer_than_seven_days_is_not_ready(self):
        self.assertIsNone(pattern.baseline({day: 1.0 for day in range(30, 36)}, 0.1, 40))
        self.assertIsNotNone(pattern.baseline({day: 1.0 for day in range(30, 37)}, 0.1, 40))


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class MatrixTests(unittest.TestCase):
    def setUp(self):
        generator = np.random.default_rng(7)
        self.rows = generator.normal(size=(20, 5))
        self.z = [1.5, -0.5, 2.0, 0.0, -1.0]

    def test_scikit_learn_matches_the_formula_the_app_ports(self):
        matrix, shrinkage = pattern.shrunk_second_moment(self.rows)
        expected, expected_shrinkage = ledoit_wolf_by_hand(self.rows)
        np.testing.assert_allclose(matrix, expected, rtol=0, atol=1e-12)
        self.assertAlmostEqual(shrinkage, expected_shrinkage, places=12)

    def test_cholesky_matches_numpy_and_refuses_what_is_not_positive_definite(self):
        matrix, _ = pattern.shrunk_second_moment(self.rows)
        np.testing.assert_allclose(pattern.cholesky(matrix), np.linalg.cholesky(matrix), rtol=0, atol=1e-12)
        self.assertIsNone(pattern.cholesky(np.array([[1.0, 2.0], [2.0, 1.0]])))
        self.assertIsNone(pattern.cholesky(np.zeros((3, 3))))

    def test_contributions_add_up_to_the_distance(self):
        matrix, _ = pattern.shrunk_second_moment(self.rows)
        distance, contributions = pattern.squared_distance(matrix, self.z)
        self.assertAlmostEqual(sum(contributions), distance, places=12)
        self.assertAlmostEqual(distance, float(np.array(self.z) @ np.linalg.solve(matrix, self.z)), places=10)

    def test_leave_one_out_fits_without_the_day_it_scores(self):
        loo = pattern.leave_one_out(self.rows)
        matrix, _ = pattern.shrunk_second_moment(np.delete(self.rows, 3, axis=0))
        self.assertAlmostEqual(loo[3], pattern.squared_distance(matrix, list(self.rows[3]))[0], places=12)
        self.assertEqual(len(loo), len(self.rows))

    def test_notable_only_above_every_baseline_day(self):
        result = pattern.score_today(self.rows, self.z)
        self.assertEqual(result['notable'], result['squaredDistance'] > result['maxLoo'])
        self.assertAlmostEqual(result['score'], result['squaredDistance'] / result['maxLoo'])
        far = pattern.score_today(self.rows, [9.0] * 5)
        self.assertTrue(far['notable'])
        self.assertGreater(far['score'], 1)
        near = pattern.score_today(self.rows, [0.0] * 5)
        self.assertFalse(near['notable'])

    def test_constant_readings_give_no_score_instead_of_an_error(self):
        self.assertIsNone(pattern.score_today(np.zeros((20, 4)), [1.0, 0.0, 0.0, 0.0]))


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class FactorTests(unittest.TestCase):
    def test_at_most_three_positive_contributions_largest_first(self):
        indicators = ['a', 'b', 'c', 'd', 'e']
        factors = pattern.top_factors(indicators, [1, -2, 3, 1, 1], [0.5, 4.0, -1.0, 2.0, 0.5])
        self.assertEqual([factor['indicator'] for factor in factors], ['b', 'd', 'a'])
        self.assertEqual(factors[0]['z'], -2)

    def test_negative_and_zero_contributions_are_never_factors(self):
        factors = pattern.top_factors(['a', 'b', 'c'], [1, 1, 0], [3.0, -1.0, 0.0])
        self.assertEqual([factor['indicator'] for factor in factors], ['a'])


@unittest.skipUnless(HAVE_PACKAGES, NEEDS)
class AssessTests(unittest.TestCase):
    def test_fewer_than_four_readings_today_give_no_score(self):
        daily = full_history(60)
        for indicator in pattern.INDICATORS[3:]:
            del daily[indicator][60]
        assessed = pattern.assess(daily, 60, SPREADS)
        self.assertNotIn('result', assessed)
        self.assertEqual(assessed['readiness']['indicatorsToday'], 3)
        # Before the check-in, readiness counts the window days with at least four readings.
        self.assertEqual(assessed['readiness']['daysAvailable'], 28)
        self.assertTrue(assessed['readiness']['ready'])

    def test_four_readings_today_are_enough(self):
        daily = full_history(60)
        for indicator in pattern.INDICATORS[4:]:
            del daily[indicator][60]
        assessed = pattern.assess(daily, 60, SPREADS)
        self.assertEqual(assessed['indicators'], list(pattern.INDICATORS[:4]))
        self.assertIsNotNone(assessed['result'])

    def test_complete_days_need_every_reading_of_today(self):
        daily = full_history(60)
        for day in range(30, 45):  # 15 window days without mood
            del daily['mood'][day]
        with_mood = pattern.assess(daily, 60, SPREADS)
        self.assertEqual(with_mood['readiness']['daysAvailable'], 13)
        self.assertFalse(with_mood['readiness']['ready'])
        self.assertNotIn('result', with_mood)
        del daily['mood'][60]
        without_mood = pattern.assess(daily, 60, SPREADS)
        self.assertEqual(without_mood['readiness']['daysAvailable'], 28)
        self.assertIsNotNone(without_mood['result'])

    def test_early_mission_is_not_ready(self):
        assessed = pattern.assess(full_history(10), 10, SPREADS)
        self.assertEqual(assessed['readiness'], {
            'ready': False, 'daysAvailable': 7, 'daysNeeded': 14, 'indicatorsToday': 8, 'indicatorsNeeded': 4,
        })

    def test_z_scores_use_the_baseline_of_each_indicator(self):
        daily = full_history(60)
        assessed = pattern.assess(daily, 60, SPREADS)
        for index, indicator in enumerate(assessed['indicators']):
            center, spread = pattern.baseline(daily[indicator], SPREADS[indicator], 60)
            self.assertEqual(assessed['z'][index], (daily[indicator][60] - center) / spread)


if __name__ == '__main__':
    unittest.main()
