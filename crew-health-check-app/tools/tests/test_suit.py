import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'simulator'))

import generate  # noqa: E402
import suit  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]


def by_site(replay: dict, crew_id: str, site: str) -> dict:
    return {
        sample['offsetMin']: sample
        for sample in replay['samples']
        if sample['crewId'] == crew_id and sample['site'] == site
    }


class SuitReplayTests(unittest.TestCase):
    def setUp(self):
        self.replay = suit.build_replay(42)

    def test_same_seed_gives_the_same_file(self):
        self.assertEqual(generate.to_text(suit.build_replay(42)), generate.to_text(self.replay))
        self.assertNotEqual(generate.to_text(suit.build_replay(7)), generate.to_text(self.replay))

    def test_committed_file_matches_a_fresh_run(self):
        committed = (REPO_ROOT / 'public' / 'seed' / 'suit-replay.json').read_text(encoding='utf-8')
        self.assertEqual(committed, generate.to_text(self.replay))

    def test_two_crew_three_sites_every_five_minutes(self):
        self.assertEqual({s['crewId'] for s in self.replay['samples']}, {'c1', 'c2'})
        expected = list(range(-120, 1441, 5))
        for crew_id in ('c1', 'c2'):
            for site in ('chest', 'upper_back', 'forearm_l'):
                self.assertEqual(sorted(by_site(self.replay, crew_id, site)), expected)

    def test_forearm_has_no_contact_from_minus_30(self):
        for crew_id in ('c1', 'c2'):
            forearm = by_site(self.replay, crew_id, 'forearm_l')
            self.assertTrue(forearm[-35]['contact'])
            for offset, sample in forearm.items():
                if offset >= -30:
                    self.assertFalse(sample['contact'], offset)
                    self.assertIsNone(sample['tempC'])

    def test_upper_back_warms_until_plus_60_then_stays(self):
        back = by_site(self.replay, 'c1', 'upper_back')
        self.assertEqual(back[-120]['tempC'], 33.0)
        self.assertEqual(back[60]['tempC'], 34.5)
        self.assertEqual(back[1440]['tempC'], 34.5)
        values = [back[offset]['tempC'] for offset in range(-120, 61, 5)]
        self.assertEqual(values, sorted(values))

    def test_values_have_one_decimal_and_contact_matches_temperature(self):
        for sample in self.replay['samples']:
            self.assertEqual(sample['contact'], sample['tempC'] is not None)
            if sample['tempC'] is not None:
                self.assertEqual(round(sample['tempC'], 1), sample['tempC'])

    def test_generate_suit_writes_only_the_replay(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(generate.main(['--suit', '--seed', '42', '--out', folder]), 0)
            written = sorted(path.name for path in Path(folder).iterdir())
            self.assertEqual(written, ['suit-replay.json'])
            document = json.loads((Path(folder) / 'suit-replay.json').read_text(encoding='utf-8'))
            self.assertTrue(document['simulated'])
            self.assertEqual(document['label'], 'Simulated skin temperature')


if __name__ == '__main__':
    unittest.main()
