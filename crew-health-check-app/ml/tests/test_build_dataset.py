"""Tests for ml/build_dataset.py (ARCHITECTURE.md section 26.4, decision D22).

Run: python -m unittest discover -s ml/tests
"""

import csv
import gzip
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR))

import build_dataset  # noqa: E402

OBSERVED = 'SAT: PROTONS >10 MeV'
OBSERVED_2 = 'SAT: PROTONS >100 MeV'
MODEL = 'MODEL: Forecast:SAT/PROTONS >10 MeV'
UNLISTED = 'ODD: THING'
NO_SOURCE = 'CLAIMED: PROTONS'

TABLE = {
    'schemaVersion': 1,
    'sources': {'doc': {'title': 'Instrument page', 'publisher': 'Agency', 'url': 'https://example.org/instrument'}},
    'instruments': [
        {'displayName': OBSERVED, 'class': 'observed', 'basis': 'documented', 'sourceIds': ['doc']},
        {'displayName': OBSERVED_2, 'class': 'observed', 'basis': 'documented', 'sourceIds': ['doc']},
        {'displayName': NO_SOURCE, 'class': 'observed', 'basis': 'claimed without a source', 'sourceIds': []},
        {'displayName': 'BAD SOURCE: PROTONS', 'class': 'observed', 'basis': 'source id not in the table', 'sourceIds': ['missing']},
    ],
}


def flr(day):
    return f'2024-01-{day:02d}T00:00:00-FLR-001'


def cme(day):
    return f'2024-01-{day:02d}T01:00:00-CME-001'


def sep(day):
    return f'2024-01-{day:02d}T02:00:00-SEP-001'


def ips(day):
    return f'2024-01-{day:02d}T03:00:00-IPS-001'


def links(*ids):
    return [{'activityID': identifier} for identifier in ids] or None


def flare(day, linked=(), **changes):
    record = {
        'flrID': flr(day),
        'beginTime': f'2024-01-{day:02d}T00:00Z',
        'peakTime': f'2024-01-{day:02d}T00:10Z',
        'endTime': f'2024-01-{day:02d}T00:30Z',
        'classType': 'M5.0',
        'sourceLocation': 'S10W30',
        'activeRegionNum': 13000 + day,
        'catalog': 'M2M_CATALOG',
        'link': f'https://example.org/FLR/{day}',
        'linkedEvents': links(*linked),
        'versionId': 1,
        'submissionTime': '2024-02-01T00:00Z',
    }
    record.update(changes)
    return record


def ejection(day, linked=(), analyses=None):
    return {
        'activityID': cme(day),
        'startTime': f'2024-01-{day:02d}T01:00Z',
        'catalog': 'M2M_CATALOG',
        'linkedEvents': links(*linked),
        'cmeAnalyses': [{'isMostAccurate': True, 'speed': 800.0, 'halfAngle': 30.0}] if analyses is None else analyses,
    }


def particle(day, names, linked=()):
    return {
        'sepID': sep(day),
        'eventTime': f'2024-01-{day:02d}T02:00Z',
        'instruments': [{'displayName': name} for name in names],
        'linkedEvents': links(*linked),
        'link': f'https://example.org/SEP/{day}',
    }


def write_raw(folder, flares, cmes, seps):
    for kind, records in (('FLR', flares), ('CME', cmes), ('SEP', seps)):
        (folder / kind).mkdir(parents=True)
        with gzip.open(folder / kind / '2024.json.gz', 'wt', encoding='utf-8') as handle:
            json.dump(records, handle)
    meta = {'source': 'NASA CCMC DONKI', 'apiBase': 'https://example.org/api/', 'files': {'SEP/2024.json.gz': {'retrievedAt': '2024-12-01T00:00:00Z'}}}
    (folder / 'meta.json').write_text(json.dumps(meta), encoding='utf-8')
    (folder / 'classes.json').write_text(json.dumps(TABLE), encoding='utf-8')


def digests(folder):
    return {str(path.relative_to(folder)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(folder.rglob('*')) if path.is_file()}


def table():
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'classes.json'
        path.write_text(json.dumps(TABLE), encoding='utf-8')
        return build_dataset.load_instrument_table(path)


class InstrumentClassTests(unittest.TestCase):
    def setUp(self):
        self.table = table()

    def test_a_model_prefix_is_model_even_with_an_instrument_in_the_name(self):
        self.assertEqual(build_dataset.instrument_class(MODEL, self.table), 'model')
        self.assertEqual(build_dataset.instrument_class('model: lower case prefix', self.table), 'model')

    def test_a_documented_name_is_observed(self):
        self.assertEqual(build_dataset.instrument_class(OBSERVED, self.table), 'observed')

    def test_a_name_missing_from_the_table_is_unknown_never_observed(self):
        self.assertEqual(build_dataset.instrument_class(UNLISTED, self.table), 'unknown')
        self.assertEqual(build_dataset.instrument_class('', self.table), 'unknown')
        self.assertEqual(build_dataset.instrument_class(None, self.table), 'unknown')

    def test_observed_without_a_recorded_source_is_unknown(self):
        self.assertEqual(build_dataset.instrument_class(NO_SOURCE, self.table), 'unknown')
        self.assertEqual(build_dataset.instrument_class('BAD SOURCE: PROTONS', self.table), 'unknown')

    def test_one_record_of_each_class(self):
        def record_class(names):
            return build_dataset.sep_record_class({'instruments': [{'displayName': name} for name in names]}, self.table)[0]

        self.assertEqual(record_class([OBSERVED]), 'observedOnly')
        self.assertEqual(record_class([OBSERVED, OBSERVED_2]), 'observedOnly')
        self.assertEqual(record_class([OBSERVED, MODEL]), 'mixed')
        self.assertEqual(record_class([OBSERVED, UNLISTED]), 'mixed')
        self.assertEqual(record_class([MODEL]), 'modelOnly')
        self.assertEqual(record_class([UNLISTED]), 'unknown')
        self.assertEqual(record_class([MODEL, UNLISTED]), 'unknown')
        self.assertEqual(record_class([]), 'unknown')
        self.assertEqual(build_dataset.sep_record_class({'instruments': None}, self.table)[0], 'unknown')

    def test_a_mixed_record_keeps_its_other_names(self):
        record_class, pairs = build_dataset.sep_record_class(
            {'instruments': [{'displayName': OBSERVED}, {'displayName': MODEL}, {'displayName': UNLISTED}]}, self.table
        )
        self.assertEqual(record_class, 'mixed')
        self.assertEqual(pairs, [(OBSERVED, 'observed'), (MODEL, 'model'), (UNLISTED, 'unknown')])


class RealInstrumentTableTests(unittest.TestCase):
    def setUp(self):
        self.table = build_dataset.load_instrument_table(build_dataset.CLASSES_PATH)

    def test_every_observed_entry_has_a_recorded_source(self):
        observed = [entry for entry in self.table['instruments'] if entry['class'] == 'observed']
        self.assertTrue(observed)
        for entry in observed:
            self.assertTrue(entry['sourceIds'], entry['displayName'])
            self.assertTrue(entry['basis'].strip() and entry['recordContext'].strip(), entry['displayName'])
            for source in entry['sourceIds']:
                self.assertTrue(self.table['sources'][source]['url'].startswith('https://'), source)
                self.assertTrue(self.table['sources'][source]['title'].strip(), source)
            self.assertEqual(build_dataset.instrument_class(entry['displayName'], self.table), 'observed')

    def test_model_names_are_never_entered_as_observed(self):
        for entry in self.table['instruments']:
            if entry['displayName'].upper().startswith('MODEL:'):
                self.assertEqual(entry['class'], 'model', entry['displayName'])

    def test_classes_are_one_of_three(self):
        self.assertTrue(all(entry['class'] in ('observed', 'model', 'unknown') for entry in self.table['instruments']))


class LabelRuleTests(unittest.TestCase):
    """A tiny hand-made link graph: which flare is positive, ambiguous or negative."""

    @classmethod
    def setUpClass(cls):
        flares = [
            flare(1, [sep(1)]),  # direct link to an observed record
            flare(2, [cme(2)]),  # through one CME to an observed record
            flare(3, [sep(3), sep(4)]),  # observed plus an extra model-only record
            flare(4, [sep(5)]),  # model-only record
            flare(5, [cme(6)]),  # through one CME to an unknown record
            flare(6),  # no link at all
            flare(7, [flr(1)]),  # only through another flare
            flare(8, [cme(8)]),  # flare -> CME -> shock -> SEP
            flare(9),  # the SEP lists this flare; the flare lists nothing
            flare(10, [sep(10)]),  # mixed record: measured plus unknown
            flare(11, [sep(11)], classType='C5.0'),
            flare(12, [sep(12)], sourceLocation='somewhere'),
            flare(13, [sep(13)], peakTime='2024-01-12T23:50Z'),
            flare(14, [sep(1)], endTime='2024-01-14T00:05Z'),  # end before peak
            flare(15, [sep(1)], endTime=None),
        ]
        cmes = [
            ejection(2, [flr(2), sep(2)]),
            ejection(6, [sep(6)]),
            ejection(8, [ips(8)]),
        ]
        seps = [
            particle(1, [OBSERVED]),
            particle(2, [OBSERVED]),
            particle(3, [OBSERVED_2]),
            particle(4, [MODEL]),
            particle(5, [MODEL]),
            particle(6, [UNLISTED]),
            particle(8, [OBSERVED], [ips(8)]),
            particle(9, [OBSERVED], [flr(9)]),
            particle(10, [OBSERVED, UNLISTED]),
            particle(11, [OBSERVED]),
            particle(12, [OBSERVED]),
            particle(13, [OBSERVED]),
            particle(20, []),  # no instrument listed, linked to nothing
        ]
        cls.folder = tempfile.TemporaryDirectory()
        cls.raw = Path(cls.folder.name) / 'raw'
        write_raw(cls.raw, flares, cmes, seps)
        cls.before = digests(cls.raw)
        cls.rows, cls.summary = build_dataset.build(cls.raw, cls.raw / 'classes.json')
        cls.out = Path(cls.folder.name) / 'out'
        build_dataset.write_outputs(cls.rows, cls.summary, cls.out)
        cls.by_id = {row['flrID']: row for row in cls.rows}

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def status(self, day):
        return self.by_id[flr(day)]['labelStatus']

    def test_a_direct_link_to_an_observed_record_is_positive(self):
        self.assertEqual(self.status(1), 'positive')
        self.assertEqual(self.by_id[flr(1)]['label'], 1)
        self.assertIn('direct', self.by_id[flr(1)]['sepAssociations'])

    def test_a_link_through_one_cme_to_an_observed_record_is_positive(self):
        self.assertEqual(self.status(2), 'positive')
        self.assertIn(f'via {cme(2)}', self.by_id[flr(2)]['sepAssociations'])

    def test_an_extra_model_record_does_not_disqualify_an_observed_positive(self):
        self.assertEqual(self.status(3), 'positive')
        self.assertIn('modelOnly', self.by_id[flr(3)]['sepAssociations'])
        self.assertEqual(self.summary['flares']['positivesThatAlsoReachModelOrUnknownRecords'], 1)

    def test_only_model_or_unknown_evidence_is_ambiguous_never_negative(self):
        self.assertEqual(self.status(4), 'ambiguous')
        self.assertEqual(self.status(5), 'ambiguous')
        self.assertIsNone(self.by_id[flr(4)]['label'])
        self.assertEqual(self.summary['flares']['labels']['ambiguous'], 2)
        self.assertEqual(self.summary['flares']['ambiguousByEvidence'], {'modelOnly': 1, 'unknown': 1})

    def test_no_qualifying_link_is_negative(self):
        self.assertEqual(self.status(6), 'negative')
        self.assertEqual(self.by_id[flr(6)]['label'], 0)

    def test_paths_through_other_flares_or_shocks_do_not_count(self):
        self.assertEqual(self.status(7), 'negative')
        self.assertEqual(self.status(8), 'negative')

    def test_a_link_listed_on_one_side_only_still_counts(self):
        self.assertEqual(self.status(9), 'positive')

    def test_a_mixed_record_supports_a_positive_and_reports_its_unknown_part(self):
        self.assertEqual(self.status(10), 'positive')
        self.assertEqual(self.by_id[flr(10)]['mixedOtherNames'], f'{sep(10)}|{UNLISTED}|unknown')
        self.assertEqual(self.summary['mixedRecordOtherNames'], [{'displayName': UNLISTED, 'class': 'unknown', 'records': 1}])

    def test_filtered_flares_are_dropped_and_counted_by_reason(self):
        for day in (11, 12, 13):
            self.assertNotIn(flr(day), self.by_id)
        self.assertEqual(
            self.summary['flares']['dropped'],
            {
                'class cannot be read': 0,
                'class below M1.0': 1,
                'begin or peak time missing': 0,
                'peak time before begin time': 1,
                'source location cannot be read': 1,
            },
        )
        self.assertEqual(self.summary['flares']['eligible'], 12)

    def test_an_end_time_before_the_peak_counts_as_missing(self):
        for day in (14, 15):
            self.assertIsNone(self.by_id[flr(day)]['durationMin'])
            self.assertIsNone(self.by_id[flr(day)]['log1p_duration_min'])
        self.assertEqual(self.summary['flares']['withoutUsableEndTime'], 2)
        self.assertEqual(self.summary['flares']['endTimeBeforePeakTreatedAsMissing'], 1)

    def test_record_classes_are_counted(self):
        self.assertEqual(
            self.summary['sepRecordClasses']['total'], {'observedOnly': 8, 'mixed': 1, 'modelOnly': 2, 'unknown': 2}
        )

    def test_counts_by_year_and_by_split_add_up_to_the_totals(self):
        classes = self.summary['sepRecordClasses']
        labels = self.summary['flares']
        for name in build_dataset.RECORD_CLASSES:
            self.assertEqual(sum(year[name] for year in classes['byYear'].values()), classes['total'][name])
            self.assertEqual(sum(split[name] for split in classes['bySplit'].values()), classes['total'][name])
        for name in build_dataset.LABEL_STATUSES:
            self.assertEqual(sum(year[name] for year in labels['labelsByYear'].values()), labels['labels'][name])
            self.assertEqual(sum(split[name] for split in labels['labelsBySplit'].values()), labels['labels'][name])
        self.assertEqual(sum(labels['labels'][name] for name in build_dataset.LABEL_STATUSES), labels['eligible'])
        self.assertEqual(labels['labels']['scored'], labels['labels']['positive'] + labels['labels']['negative'])

    def test_the_raw_files_stay_byte_identical(self):
        self.assertEqual(digests(self.raw), self.before)

    def test_two_builds_give_identical_files(self):
        second = Path(self.folder.name) / 'again'
        rows, summary = build_dataset.build(self.raw, self.raw / 'classes.json')
        build_dataset.write_outputs(rows, summary, second)
        self.assertEqual(digests(second), digests(self.out))

    def test_the_csv_has_one_row_per_eligible_flare_and_empty_labels_for_ambiguous_ones(self):
        with (self.out / 'flares.csv').open(encoding='utf-8', newline='') as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual([row['flrID'] for row in rows], sorted(self.by_id))
        self.assertEqual(tuple(rows[0]), build_dataset.CSV_COLUMNS)
        self.assertEqual({row['label'] for row in rows if row['labelStatus'] == 'ambiguous'}, {''})
        self.assertEqual({row['split'] for row in rows}, {'test'})


class CmeChoiceTests(unittest.TestCase):
    def choose(self, cmes):
        by_id = {record['activityID']: record for record in cmes}
        graph = build_dataset.build_links({flr(1): flare(1, list(by_id))}, by_id, {})
        return build_dataset.choose_cme(flr(1), graph, by_id)

    def test_no_linked_cme_gives_none(self):
        self.assertIsNone(self.choose([]))

    def test_the_marked_analysis_is_used_not_a_faster_unmarked_one(self):
        analyses = [{'isMostAccurate': False, 'speed': 2000.0, 'halfAngle': 60.0}, {'isMostAccurate': True, 'speed': 700.0, 'halfAngle': 25.0}]
        self.assertEqual(self.choose([ejection(1, analyses=analyses)]), {'cmeId': cme(1), 'speedKms': 700.0, 'halfAngleDeg': 25.0})

    def test_the_first_analysis_is_used_when_none_is_marked(self):
        analyses = [{'isMostAccurate': False, 'speed': 500.0, 'halfAngle': 20.0}, {'isMostAccurate': False, 'speed': 900.0, 'halfAngle': 40.0}]
        self.assertEqual(self.choose([ejection(1, analyses=analyses)])['speedKms'], 500.0)

    def test_the_fastest_of_several_linked_cmes_wins(self):
        slow = ejection(1, analyses=[{'isMostAccurate': True, 'speed': 400.0, 'halfAngle': 10.0}])
        fast = ejection(2, analyses=[{'isMostAccurate': True, 'speed': 1500.0, 'halfAngle': 50.0}])
        self.assertEqual(self.choose([slow, fast]), {'cmeId': cme(2), 'speedKms': 1500.0, 'halfAngleDeg': 50.0})

    def test_an_analysis_without_a_speed_cannot_be_used(self):
        self.assertIsNone(self.choose([ejection(1, analyses=[{'isMostAccurate': True, 'speed': None, 'halfAngle': 10.0}])]))
        self.assertIsNone(self.choose([ejection(1, analyses=[])]))


class SplitTests(unittest.TestCase):
    def test_planned_boundaries(self):
        self.assertEqual([build_dataset.split_of(year, 2020, 2022) for year in (2010, 2020, 2021, 2022, 2023, 2026)], ['train', 'train', 'validation', 'validation', 'test', 'test'])

    def test_enough_positives_everywhere_moves_nothing(self):
        positives = {2015: 10, 2021: 10, 2024: 10}
        self.assertEqual(build_dataset.settle_boundaries(positives, 2010, 2026), (2020, 2022, [], True))

    def test_a_short_training_split_takes_the_next_year(self):
        positives = {2015: 4, 2021: 6, 2022: 12, 2024: 30}
        train_end, validation_end, changes, enough = build_dataset.settle_boundaries(positives, 2010, 2026)
        self.assertEqual((train_end, validation_end, enough), (2021, 2022, True))
        self.assertEqual(changes[0]['reason'], 'train had 4 positives, fewer than 10')

    def test_a_short_validation_split_takes_the_first_test_year(self):
        positives = {2015: 50, 2021: 3, 2022: 4, 2023: 8, 2024: 30}
        train_end, validation_end, changes, enough = build_dataset.settle_boundaries(positives, 2010, 2026)
        self.assertEqual((train_end, validation_end, enough), (2020, 2023, True))
        self.assertEqual([change['boundary'] for change in changes], ['validation/test'])

    def test_a_short_test_split_takes_the_last_validation_year(self):
        positives = {2015: 50, 2021: 20, 2022: 20, 2024: 3}
        self.assertEqual(build_dataset.settle_boundaries(positives, 2010, 2026)[:2], (2020, 2021))

    def test_when_nothing_helps_it_stops_and_says_so(self):
        train_end, validation_end, _changes, enough = build_dataset.settle_boundaries({2015: 1, 2021: 1, 2024: 1}, 2010, 2026)
        self.assertFalse(enough)
        self.assertLess(train_end, validation_end)
        self.assertLess(validation_end, 2026)


class CommittedDatasetTests(unittest.TestCase):
    """The processed files in the repository are exactly what the script writes from the raw files."""

    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.rows, cls.summary = build_dataset.build()
        build_dataset.write_outputs(cls.rows, cls.summary, Path(cls.folder.name))

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def test_the_committed_files_match_a_fresh_build(self):
        for name in ('flares.csv', 'dataset_summary.json'):
            fresh = (Path(self.folder.name) / name).read_bytes()
            committed = (build_dataset.OUT_DIR / name).read_bytes().replace(b'\r\n', b'\n')
            self.assertEqual(hashlib.sha256(fresh).hexdigest(), hashlib.sha256(committed).hexdigest(), name)

    def test_no_flare_is_negative_while_linked_to_a_particle_record(self):
        for row in self.rows:
            if row['labelStatus'] == 'negative':
                self.assertEqual(row['sepAssociations'], '')
            else:
                self.assertNotEqual(row['sepAssociations'], '')

    def test_every_split_is_reported_with_its_exclusions(self):
        by_split = self.summary['flares']['labelsBySplit']
        self.assertEqual(set(by_split), {'train', 'validation', 'test'})
        self.assertEqual(sum(split['ambiguous'] for split in by_split.values()), self.summary['flares']['labels']['ambiguous'])


if __name__ == '__main__':
    unittest.main()
