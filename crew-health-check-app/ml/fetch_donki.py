"""Download NASA DONKI space weather records (FLR, CME, SEP) year by year.

Standard library only. Writes gzip JSON files and a meta.json:

    ml/data/raw/donki/<TYPE>/<YEAR>.json.gz
    ml/data/raw/donki/meta.json

Usage:
    py ml/fetch_donki.py --start 2010-01-01   download; resumable, keeps files already written
    py ml/fetch_donki.py --diagnose           a few small test requests; writes nothing
    py ml/fetch_donki.py --verify             check the files and meta.json; no network

The script tries the DONKI addresses in the order of ARCHITECTURE.md section 25
and records which one answered. A redirect is reported, never followed, so the
key cannot travel to another address. A request that fails for a passing reason
(no answer in time, HTTP 5xx, or HTTP 429 with a short Retry-After) is retried
at most twice. If a whole year fails, that year is fetched month by month. A
year is written only when every request for it returned a valid answer, so a
failure is never recorded as zero events.

API key: api.nasa.gov needs a key. Set it privately in your own terminal:

    PowerShell:  $env:NASA_API_KEY = "your key"
    bash/zsh:    export NASA_API_KEY="your key"

The key is read from the environment only. It is never printed, never written
to meta.json and never committed. Error messages are filtered so that neither
the key nor a request address with its query appears. Without a key the shared
DEMO_KEY is used, which is heavily rate limited.

DONKI is experimental research information from NASA's Community Coordinated
Modeling Center (CCMC). Official U.S. space weather forecasts come from NOAA's
Space Weather Prediction Center.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import http.client
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

RECORD_TYPES = ('FLR', 'CME', 'SEP')
ID_FIELDS = {'FLR': 'flrID', 'CME': 'activityID', 'SEP': 'sepID'}
TIME_FIELDS = {'FLR': 'beginTime', 'CME': 'startTime', 'SEP': 'eventTime'}
OUT_DIR = Path(__file__).resolve().parent / 'data' / 'raw' / 'donki'
USER_AGENT = 'crew-health-check-donki-fetch'
REDACTED = 'REDACTED'

MAX_ATTEMPTS = 3  # one request plus at most two retries
RETRY_WAITS = (5.0, 20.0)  # seconds before the second and the third attempt
MAX_RETRY_AFTER = 120.0  # a longer wait asked for by the server stops the run instead
TRANSIENT_STATUSES = frozenset({408, 500, 502, 503, 504})
# Statuses for which a smaller window may succeed where a whole year failed.
FALLBACK_STATUSES = frozenset({400, 408, 413, 414, 500, 502, 503, 504})
# Response headers that are safe and useful to show. Request headers never are.
SAFE_HEADERS = ('Content-Type', 'Age', 'X-Cache', 'Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining')

# Tried in this order (section 25). `key_param` is set only where a key is needed.
SERVICES = (
    {'name': 'ccmc-donki-api', 'base': 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/', 'key_param': None},
    {'name': 'kauai-ws', 'base': 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/', 'key_param': None},
    {'name': 'api-nasa-gov', 'base': 'https://api.nasa.gov/DONKI/', 'key_param': 'api_key'},
)

# The small query that decides whether an address answers with DONKI records.
PROBE = ('SEP', dt.date(2024, 5, 1), dt.date(2024, 5, 31))

# Small requests for --diagnose, from the probe up to the request that failed on
# 14 November 2026 (FLR for all of 2010), so their answers can be compared.
DIAGNOSTIC_REQUESTS = (
    ('SEP', dt.date(2024, 5, 1), dt.date(2024, 5, 31), 'the probe month'),
    ('SEP', dt.date(2010, 1, 1), dt.date(2010, 1, 2), 'two days: shows how an empty window is answered'),
    ('FLR', dt.date(2024, 5, 1), dt.date(2024, 5, 7), 'one recent week'),
    ('FLR', dt.date(2010, 1, 1), dt.date(2010, 1, 31), 'one month of 2010'),
    ('FLR', dt.date(2010, 1, 1), dt.date(2010, 12, 31), 'all of 2010: the request that failed'),
    ('CME', dt.date(2010, 1, 1), dt.date(2010, 1, 31), 'one month of 2010'),
)

Log = Callable[[str], None]
sleep = time.sleep  # replaced in tests


class FetchError(Exception):
    """A request without a usable answer. Its message is safe to print and to store."""

    def __init__(
        self,
        message: str,
        status: int | None = None,
        transient: bool = False,
        retry_after: float | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.transient = transient
        self.retry_after = retry_after
        self.headers = headers or {}


class RateLimited(FetchError):
    """HTTP 429."""


class AuthFailed(FetchError):
    """HTTP 401 or 403: the key is missing, wrong or refused. Retrying cannot help."""


# --- The key and safe text ---------------------------------------------------


def api_key() -> str:
    return os.environ.get('NASA_API_KEY', '').strip() or 'DEMO_KEY'


def _secrets() -> list[str]:
    key = os.environ.get('NASA_API_KEY', '').strip()
    return [key] if key else []


def scrub(text: str, limit: int = 160) -> str:
    """Text that is safe to print: no key value, no query strings, no control characters, short."""
    for secret in _secrets():
        text = text.replace(secret, REDACTED)
    text = re.sub(r'(?i)(api_key=)[^&\s"\'<>]+', r'\g<1>' + REDACTED, text)
    text = re.sub(r'(https?://[^\s?#"\'<>]+)[?#][^\s"\'<>]*', r'\1', text)
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[\x00-\x1f\x7f]', '', text).strip()
    text = text.encode('ascii', 'replace').decode('ascii')  # any console can print it
    return text if len(text) <= limit else text[: limit - 3] + '...'


def key_report() -> str:
    """Whether a key is set and whether it looks usable. Never the key itself."""
    raw = os.environ.get('NASA_API_KEY')
    if raw is None or not raw.strip():
        return 'NASA_API_KEY is not set in this terminal: the shared DEMO_KEY is used (heavily rate limited).'
    key = raw.strip()
    notes = []
    if key != raw:
        notes.append('spaces around it were removed')
    if any(char.isspace() for char in key):
        notes.append('it contains spaces')
    if any(char in '"\'' for char in key):
        notes.append('it contains quote characters')
    if not key.isascii():
        notes.append('it contains non-ASCII characters')
    if len(key) < 20:
        notes.append('it looks too short for an api.nasa.gov key')
    details = f'; {"; ".join(notes)}' if notes else ''
    return f'NASA_API_KEY is set ({len(key)} characters{details}). Its value is never shown.'


def build_url(service: dict, record_type: str, start: dt.date, end: dt.date, key: str | None = None) -> str:
    """The one place where the key is added: every request to a keyed address carries it."""
    params = {'startDate': start.isoformat(), 'endDate': end.isoformat()}
    if service['key_param']:
        params[service['key_param']] = api_key() if key is None else key
    return f"{service['base']}{record_type}?{urllib.parse.urlencode(params)}"


def redacted_url(service: dict, record_type: str, start: dt.date, end: dt.date) -> str:
    """The query as recorded in meta.json: the key value never appears."""
    return build_url(service, record_type, start, end, key=REDACTED)


# --- One request ---------------------------------------------------------------


def describe_body(body: bytes) -> str:
    """What an answer holds, never the raw body: the API's error code and message if it sent one."""
    text = body.decode('utf-8', errors='replace').strip()
    if not text:
        return 'an empty body'
    try:
        data = json.loads(text)
    except ValueError:
        head = text[:300].lower()
        return 'an HTML page' if ('<html' in head or '<!doctype' in head) else 'text that is not JSON'
    if isinstance(data, dict):
        error = data.get('error')
        if isinstance(error, dict):
            code, message = error.get('code'), error.get('message')
        else:
            code = data.get('code')
            message = error if isinstance(error, str) else data.get('message', data.get('msg'))
        parts = []
        if isinstance(code, (str, int)) and re.fullmatch(r'[A-Za-z0-9_.-]{1,40}', str(code)):
            parts.append(str(code))
        if isinstance(message, str) and message.strip():
            parts.append(scrub(message))
        if parts:
            return ': '.join(parts)
        return 'a JSON object with fields ' + scrub(', '.join(sorted(str(name) for name in data)[:6]), 80)
    if isinstance(data, list):
        return f'a JSON list of {len(data)} items'
    return f'a JSON {type(data).__name__}'


def safe_headers(headers) -> dict[str, str]:
    if headers is None:
        return {}
    return {name: scrub(str(headers.get(name)), 60) for name in SAFE_HEADERS if headers.get(name) is not None}


def retry_after_seconds(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        seconds = float(value.strip())
    except ValueError:
        return None  # an HTTP date: treated as unknown
    return seconds if seconds >= 0 else None


def http_failure(status: int, body: bytes, headers) -> FetchError:
    shown = safe_headers(headers)
    if 300 <= status < 400:
        location = headers.get('Location', '') if headers is not None else ''
        parts = urllib.parse.urlsplit(str(location))
        target = scrub(f'{parts.scheme}://{parts.hostname}{parts.path}') if parts.hostname else 'an unnamed address'
        return FetchError(f'HTTP {status}: redirect to {target} (not followed)', status=status, headers=shown)
    reason = describe_body(body)
    if status == 429:
        wait = retry_after_seconds(shown.get('Retry-After'))
        return RateLimited(f'HTTP 429: {reason}', status=status, retry_after=wait, headers=shown)
    if status in (401, 403):
        return AuthFailed(f'HTTP {status}: {reason}', status=status, headers=shown)
    return FetchError(f'HTTP {status}: {reason}', status=status, transient=status in TRANSIENT_STATUSES, headers=shown)


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    """A redirect becomes an HTTP error: the key must not travel to another
    address, and meta.json must name the address that really answered."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def build_opener(*handlers: urllib.request.BaseHandler) -> urllib.request.OpenerDirector:
    """Every opener of this script refuses to follow redirects."""
    return urllib.request.build_opener(*handlers, _NoRedirects())


_OPENER = build_opener()


def http_get(url: str, timeout: float) -> tuple[int, bytes, dict[str, str]]:
    """One GET. Returns (status, body, safe headers) for a 2xx answer; raises FetchError otherwise."""
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    try:
        with _OPENER.open(request, timeout=timeout) as response:
            return response.status, response.read(), safe_headers(response.headers)
    except urllib.error.HTTPError as error:
        try:
            body = error.read()
        except (OSError, http.client.HTTPException):
            body = b''
        raise http_failure(error.code, body, error.headers) from None
    except (urllib.error.URLError, OSError, http.client.HTTPException) as error:
        reason = getattr(error, 'reason', error)
        raise FetchError(f'no answer ({type(reason).__name__}: {scrub(str(reason))})', transient=True) from None


def parse_records(body: bytes, record_type: str) -> tuple[list, str]:
    """Checks a 2xx answer. A JSON list of records of this type, or an empty
    body, is accepted; anything else is an error, never zero records."""
    try:
        text = body.decode('utf-8').strip()
    except UnicodeDecodeError:
        raise FetchError('the answer is not UTF-8 text', status=200) from None
    if not text:
        return [], 'empty body'
    try:
        data = json.loads(text)
    except ValueError:
        raise FetchError(f'the answer is not JSON records ({describe_body(body)})', status=200) from None
    if not isinstance(data, list):
        raise FetchError(f'the answer is not a list of records ({describe_body(body)})', status=200)
    field = ID_FIELDS[record_type]
    bad = sum(1 for item in data if not isinstance(item, dict) or not isinstance(item.get(field), str) or not item[field])
    if bad:
        raise FetchError(f'{bad} of {len(data)} items have no {field}, so they are not {record_type} records', status=200)
    return data, 'JSON list'


def retry_wait(error: FetchError, attempt: int, attempts: int) -> float | None:
    """Seconds to wait before trying again, or None to give up."""
    if attempt >= attempts or isinstance(error, AuthFailed):
        return None
    if isinstance(error, RateLimited):
        if error.retry_after is None or error.retry_after > MAX_RETRY_AFTER:
            return None
        return error.retry_after
    return RETRY_WAITS[min(attempt, len(RETRY_WAITS)) - 1] if error.transient else None


def get_records(
    service: dict,
    record_type: str,
    first: dt.date,
    last: dt.date,
    timeout: float,
    log: Log,
    attempts: int = MAX_ATTEMPTS,
) -> tuple[list, dict]:
    """One window of records, with bounded retries. Returns the records and the query as stored in meta.json."""
    url = build_url(service, record_type, first, last)
    for attempt in range(1, attempts + 1):
        try:
            status, body, _headers = http_get(url, timeout)
            records, answer = parse_records(body, record_type)
        except FetchError as error:
            wait = retry_wait(error, attempt, attempts)
            if wait is None:
                raise
            log(f'  {record_type} {first}..{last}: {error}; trying again in {wait:.0f} s ({attempt + 1} of {attempts})')
            sleep(wait)
            continue
        query = {
            'from': first.isoformat(),
            'to': last.isoformat(),
            'url': redacted_url(service, record_type, first, last),
            'status': status,
            'answer': answer,
            'records': len(records),
            'attempts': attempt,
        }
        return records, query
    raise AssertionError('unreachable: the last attempt either returns or raises')


# --- Years, months and the address -------------------------------------------


def year_ranges(start: dt.date, end: dt.date) -> list[tuple[int, dt.date, dt.date]]:
    ranges = []
    for year in range(start.year, end.year + 1):
        first = max(start, dt.date(year, 1, 1))
        last = min(end, dt.date(year, 12, 31))
        ranges.append((year, first, last))
    return ranges


def month_ranges(first: dt.date, last: dt.date) -> list[tuple[dt.date, dt.date]]:
    ranges = []
    cursor = first
    while cursor <= last:
        next_month = dt.date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)
        ranges.append((cursor, min(last, next_month - dt.timedelta(days=1))))
        cursor = next_month
    return ranges


def record_id(record_type: str, record: dict) -> str:
    return str(record.get(ID_FIELDS[record_type], ''))


def smaller_windows_may_help(error: FetchError) -> bool:
    if isinstance(error, (RateLimited, AuthFailed)):
        return False
    if error.status is None or error.status == 200:
        return True  # no answer in time, a dropped connection, or an answer cut short
    return error.status in FALLBACK_STATUSES


def fetch_year(
    service: dict, record_type: str, first: dt.date, last: dt.date, timeout: float, pause: float, log: Log
) -> tuple[list, list[dict]]:
    """One year in one request; if that fails in a way a smaller window may fix,
    month by month. Any month that still fails fails the whole year."""
    try:
        records, query = get_records(service, record_type, first, last, timeout, log)
        return records, [query]
    except FetchError as error:
        if not smaller_windows_may_help(error):
            raise
        log(f'  {record_type} {first.year}: the whole year failed ({error}); trying month by month')
        queries = [
            {
                'from': first.isoformat(),
                'to': last.isoformat(),
                'url': redacted_url(service, record_type, first, last),
                'failed': str(error),
            }
        ]
    records: list = []
    for month_first, month_last in month_ranges(first, last):
        sleep(pause)
        try:
            part, query = get_records(service, record_type, month_first, month_last, timeout, log)
        except FetchError as error:
            log(f'  {record_type} {month_first:%Y-%m}: {error}')
            raise
        records.extend(part)
        queries.append(query)
    return records, queries


def find_service(timeout: float, log: Log) -> dict | None:
    """The first address whose answer to a small SEP query is a valid list of SEP
    records. HTML pages, other JSON and redirects do not count."""
    record_type, first, last = PROBE
    for service in SERVICES:
        try:
            try:
                records, _query = get_records(service, record_type, first, last, timeout, log, attempts=1)
            except FetchError as error:
                # An address that answered with a passing error gets the usual
                # retries; one that did not answer at all is not waited for again.
                if not (error.transient and error.status is not None):
                    raise
                records, _query = get_records(service, record_type, first, last, timeout, log)
        except FetchError as error:
            log(f"{service['name']}: {error}")
            continue
        if records:
            log(f"address works: {service['name']} ({service['base']}): {len(records)} SEP records, format checked")
        else:
            log(
                f"address answers: {service['name']} ({service['base']}), but with no SEP records "
                'for the probe month, so the record format could not be checked'
            )
        return service
    return None


# --- Files and meta.json --------------------------------------------------------


def last_full_month_end() -> dt.date:
    today = dt.datetime.now(dt.timezone.utc).date()
    return today.replace(day=1) - dt.timedelta(days=1)


def now_text() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def write_records(path: Path, record_type: str, records: list) -> int:
    unique = {record_id(record_type, record): record for record in records}
    ordered = [unique[key] for key in sorted(unique)]
    path.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0 keeps the gzip bytes identical for identical data.
    with path.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as handle:
        handle.write(json.dumps(ordered, sort_keys=True, separators=(',', ':')).encode('utf-8'))
    return len(ordered)


def covers(info: dict | None, path: Path, first: dt.date, last: dt.date) -> bool:
    """A file counts only if it is on disk and its meta.json entry covers the whole window."""
    return bool(info) and path.exists() and info.get('from', '9999') <= first.isoformat() and info.get('to', '') >= last.isoformat()


def load_meta(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}


def finalize(meta: dict, start: dt.date, end: dt.date, out_dir: Path, types: list[str], problems: list[str]) -> dict:
    files = meta.setdefault('files', {})
    present = {
        f'{record_type}/{year}.json.gz'
        for record_type in RECORD_TYPES
        for year, first, last in year_ranges(start, end)
        if covers(files.get(f'{record_type}/{year}.json.gz'), out_dir / record_type / f'{year}.json.gz', first, last)
    }
    expected = [f'{record_type}/{year}.json.gz' for record_type in RECORD_TYPES for year, _, _ in year_ranges(start, end)]
    meta['requested'] = {'start': start.isoformat(), 'end': end.isoformat(), 'types': list(types)}
    meta['missingFiles'] = [name for name in expected if name not in present]
    meta['complete'] = not meta['missingFiles']
    # A type with no file has an unknown count (null), never zero events.
    meta['recordCounts'] = {
        record_type: (
            sum(files[name]['records'] for name in present if name.startswith(record_type + '/'))
            if any(name.startswith(record_type + '/') for name in present)
            else None
        )
        for record_type in RECORD_TYPES
    }
    meta['lastRun'] = {'at': now_text(), 'problems': problems}
    return meta


def save_meta(path: Path, meta: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def download(args: argparse.Namespace, log: Log) -> int:
    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end) if args.end else last_full_month_end()
    out_dir = Path(args.out)
    log(key_report())

    service = find_service(args.timeout, log)
    if service is None:
        log('No DONKI address gave a valid answer. Nothing was downloaded.')
        log('Run with --diagnose for details; see ARCHITECTURE.md section 25 and docs/PROGRESS.md.')
        return 2

    meta_path = out_dir / 'meta.json'
    meta = load_meta(meta_path)
    meta['source'] = 'NASA CCMC DONKI'
    meta['note'] = 'Experimental research information; official U.S. forecasts come from NOAA SWPC.'
    meta['service'] = service['name']
    meta['apiBase'] = service['base']
    meta['usesPersonalKey'] = bool(service['key_param']) and api_key() != 'DEMO_KEY'
    meta.pop('queries', None)  # older layout: queries now sit with the file they produced
    meta.pop('retrievedAt', None)  # older layout: each file has its own retrieval time
    files = meta.setdefault('files', {})
    problems: list[str] = []

    stop = False
    for record_type in args.types:
        for year, first, last in year_ranges(start, end):
            name = f'{record_type}/{year}.json.gz'
            path = out_dir / record_type / f'{year}.json.gz'
            if not args.force and covers(files.get(name), path, first, last):
                continue
            sleep(args.pause)
            try:
                records, queries = fetch_year(service, record_type, first, last, args.timeout, args.pause, log)
            except (RateLimited, AuthFailed) as error:
                problems.append(f'{name}: {error}')
                log(f'{name}: {error}. Stopping here; files already written are kept.')
                stop = True
                break
            except FetchError as error:
                problems.append(f'{name}: {error}')
                log(f'{name}: {error}. No file written for it; moving on to the next record type.')
                break
            count = write_records(path, record_type, records)
            files[name] = {
                'from': first.isoformat(),
                'to': last.isoformat(),
                'records': count,
                'service': service['name'],
                'retrievedAt': now_text(),
                'queries': queries,
            }
            save_meta(meta_path, finalize(meta, start, end, out_dir, args.types, problems))
            log(f'{name}: {count} records')
        if stop:
            break

    save_meta(meta_path, finalize(meta, start, end, out_dir, args.types, problems))
    log(
        f"meta.json written. complete={meta['complete']}; records in files: {meta['recordCounts']}; "
        f"missing files: {len(meta['missingFiles'])}"
    )
    return 0 if meta['complete'] else 1


# --- --diagnose -------------------------------------------------------------------


def diagnose(timeout: float, log: Log) -> int:
    """A few small requests, one attempt each, so their answers can be compared. Writes nothing."""
    log('Diagnosis: a few small DONKI requests. Nothing is written, and the key is never shown.')
    log(key_report())
    record_type, first, last = PROBE
    for service in SERVICES:
        started = time.monotonic()
        try:
            http_get(build_url(service, record_type, first, last), min(timeout, 20.0))
        except FetchError as error:
            if error.status is None:
                log(f"{service['name']}: {error} after {time.monotonic() - started:.0f} s")
                continue
        log(f"{service['name']} ({service['base']}) answers. Requests, one attempt each:")
        for request_type, window_first, window_last, note in DIAGNOSTIC_REQUESTS:
            sleep(2.0)
            started = time.monotonic()
            url = build_url(service, request_type, window_first, window_last)
            label = f'  {request_type} {window_first}..{window_last} ({note})'
            headers: dict[str, str] = {}
            try:
                status, body, headers = http_get(url, timeout)
                records, answer = parse_records(body, request_type)
                detail = f'{len(records)} records' if answer == 'JSON list' else answer
                log(f'{label}: HTTP {status}, {detail}, {time.monotonic() - started:.1f} s{header_note(headers)}')
            except FetchError as error:
                shown = error.headers or headers
                log(f'{label}: {error}, {time.monotonic() - started:.1f} s{header_note(shown)}')
                if isinstance(error, (RateLimited, AuthFailed)):
                    log('  Stopping the diagnosis: more requests cannot help now.')
                    return 1
    return 0


def header_note(headers: dict[str, str]) -> str:
    if not headers:
        return ''
    return ' [' + ', '.join(f'{name} {value}' for name, value in headers.items() if name != 'Content-Type') + ']'


# --- --verify ---------------------------------------------------------------------


def month_list(months: list[str]) -> str:
    """'2019-01..2019-04, 2019-07' for a sorted list of YYYY-MM strings."""
    spans: list[list[str]] = []
    for month in months:
        year, number = int(month[:4]), int(month[5:7])
        previous = f'{year - (number == 1)}-{12 if number == 1 else number - 1:02d}'
        if spans and spans[-1][1] == previous:
            spans[-1][1] = month
        else:
            spans.append([month, month])
    return ', '.join(first if first == last else f'{first}..{last}' for first, last in spans)


def verify(out_dir: Path, log: Log) -> int:
    """Checks the files against meta.json, reports counts, dates covered and gaps,
    and looks for anything that resembles a key. No network."""
    meta_path = out_dir / 'meta.json'
    if not meta_path.exists():
        log(f'No meta.json in {out_dir}. Nothing to verify.')
        return 1
    meta_text = meta_path.read_text(encoding='utf-8')
    meta = json.loads(meta_text)
    problems: list[str] = []
    if re.search(r'(?i)api_key=(?!REDACTED)', meta_text) or any(secret in meta_text for secret in _secrets()):
        problems.append('meta.json holds something that looks like an API key')

    requested = meta.get('requested', {})
    start = dt.date.fromisoformat(requested.get('start', '2010-01-01'))
    end = dt.date.fromisoformat(requested.get('end', last_full_month_end().isoformat()))
    files = meta.get('files', {})
    log(f'Requested range: {start}..{end}. Service: {meta.get("service")}. Complete: {meta.get("complete")}.')

    for record_type in RECORD_TYPES:
        months_with_records: set[str] = set()
        total, years_present, missing_years, empty_answers = 0, 0, [], 0
        years_without_records: list[str] = []
        first_time, last_time = None, None
        seen_ids: set[str] = set()
        outside, repeated = 0, 0
        for year, first, last in year_ranges(start, end):
            name = f'{record_type}/{year}.json.gz'
            path = out_dir / record_type / f'{year}.json.gz'
            info = files.get(name)
            if not covers(info, path, first, last):
                missing_years.append(str(year))
                continue
            with gzip.open(path, 'rt', encoding='utf-8') as handle:
                text = handle.read()
            if any(secret in text for secret in _secrets()):
                problems.append(f'{name} holds the API key')
            records = json.loads(text)
            if not isinstance(records, list) or len(records) != info.get('records'):
                problems.append(f'{name}: the file does not match the count in meta.json')
                continue
            for query in info.get('queries', []):
                if 'failed' not in query and (query.get('status') != 200 or query.get('answer') not in ('JSON list', 'empty body')):
                    problems.append(f'{name}: a query without a valid answer is recorded as a success')
                empty_answers += query.get('answer') == 'empty body'
            years_present += 1
            total += len(records)
            if not records:
                years_without_records.append(str(year))
            for record in records:
                stamp = record.get(TIME_FIELDS[record_type])
                if not isinstance(stamp, str) or len(stamp) < 10:
                    problems.append(f'{name}: a record has no {TIME_FIELDS[record_type]}')
                    continue
                months_with_records.add(stamp[:7])
                first_time = stamp if first_time is None or stamp < first_time else first_time
                last_time = stamp if last_time is None or stamp > last_time else last_time
                # Reported, not failed: the API may date a window by another time field.
                outside += not first.isoformat() <= stamp[:10] <= last.isoformat()
                identifier = record_id(record_type, record)
                repeated += identifier in seen_ids
                seen_ids.add(identifier)
        covered = [
            f'{year}-{month:02d}'
            for year, first, last in year_ranges(start, end)
            if str(year) not in missing_years
            for month in range(first.month, last.month + 1)
        ]
        quiet = [month for month in covered if month not in months_with_records]
        log(
            f'{record_type}: {total} records; year files {years_present} of {years_present + len(missing_years)}; '
            f'first {first_time or "none"}, last {last_time or "none"}'
        )
        log(f'  missing downloads: {", ".join(missing_years) or "none"}')
        log(f'  years downloaded but without records: {", ".join(years_without_records) or "none"}')
        log(f'  months downloaded but without records: {month_list(quiet) or "none"}')
        log(f'  answers with an empty body (kept as no records): {empty_answers}')
        log(f'  records dated outside their file window: {outside}; IDs in more than one file: {repeated}')
    log('A period without records means DONKI listed none when it was downloaded; it does not show that no event happened.')
    for problem in problems:
        log(f'PROBLEM: {problem}')
    ok = not problems and bool(meta.get('complete'))
    log('Verified: complete and consistent.' if ok else 'Not verified: see the lines above.')
    return 0 if ok else 1


# --- Command line -------------------------------------------------------------------


def main(argv: list[str] | None = None, log: Log | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--start', default='2010-01-01', help='first date, YYYY-MM-DD')
    parser.add_argument('--end', default=None, help='last date, YYYY-MM-DD (default: last full month)')
    parser.add_argument('--types', nargs='+', default=list(RECORD_TYPES), choices=RECORD_TYPES)
    parser.add_argument('--out', default=str(OUT_DIR))
    parser.add_argument('--pause', type=float, default=1.0, help='seconds between requests')
    parser.add_argument('--timeout', type=float, default=45.0)
    parser.add_argument('--force', action='store_true', help='download again even if a year is on disk')
    parser.add_argument('--diagnose', action='store_true', help='a few small test requests; writes nothing')
    parser.add_argument('--verify', action='store_true', help='check the downloaded files; no network')
    args = parser.parse_args(argv)

    def print_line(message: str) -> None:
        print(message, flush=True)

    log = log or print_line
    try:
        if args.verify:
            return verify(Path(args.out), log)
        if args.diagnose:
            return diagnose(args.timeout, log)
        return download(args, log)
    except KeyboardInterrupt:
        log('Stopped. Files already written are kept; run the same command again to resume.')
        return 130
    except Exception as error:  # the last guard: never print an unfiltered message
        log(f'Unexpected error: {type(error).__name__}: {scrub(str(error))}')
        return 3


if __name__ == '__main__':
    sys.exit(main())
