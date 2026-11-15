"""Tests for ml/fetch_physionet_sepsis.py (ARCHITECTURE.md section 26.19): offline, synthetic files only.

Standard library only:
    python -m unittest discover -s ml/tests
"""

import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR))

import fetch_physionet_sepsis as fetch  # noqa: E402

PAGE = """<html><body>
<p>Version: 1.0.0</p>
<dl><dt>License</dt> <dd><a href="/x">Creative Commons Attribution 4.0 International Public License</a></dd></dl>
<table>
<tr> <td>HR</td> <td>Heart rate (beats per minute)</td> </tr>
<tr> <td>Temp</td> <td>Temperature (Deg C)</td> </tr>
<tr> <td>SBP</td> <td>Systolic BP (mm Hg)</td> </tr>
<tr> <td>DBP</td> <td>Diastolic BP (mm Hg)</td> </tr>
<tr> <td>Glucose</td> <td>Serum glucose (mg/dL)</td> </tr>
<tr> <td>ICULOS</td> <td>ICU length-of-stay (hours since ICU admit)</td> </tr>
<tr> <td>SepsisLabel</td> <td>1 from 6 hours before onset</td> </tr>
</table>
<p class="citation-text">Reyna, M. (2019). Early Prediction of Sepsis. PhysioNet</p>
<a href="https://doi.org/10.13026/v64v-d857">doi</a>
</body></html>"""


class PageTests(unittest.TestCase):
    def test_the_page_gives_version_licence_units_citations_and_doi(self):
        facts = fetch.parse_page(PAGE)
        self.assertEqual(facts['version'], '1.0.0')
        self.assertEqual(facts['license'], 'Creative Commons Attribution 4.0 International Public License')
        self.assertEqual(facts['units']['HR'], 'Heart rate (beats per minute)')
        self.assertEqual(facts['units']['Glucose'], 'Serum glucose (mg/dL)')
        self.assertEqual(facts['citations'], ['Reyna, M. (2019). Early Prediction of Sepsis. PhysioNet'])
        self.assertEqual(facts['datasetDoi'], 'https://doi.org/10.13026/v64v-d857')

    def test_a_missing_variable_is_none_not_a_guess(self):
        facts = fetch.parse_page(PAGE.replace('<td>Glucose</td>', '<td>Other</td>'))
        self.assertIsNone(facts['units']['Glucose'])


class FingerprintTests(unittest.TestCase):
    def test_the_fingerprint_changes_when_one_byte_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'training_setA').mkdir()
            for name, body in (('p000001.psv', b'HR|ICULOS\n80|1\n'), ('p000002.psv', b'HR|ICULOS\n90|1\n')):
                (root / 'training_setA' / name).write_bytes(body)
            names = ['p000001.psv', 'p000002.psv', 'p000003.psv']
            present, total, first = fetch.set_fingerprint('training_setA', names, root)
            self.assertEqual((present, total), (2, 30))  # two files of 15 bytes
            expected = hashlib.sha256('\n'.join(
                f'{name} {hashlib.md5((root / "training_setA" / name).read_bytes()).hexdigest()}' for name in names[:2]
            ).encode('ascii')).hexdigest()
            self.assertEqual(first, expected)
            (root / 'training_setA' / 'p000002.psv').write_bytes(b'HR|ICULOS\n91|1\n')
            self.assertNotEqual(fetch.set_fingerprint('training_setA', names, root)[2], first)


if __name__ == '__main__':
    unittest.main()
