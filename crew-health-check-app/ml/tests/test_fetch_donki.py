"""Tests for the DONKI downloader. Offline only: a scripted fake transport, or a
local HTTP server on 127.0.0.1. Run: py -m unittest discover -s ml/tests"""

import datetime as dt
import gzip
import http.server
import json
import os
import socket
import sys
import tempfile
import threading
import unittest
import urllib.parse
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import fetch_donki  # noqa: E402

SECRET = 'test-secret-key-value-0123456789abcd'  # a fake key; never a real one
CCMC, KAUAI, API_NASA = fetch_donki.SERVICES
FetchError = fetch_donki.FetchError


def sep_records(count, day='2024-05-10'):
    return [{'sepID': f'{day}T00:00:00-SEP-{index:03d}', 'eventTime': f'{day}T00:00Z'} for index in range(count)]


def flr_records(count, day):
    return [{'flrID': f'{day}T01:00:00-FLR-{index:03d}', 'beginTime': f'{day}T01:00Z'} for index in range(count)]


def ok(records=None, raw=None):
    body = raw if raw is not None else json.dumps(records).encode('utf-8')
    return lambda: (200, body, {'X-RateLimit-Remaining': '999'})


def fail(status, body=b'', headers=None):
    def outcome():
        raise fetch_donki.http_failure(status, body, headers or {})

    return outcome


def no_answer():
    def outcome():
        raise FetchError('no answer (TimeoutError: timed out)', transient=True)

    return outcome


API_ERROR_WITH_SECRET = json.dumps(
    {'error': {'code': 'UPSTREAM_ERROR', 'message': f'Failed for https://api.nasa.gov/DONKI/FLR?api_key={SECRET}'}}
).encode('utf-8')


class Transport:
    """Stands in for http_get. `route(host, type, start, end, nth)` picks the outcome."""

    def __init__(self, route):
        self.route = route
        self.urls = []
        self.counts = {}

    def __call__(self, url, timeout):
        self.urls.append(url)
        parts = urllib.parse.urlsplit(url)
        params = urllib.parse.parse_qs(parts.query)
        key = (parts.hostname, parts.path.rsplit('/', 1)[-1], params['startDate'][0], params['endDate'][0])
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.route(*key, self.counts[key])()

    def requests_for(self, record_type):
        return [url for url in self.urls if f'/{record_type}?' in url]


class FakeNetworkTest(unittest.TestCase):
    """Patches the transport and the waits; sets the fake key."""

    def use(self, route):
        transport = Transport(route)
        self.waits = []
        self.logs = []
        for patcher in (
            mock.patch.object(fetch_donki, 'http_get', transport),
            mock.patch.object(fetch_donki, 'sleep', self.waits.append),
            mock.patch.dict(os.environ, {'NASA_API_KEY': SECRET}),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        return transport

    def get(self, service=API_NASA, record_type='SEP', first=dt.date(2024, 5, 1), last=dt.date(2024, 5, 31)):
        return fetch_donki.get_records(service, record_type, first, last, 1.0, self.logs.append)


class ParseRecordsTests(unittest.TestCase):
    def test_a_json_list_of_records_is_accepted(self):
        records, answer = fetch_donki.parse_records(json.dumps(sep_records(2)).encode(), 'SEP')
        self.assertEqual((len(records), answer), (2, 'JSON list'))

    def test_an_empty_list_and_an_empty_body_are_valid_empty_answers_and_told_apart(self):
        self.assertEqual(fetch_donki.parse_records(b'[]', 'SEP'), ([], 'JSON list'))
        self.assertEqual(fetch_donki.parse_records(b'  \n', 'SEP'), ([], 'empty body'))

    def test_an_html_page_is_an_error_not_zero_records(self):
        with self.assertRaises(FetchError) as caught:
            fetch_donki.parse_records(b'<!DOCTYPE html><html><body>Moved</body></html>', 'SEP')
        self.assertIn('an HTML page', str(caught.exception))
        self.assertEqual(caught.exception.status, 200)

    def test_a_json_error_object_is_an_error(self):
        body = b'{"error": {"code": "OVER_RATE_LIMIT", "message": "Try again later"}}'
        with self.assertRaises(FetchError) as caught:
            fetch_donki.parse_records(body, 'SEP')
        self.assertIn('OVER_RATE_LIMIT: Try again later', str(caught.exception))

    def test_items_without_the_type_id_are_refused(self):
        with self.assertRaises(FetchError) as caught:
            fetch_donki.parse_records(json.dumps(flr_records(2, '2024-05-01')).encode(), 'SEP')
        self.assertIn('2 of 2 items have no sepID', str(caught.exception))


class SanitizingTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(os.environ, {'NASA_API_KEY': SECRET})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_api_error_code_and_message_are_shown_without_the_key_or_query(self):
        reason = fetch_donki.describe_body(API_ERROR_WITH_SECRET)
        self.assertEqual(reason, 'UPSTREAM_ERROR: Failed for https://api.nasa.gov/DONKI/FLR')
        self.assertNotIn(SECRET, reason)

    def test_an_html_body_is_described_never_shown(self):
        reason = fetch_donki.describe_body(f'<html><body>{SECRET}</body></html>'.encode())
        self.assertEqual(reason, 'an HTML page')

    def test_scrub_removes_the_key_api_key_parameters_and_query_strings(self):
        text = f'key {SECRET} and api_key=other-value at https://x.test/a?b=c&d=e'
        cleaned = fetch_donki.scrub(text)
        self.assertNotIn(SECRET, cleaned)
        self.assertNotIn('other-value', cleaned)
        self.assertNotIn('b=c', cleaned)

    def test_a_redirect_names_only_host_and_path_and_is_not_followed(self):
        location = f'https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=2010-01-01&api_key={SECRET}'
        error = fetch_donki.http_failure(301, b'', {'Location': location})
        self.assertEqual(str(error), 'HTTP 301: redirect to https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR (not followed)')
        self.assertFalse(error.transient)

    def test_statuses_map_to_the_right_kind_of_failure(self):
        limited = fetch_donki.http_failure(429, b'', {'Retry-After': '30'})
        self.assertIsInstance(limited, fetch_donki.RateLimited)
        self.assertEqual(limited.retry_after, 30.0)
        self.assertIsInstance(fetch_donki.http_failure(403, b'', {}), fetch_donki.AuthFailed)
        self.assertTrue(fetch_donki.http_failure(503, b'', {}).transient)
        self.assertFalse(fetch_donki.http_failure(404, b'', {}).transient)

    def test_the_key_report_never_shows_the_key(self):
        report = fetch_donki.key_report()
        self.assertIn(f'({len(SECRET)} characters)', report)
        self.assertNotIn(SECRET, report)
        with mock.patch.dict(os.environ, {'NASA_API_KEY': ' "ab" '}):
            report = fetch_donki.key_report()
        self.assertIn('quote characters', report)
        self.assertIn('too short', report)
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIn('DEMO_KEY', fetch_donki.key_report())


class _Handler(http.server.BaseHTTPRequestHandler):
    paths: list = []

    def log_message(self, *args):
        pass

    def send(self, status, body, headers=()):
        self.send_response(status)
        for name, value in headers:
            self.send_header(name, value)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        type(self).paths.append(self.path)
        route = self.path.split('?')[0]
        if route == '/ok':
            self.send(200, json.dumps(sep_records(1)).encode(), [('Content-Type', 'application/json')])
        elif route == '/redirect':
            self.send(302, b'', [('Location', f'/ok?api_key={SECRET}')])
        elif route == '/limited':
            body = b'{"error": {"code": "OVER_RATE_LIMIT", "message": "You have exceeded your rate limit."}}'
            self.send(429, body, [('Retry-After', '7')])
        elif route == '/forbidden':
            self.send(403, b'{"error": {"code": "API_KEY_INVALID", "message": "An invalid api_key was supplied."}}')
        else:
            self.send(200, b'<html><body>Not DONKI</body></html>', [('Content-Type', 'text/html')])


class RealHttpTests(unittest.TestCase):
    """The real urllib path, against a server on this machine only."""

    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), _Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_address[1]}'
        # No proxy, whatever the machine's settings.
        cls.opener = mock.patch.object(fetch_donki, '_OPENER', fetch_donki.build_opener(urllib.request.ProxyHandler({})))
        cls.opener.start()

    @classmethod
    def tearDownClass(cls):
        cls.opener.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        _Handler.paths.clear()

    def test_a_valid_answer_comes_back_with_status_and_safe_headers(self):
        status, body, headers = fetch_donki.http_get(f'{self.base}/ok?startDate=x', 5)
        self.assertEqual(status, 200)
        self.assertEqual(fetch_donki.parse_records(body, 'SEP')[1], 'JSON list')
        self.assertEqual(headers, {'Content-Type': 'application/json'})

    def test_a_redirect_is_reported_and_not_followed(self):
        with mock.patch.dict(os.environ, {'NASA_API_KEY': SECRET}):
            with self.assertRaises(FetchError) as caught:
                fetch_donki.http_get(f'{self.base}/redirect', 5)
        self.assertEqual(caught.exception.status, 302)
        self.assertIn('(not followed)', str(caught.exception))
        self.assertNotIn(SECRET, str(caught.exception))
        self.assertEqual(_Handler.paths, ['/redirect'])

    def test_a_rate_limit_shows_status_code_message_and_retry_after(self):
        with self.assertRaises(fetch_donki.RateLimited) as caught:
            fetch_donki.http_get(f'{self.base}/limited', 5)
        self.assertEqual(str(caught.exception), 'HTTP 429: OVER_RATE_LIMIT: You have exceeded your rate limit.')
        self.assertEqual(caught.exception.retry_after, 7.0)

    def test_a_refused_key_stops_with_its_reason(self):
        with self.assertRaises(fetch_donki.AuthFailed) as caught:
            fetch_donki.http_get(f'{self.base}/forbidden', 5)
        self.assertEqual(str(caught.exception), 'HTTP 403: API_KEY_INVALID: An invalid api_key was supplied.')

    def test_no_answer_is_a_transient_failure_without_a_status(self):
        with socket.socket() as unused:
            unused.bind(('127.0.0.1', 0))
            port = unused.getsockname()[1]
        with self.assertRaises(FetchError) as caught:
            fetch_donki.http_get(f'http://127.0.0.1:{port}/ok', 2)
        self.assertIsNone(caught.exception.status)
        self.assertTrue(caught.exception.transient)
        self.assertTrue(str(caught.exception).startswith('no answer ('))


class RetryTests(FakeNetworkTest):
    def test_passing_failures_are_retried_with_bounded_waits(self):
        outcomes = {1: fail(503), 2: fail(502), 3: ok(sep_records(2))}
        self.use(lambda *key: outcomes[key[-1]])
        records, query = self.get()
        self.assertEqual((len(records), query['attempts'], query['status']), (2, 3, 200))
        self.assertEqual(self.waits, [5.0, 20.0])

    def test_retries_stop_after_three_attempts(self):
        transport = self.use(lambda *key: fail(503))
        with self.assertRaises(FetchError):
            self.get()
        self.assertEqual(len(transport.urls), 3)

    def test_a_short_retry_after_is_honored(self):
        outcomes = {1: fail(429, headers={'Retry-After': '10'}), 2: ok(sep_records(1))}
        self.use(lambda *key: outcomes[key[-1]])
        self.get()
        self.assertEqual(self.waits, [10.0])

    def test_a_rate_limit_without_a_short_wait_stops_at_once(self):
        for headers in ({}, {'Retry-After': '3600'}):
            transport = self.use(lambda *key, headers=headers: fail(429, headers=headers))
            with self.assertRaises(fetch_donki.RateLimited):
                self.get()
            self.assertEqual(len(transport.urls), 1)

    def test_a_refused_key_or_a_missing_page_is_not_retried(self):
        for status in (403, 404):
            transport = self.use(lambda *key, status=status: fail(status))
            with self.assertRaises(FetchError):
                self.get()
            self.assertEqual(len(transport.urls), 1)


class FallbackTests(FakeNetworkTest):
    YEAR = (dt.date(2010, 1, 1), dt.date(2010, 12, 31))

    def year(self, service=API_NASA):
        return fetch_donki.fetch_year(service, 'FLR', *self.YEAR, 1.0, 0.0, self.logs.append)

    def test_a_failed_year_is_fetched_month_by_month(self):
        transport = self.use(
            lambda host, kind, start, end, nth: fail(504) if start[5:] == '01-01' and end[5:] == '12-31' else ok(flr_records(1, start))
        )
        records, queries = self.year()
        self.assertEqual(len(records), 12)
        self.assertIn('HTTP 504', queries[0]['failed'])
        self.assertEqual(len(queries), 13)
        self.assertEqual(len(transport.urls), 3 + 12)

    def test_a_month_that_still_fails_fails_the_year_without_asking_for_the_rest(self):
        transport = self.use(lambda *key: fail(504))
        with self.assertRaises(FetchError):
            self.year()
        self.assertEqual(len(transport.urls), 6)
        self.assertTrue(any('2010-01: HTTP 504' in line for line in self.logs))

    def test_an_unusable_200_answer_also_falls_back(self):
        transport = self.use(
            lambda host, kind, start, end, nth: ok(raw=b'<html></html>') if end == '2010-12-31' and start == '2010-01-01' else ok([])
        )
        records, queries = self.year()
        self.assertEqual(records, [])
        self.assertEqual(len(transport.urls), 1 + 12)

    def test_no_fallback_where_smaller_windows_cannot_help(self):
        for outcome in (fail(404), fail(301, headers={'Location': 'https://elsewhere.test/x'}), fail(403)):
            transport = self.use(lambda *key, outcome=outcome: outcome)
            with self.assertRaises(FetchError):
                self.year()
            self.assertEqual(len(transport.urls), 1)


class AuthenticationTests(FakeNetworkTest):
    def api_keys(self, url):
        return urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get('api_key', [])

    def test_probe_year_retries_and_months_all_carry_the_key(self):
        def route(host, kind, start, end, nth):
            if host != 'api.nasa.gov':
                return no_answer()
            if kind == 'SEP':
                return ok(sep_records(1))
            if start == '2010-01-01' and end == '2010-12-31':
                return fail(503)
            return fail(503) if nth == 1 else ok(flr_records(1, start))

        transport = self.use(route)
        service = fetch_donki.find_service(1.0, self.logs.append)
        self.assertIs(service, API_NASA)
        fetch_donki.fetch_year(service, 'FLR', dt.date(2010, 1, 1), dt.date(2010, 12, 31), 1.0, 0.0, self.logs.append)
        nasa = [url for url in transport.urls if 'api.nasa.gov' in url]
        self.assertEqual(len(nasa), 1 + 3 + 24)  # probe, three tries at the year, two tries per month
        for url in nasa:
            self.assertEqual(self.api_keys(url), [SECRET])
        for url in transport.urls:
            if 'api.nasa.gov' not in url:
                self.assertEqual(self.api_keys(url), [])

    def test_keyless_addresses_never_receive_the_key(self):
        transport = self.use(lambda *key: ok(flr_records(1, '2010-01-01')))
        fetch_donki.fetch_year(CCMC, 'FLR', dt.date(2010, 1, 1), dt.date(2010, 12, 31), 1.0, 0.0, self.logs.append)
        self.assertNotIn('api_key', transport.urls[0])


class ProbeTests(FakeNetworkTest):
    def probe_with(self, outcome):
        self.use(lambda host, *rest: outcome if host == 'api.nasa.gov' else no_answer())
        return fetch_donki.find_service(1.0, self.logs.append)

    def test_html_other_json_and_redirects_do_not_count_as_a_working_address(self):
        for outcome in (
            ok(raw=b'<html><body>DONKI has moved</body></html>'),
            ok(raw=b'{"message": "moved"}'),
            fail(302, headers={'Location': 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/SEP'}),
        ):
            self.assertIsNone(self.probe_with(outcome))

    def test_a_passing_error_on_the_probe_is_retried_but_silence_is_not(self):
        outcomes = {1: fail(503), 2: fail(503), 3: ok(sep_records(1))}
        transport = self.use(lambda host, *rest: outcomes[rest[-1]] if host == 'api.nasa.gov' else no_answer())
        self.assertIs(fetch_donki.find_service(1.0, self.logs.append), API_NASA)
        self.assertEqual(len([url for url in transport.urls if 'ccmc' in url]), 2)  # one try per silent address
        self.assertEqual(len([url for url in transport.urls if 'api.nasa.gov' in url]), 3)

    def test_a_valid_list_is_accepted_and_an_empty_one_is_flagged(self):
        self.assertIs(self.probe_with(ok(sep_records(3))), API_NASA)
        self.assertTrue(any('format checked' in line for line in self.logs))
        self.assertIs(self.probe_with(ok([])), API_NASA)
        self.assertTrue(any('could not be checked' in line for line in self.logs))


class DownloadTests(FakeNetworkTest):
    def setUp(self):
        self.out = Path(tempfile.mkdtemp())

    def run_main(self):
        argv = ['--start', '2010-01-01', '--end', '2011-12-31', '--out', str(self.out), '--pause', '0']
        return fetch_donki.main(argv, log=self.logs.append)

    def meta(self):
        return json.loads((self.out / 'meta.json').read_text(encoding='utf-8'))

    def route(self, flr_2011_works):
        def answer(host, kind, start, end, nth):
            if host != 'api.nasa.gov':
                return no_answer()
            if kind == 'SEP' and start.startswith('2024'):
                return ok(sep_records(1))
            if kind == 'FLR':
                if start.startswith('2011') and not flr_2011_works:
                    return fail(504, API_ERROR_WITH_SECRET)
                return ok(flr_records(2, start))
            if kind == 'CME':
                return ok([])  # a valid empty JSON list: zero events
            return ok(raw=b'') if start.startswith('2010') else ok(sep_records(1, start))

        return answer

    def test_failures_write_nothing_and_the_dataset_stays_incomplete(self):
        self.use(self.route(flr_2011_works=False))
        self.assertEqual(self.run_main(), 1)
        self.assertTrue((self.out / 'FLR' / '2010.json.gz').exists())
        self.assertFalse((self.out / 'FLR' / '2011.json.gz').exists())
        meta = self.meta()
        self.assertFalse(meta['complete'])
        self.assertEqual(meta['missingFiles'], ['FLR/2011.json.gz'])
        self.assertEqual(meta['recordCounts'], {'FLR': 2, 'CME': 0, 'SEP': 1})
        self.assertIn('HTTP 504: UPSTREAM_ERROR', meta['lastRun']['problems'][0])
        answers = [query['answer'] for query in meta['files']['SEP/2010.json.gz']['queries']]
        self.assertEqual(answers, ['empty body'])
        text = (self.out / 'meta.json').read_text(encoding='utf-8') + '\n'.join(self.logs)
        self.assertNotIn(SECRET, text)
        for info in meta['files'].values():
            for query in info['queries']:
                self.assertIn('api_key=REDACTED', query['url'])

    def test_a_second_run_keeps_files_and_fetches_only_what_is_missing(self):
        self.use(self.route(flr_2011_works=False))
        self.run_main()
        transport = self.use(self.route(flr_2011_works=True))
        self.assertEqual(self.run_main(), 0)
        fetched = [url for url in transport.urls if 'api.nasa.gov' in url and '2024-05' not in url]
        self.assertEqual(len(fetched), 1)
        self.assertIn('/FLR?', fetched[0])
        self.assertTrue(self.meta()['complete'])

    def test_a_type_with_no_file_has_an_unknown_count_not_zero(self):
        self.use(lambda host, kind, start, *rest: ok(sep_records(1)) if host == 'api.nasa.gov' and start.startswith('2024') else (no_answer() if host != 'api.nasa.gov' else fail(429)))
        self.assertEqual(self.run_main(), 1)
        self.assertEqual(self.meta()['recordCounts'], {'FLR': None, 'CME': None, 'SEP': None})

    def test_no_working_address_writes_nothing(self):
        self.use(lambda *key: no_answer())
        self.assertEqual(self.run_main(), 2)
        self.assertFalse((self.out / 'meta.json').exists())

    def test_verify_reports_counts_and_catches_a_recorded_key(self):
        self.use(self.route(flr_2011_works=True))
        self.run_main()
        self.logs.clear()
        self.assertEqual(fetch_donki.main(['--verify', '--out', str(self.out)], log=self.logs.append), 0)
        self.assertTrue(any(line.startswith('FLR: 4 records; year files 2 of 2') for line in self.logs))
        self.assertTrue(any('does not show that no event happened' in line for line in self.logs))
        meta_path = self.out / 'meta.json'
        meta_path.write_text(meta_path.read_text(encoding='utf-8').replace('api_key=REDACTED', 'api_key=abc', 1), encoding='utf-8')
        self.assertEqual(fetch_donki.main(['--verify', '--out', str(self.out)], log=self.logs.append), 1)
        self.assertTrue(any('looks like an API key' in line for line in self.logs))

    def test_files_are_reproducible_gzip(self):
        self.use(self.route(flr_2011_works=True))
        self.run_main()
        first = (self.out / 'FLR' / '2010.json.gz').read_bytes()
        fetch_donki.main(['--start', '2010-01-01', '--end', '2011-12-31', '--out', str(self.out), '--pause', '0', '--force'], log=self.logs.append)
        self.assertEqual((self.out / 'FLR' / '2010.json.gz').read_bytes(), first)
        self.assertEqual(len(json.loads(gzip.decompress(first))), 2)


class DiagnoseTests(FakeNetworkTest):
    def test_answers_are_compared_and_nothing_secret_is_printed(self):
        def route(host, kind, start, end, nth):
            if host != 'api.nasa.gov':
                return no_answer()
            if kind == 'FLR' and end == '2010-12-31':
                return fail(504, API_ERROR_WITH_SECRET)
            return ok(raw=b'') if end == '2010-01-02' else ok(sep_records(2) if kind == 'SEP' else [])

        self.use(route)
        self.assertEqual(fetch_donki.main(['--diagnose'], log=self.logs.append), 0)
        text = '\n'.join(self.logs)
        self.assertNotIn(SECRET, text)
        self.assertIn('HTTP 504: UPSTREAM_ERROR: Failed for https://api.nasa.gov/DONKI/FLR', text)
        self.assertIn('HTTP 200, empty body', text)
        self.assertIn('[X-RateLimit-Remaining 999]', text)

    def test_a_rate_limit_stops_the_diagnosis(self):
        self.use(lambda host, *rest: fail(429, headers={'Retry-After': '30000'}) if host == 'api.nasa.gov' else no_answer())
        self.assertEqual(fetch_donki.main(['--diagnose'], log=self.logs.append), 1)
        self.assertIn('Stopping the diagnosis', '\n'.join(self.logs))


class RangeTests(unittest.TestCase):
    def test_year_ranges_cut_the_first_and_last_year(self):
        ranges = fetch_donki.year_ranges(dt.date(2010, 3, 5), dt.date(2012, 2, 10))
        self.assertEqual(
            ranges,
            [
                (2010, dt.date(2010, 3, 5), dt.date(2010, 12, 31)),
                (2011, dt.date(2011, 1, 1), dt.date(2011, 12, 31)),
                (2012, dt.date(2012, 1, 1), dt.date(2012, 2, 10)),
            ],
        )

    def test_month_ranges_cover_a_year_without_gaps(self):
        ranges = fetch_donki.month_ranges(dt.date(2024, 1, 1), dt.date(2024, 12, 31))
        self.assertEqual(len(ranges), 12)
        self.assertEqual(ranges[1], (dt.date(2024, 2, 1), dt.date(2024, 2, 29)))
        for (_, last), (first, _) in zip(ranges, ranges[1:]):
            self.assertEqual(first, last + dt.timedelta(days=1))

    def test_month_list_joins_runs(self):
        self.assertEqual(fetch_donki.month_list(['2019-11', '2019-12', '2020-01', '2020-03']), '2019-11..2020-01, 2020-03')


class UrlTests(unittest.TestCase):
    def test_the_scripts_own_opener_refuses_redirects(self):
        handlers = fetch_donki._OPENER.handlers
        redirect_handlers = [h for h in handlers if isinstance(h, urllib.request.HTTPRedirectHandler)]
        self.assertEqual([type(h) for h in redirect_handlers], [fetch_donki._NoRedirects])

    def test_keyless_urls_carry_no_key(self):
        url = fetch_donki.build_url(CCMC, 'FLR', dt.date(2024, 1, 1), dt.date(2024, 12, 31))
        self.assertEqual(url, 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=2024-01-01&endDate=2024-12-31')

    def test_the_key_comes_from_the_environment_and_is_never_recorded(self):
        with mock.patch.dict(os.environ, {'NASA_API_KEY': SECRET}):
            live = fetch_donki.build_url(API_NASA, 'SEP', dt.date(2024, 1, 1), dt.date(2024, 1, 31))
            recorded = fetch_donki.redacted_url(API_NASA, 'SEP', dt.date(2024, 1, 1), dt.date(2024, 1, 31))
        self.assertIn(f'api_key={SECRET}', live)
        self.assertNotIn(SECRET, recorded)
        self.assertIn('api_key=REDACTED', recorded)

    def test_without_a_key_the_shared_demo_key_is_used(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(fetch_donki.api_key(), 'DEMO_KEY')

    def test_each_type_has_its_own_id_field(self):
        self.assertEqual(fetch_donki.record_id('FLR', {'flrID': 'F1'}), 'F1')
        self.assertEqual(fetch_donki.record_id('CME', {'activityID': 'C1'}), 'C1')
        self.assertEqual(fetch_donki.record_id('SEP', {'sepID': 'S1'}), 'S1')


if __name__ == '__main__':
    unittest.main()
