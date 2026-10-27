#!/usr/bin/env python3
"""Prepare reviewed, committed static translations; never run during a build.

Usage: python -X utf8 scripts/prepare-translations.py
The unauthenticated web translator is an offline authoring aid, not a runtime
service contract. Existing dictionary values are retained for editorial fixes.
Every batch is aligned by explicit markers and every protected token is checked.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ('en', 'uz', 'kk', 'tg', 'az', 'ky', 'be', 'hy', 'ka', 'tk')
ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
BROWSER_ENDPOINT = 'https://clients5.google.com/translate_a/t'
BACKEND = 'browser'
NUMBERS = re.compile(r'\d+(?:[.,]\d+)*')
PLACEHOLDERS = re.compile(r'\$?\{[^{}]+\}')
RUSSIAN_LETTERS = re.compile(r'[А-Яа-яЁё]')
PROTECTED = re.compile(
    r'Не менее суток|https?://[^\s<>]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}'
    r'|\$?\{[^{}]+\}'
    r'|\b(?:SUPER\s*TACK(?:\s+[37])?|PROMIX(?:\s+[HJFWhjfw](?:\s*0[.,][23])?)?|'
    r'PRO\s*SPRAY|PLUS\s*TOP|Plus\s*Top|LATEX|SILICON|FASAD)\b'
    r'|\b(?:RAL|IP|URL|PDF|PNG|JPG|WEBP|CSS|HTML|API|UTC|EAC)\b'
    r'|(?<!\w)(?:ISO|ГОСТ|EN|DIN)\s*[\dA-ZА-Я:./–—-]+'
    r'|(?<!\w)[A-Z][A-Z0-9_./-]*\d[A-Z0-9_./-]*(?!\w)'
    r'|[²³]|[+−-]?\d+(?:[.,]\d+)*(?:[±–—−/-]\d+(?:[.,]\d+)*)?',
    re.IGNORECASE,
)
_request_count = 0
_request_lock = threading.Lock()
_stop_generation = threading.Event()
DAY_PHRASE = {
    'en': 'At least a day', 'uz': 'Kamida bir sutka',
    'kk': 'Кемінде бір тәулік', 'tg': 'На камтар аз як шабонарӯз',
    'az': 'Ən azı bir sutka', 'ky': 'Кеминде бир сутка',
    'be': 'Не менш за суткі', 'hy': 'Առնվազն մեկ օր',
    'ka': 'არანაკლებ ერთი დღე', 'tk': 'Iň azyndan bir gije-gündiz',
}


class TranslationError(RuntimeError):
    pass


class RateLimitError(TranslationError):
    pass


def request_native_batch(texts: list[str], language: str) -> list[str]:
    """The public browser authoring endpoint aligns repeated q fields natively."""
    global _request_count
    query = urllib.parse.urlencode([('client', 'dict-chrome-ex'), ('sl', 'ru'), ('tl', language)]
                                 + [('q', value) for value in texts])
    request = urllib.request.Request(BROWSER_ENDPOINT + '?' + query, headers={'User-Agent': 'Mozilla/5.0'})
    last_error: Exception | None = None
    for attempt in range(3):
        if _stop_generation.is_set():
            raise RateLimitError('Generation stopped after rate limiting; checkpoints retained')
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                values = json.loads(response.read().decode('utf-8'))
            if not isinstance(values, list) or len(values) != len(texts) or not all(isinstance(value, str) for value in values):
                raise TranslationError('Native batch response count/type mismatch')
            with _request_lock:
                _request_count += 1
            return values
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            last_error = error
            if isinstance(error, urllib.error.HTTPError):
                if error.code == 429:
                    _stop_generation.set()
                    raise RateLimitError('Public authoring service rate limited; stop and preserve checkpoints') from error
                if error.code in (400, 413, 414):
                    break
            if attempt < 2:
                time.sleep(0.8 * 2 ** attempt)
    raise TranslationError(f'{language}: native batch request failed: {last_error}')


def protect(text: str, language: str | None = None, mask_numbers: bool = True) -> tuple[str, dict[str, str]]:
    tokens: dict[str, str] = {}
    def replace(match: re.Match[str]) -> str:
        token = f'ZXQ{len(tokens):04d}QXZ'
        value = match.group()
        if not mask_numbers and re.fullmatch(r'[²³]|[+−-]?\d+(?:[.,]\d+)*(?:[±–—−/-]\d+(?:[.,]\d+)*)?', value):
            return value
        # Keep the source's word-based duration word-based. Some engines expand
        # "суток" to a new numeric "24", defeating exact technical-value checks.
        tokens[token] = DAY_PHRASE[language] if language and value.casefold() == 'не менее суток' else value
        return token
    return PROTECTED.sub(replace, text), tokens


def restore(text: str, tokens: dict[str, str], original: str) -> str:
    for token, value in tokens.items():
        # Engines occasionally change case or add whitespace to an opaque
        # Latin marker. Accept formatting only, then restore the exact source
        # bytes; never guess a different marker number or translated value.
        pattern = re.compile(r'[\s\u200b]*'.join(re.escape(character) for character in token), re.IGNORECASE)
        matches = list(pattern.finditer(text))
        if len(matches) != 1:
            raise TranslationError(f'Protected token changed or duplicated: {token}')
        text = pattern.sub(lambda _: value, text)
    if re.search(r'ZXQ\d+QXZ', text):
        raise TranslationError('Unexpected protected token in translation')
    if Counter(NUMBERS.findall(text)) != Counter(NUMBERS.findall(original)):
        # Engines can localize 1,8 as 1.8. Restore source punctuation only after
        # the complete multiset of exact decimal values has been proven equal.
        # Missing, added or numerically different values still fail below.
        def numeric_key(value: str):
            try:
                return ('decimal', Decimal(value.replace(',', '.')))
            except InvalidOperation:
                return ('literal', value)
        source_numbers = NUMBERS.findall(original)
        if Counter(map(numeric_key, source_numbers)) == Counter(map(numeric_key, NUMBERS.findall(text))):
            source_formats: dict[tuple, list[str]] = {}
            for number in source_numbers:
                source_formats.setdefault(numeric_key(number), []).append(number)
            text = NUMBERS.sub(lambda match: source_formats[numeric_key(match.group())].pop(0), text)
    if Counter(NUMBERS.findall(text)) != Counter(NUMBERS.findall(original)):
        raise TranslationError('Numeric values changed')
    if Counter(PLACEHOLDERS.findall(text)) != Counter(PLACEHOLDERS.findall(original)):
        raise TranslationError('Placeholder values changed')
    if not text.strip():
        raise TranslationError('Empty translated value')
    return text.strip()


def request_translation(text: str, language: str) -> str:
    global _request_count
    if BACKEND == 'browser':
        return request_native_batch([text], language)[0]
    query = urllib.parse.urlencode({'client': 'gtx', 'sl': 'ru', 'tl': language, 'dt': 't', 'q': text})
    request = urllib.request.Request(ENDPOINT + '?' + query, headers={'User-Agent': 'Mozilla/5.0'})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = json.loads(response.read().decode('utf-8'))
            with _request_lock:
                _request_count += 1
            return ''.join(segment[0] or '' for segment in payload[0])
        except (urllib.error.URLError, TimeoutError, ValueError, IndexError, TypeError) as error:
            last_error = error
            # Invalid/oversized requests should be split rather than retried.
            if isinstance(error, urllib.error.HTTPError) and error.code in (400, 413, 414):
                break
            if attempt < 2:
                time.sleep(0.8 * 2 ** attempt)
    raise TranslationError(f'{language}: translation request failed: {last_error}')


def split_long(text: str, limit: int = 1000) -> list[str]:
    parts: list[str] = []
    while len(text) > limit:
        cut = max(text.rfind('. ', 0, limit), text.rfind('; ', 0, limit))
        if cut < limit // 3:
            cut = text.rfind(' ', 0, limit)
        if cut < 1:
            cut = limit
        else:
            cut += 1
        parts.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        parts.append(text)
    return parts


def translate_one(original: str, language: str) -> str:
    last_error: TranslationError | None = None
    for mask_numbers in [True, False]:
        # Repeated opaque numeric markers can be mistaken for model codes in a
        # long specification. A second pass leaves real numbers visible, while
        # preserving brands/placeholders and retaining the same strict audit.
        prepared, tokens = protect(original, language, mask_numbers=mask_numbers)
        try:
            if len(prepared) > 400:
                parts = split_long(prepared, limit=350)
                translated = ' '.join(request_native_batch(parts, language)) if BACKEND == 'browser' else ' '.join(request_translation(part, language) for part in parts)
            else:
                translated = request_translation(prepared, language)
            return restore(translated, tokens, original)
        except RateLimitError:
            raise
        except TranslationError as error:
            last_error = error
    raise last_error or TranslationError('No verified translation returned')


def translate_batch(strings: list[str], language: str) -> dict[str, str]:
    if len(strings) == 1:
        return {strings[0]: translate_one(strings[0], language)}
    prepared = [protect(value, language) for value in strings]
    text = '\n'.join(f'ZXQENTRY{index:05d}QXZ {value[0]}' for index, value in enumerate(prepared))
    try:
        if BACKEND == 'browser':
            translated_values = request_native_batch([value[0] for value in prepared], language)
            return {source: restore(translated, value[1], source)
                    for source, value, translated in zip(strings, prepared, translated_values)}
        translated = request_translation(text, language)
        markers = list(re.finditer(r'ZXQENTRY(\d+)QXZ\s*', translated, re.IGNORECASE))
        if [int(match[1]) for match in markers] != list(range(len(strings))):
            raise TranslationError('Batch alignment markers changed')
        result: dict[str, str] = {}
        for index, marker in enumerate(markers):
            end = markers[index + 1].start() if index + 1 < len(markers) else len(translated)
            result[strings[index]] = restore(translated[marker.end():end].strip(), prepared[index][1], strings[index])
        return result
    except RateLimitError:
        raise
    except TranslationError:
        # Split until independent strings can be checked without delimiters.
        middle = len(strings) // 2
        return {**translate_batch(strings[:middle], language), **translate_batch(strings[middle:], language)}


def read_strings(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding='utf-8'))
    if isinstance(payload, dict):
        payload = payload.get('strings', payload.get('sourceStrings', list(payload)))
    if not isinstance(payload, list) or not all(isinstance(value, str) for value in payload):
        raise TranslationError('Source corpus must contain a string array')
    return list(dict.fromkeys(value for value in payload if value.strip()))


def make_batches(strings: list[str], limit: int) -> list[list[str]]:
    batches: list[list[str]] = []
    current: list[str] = []
    length = 0
    for value in strings:
        encoded_length = len(protect(value)[0]) + 12
        if current and (length + encoded_length > limit or len(current) >= 24):
            batches.append(current)
            current, length = [], 0
        current.append(value)
        length += encoded_length
    if current:
        batches.append(current)
    return batches


def save(path: Path, values: dict[str, str], strings: list[str]) -> None:
    ordered = {key: values[key] for key in strings if key in values}
    temporary = path.with_suffix(f'.{os.getpid()}.tmp')
    temporary.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for attempt in range(8):
        try:
            os.replace(temporary, path)
            return
        except PermissionError:
            if attempt == 7:
                raise
            time.sleep(.1 * (attempt + 1))


def main() -> None:
    global BACKEND
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'src/i18n/source-strings.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'src/i18n/translations')
    parser.add_argument('--overrides', type=Path, default=ROOT / 'src/i18n/overrides.json',
                        help='Reviewed translations take precedence and prefill missing keys')
    parser.add_argument('--languages', nargs='+', choices=LANGUAGES, default=list(LANGUAGES))
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--batch-chars', type=int, default=1000)
    parser.add_argument('--backend', choices=['browser', 'single'], default='browser',
                        help='Offline authoring backend; never consulted by site/build')
    parser.add_argument('--individual-languages', nargs='*', choices=LANGUAGES, default=[],
                        help='Avoid delimiter recursion for engines that rewrite batch markers')
    args = parser.parse_args()
    BACKEND = args.backend
    strings = read_strings(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    dictionaries: dict[str, dict[str, str]] = {}
    overrides = json.loads(args.overrides.read_text(encoding='utf-8')) if args.overrides.exists() else {}
    jobs: list[tuple[str, list[str]]] = []
    for language in args.languages:
        file = args.output / f'{language}.json'
        dictionaries[language] = json.loads(file.read_text(encoding='utf-8')) if file.exists() else {}
        dictionaries[language].update({key: value for key, value in overrides.get(language, {}).items() if key in strings})
        save(file, dictionaries[language], strings)
        missing = [value for value in strings if not dictionaries[language].get(value)]
        batches = [[value] for value in missing] if language in args.individual_languages else make_batches(missing, args.batch_chars)
        jobs.extend((language, batch) for batch in batches)
    print(f'Generator PID: {os.getpid()}; corpus: {len(strings)} strings; pending: {len(jobs)} batches; concurrency: {min(3, max(1, args.workers))}', flush=True)
    failures: list[str] = []
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(3, max(1, args.workers))) as executor:
        futures = {executor.submit(translate_batch, batch, language): (language, batch) for language, batch in jobs}
        for completed, future in enumerate(concurrent.futures.as_completed(futures), 1):
            language, batch = futures[future]
            try:
                values = future.result()
                dictionaries[language].update(values)
                save(args.output / f'{language}.json', dictionaries[language], strings)
            except Exception as error:
                failures.append(f'{language}: {batch[0][:65]!r}: {error}')
                print('REJECTED ' + failures[-1], flush=True)
                if isinstance(error, RateLimitError):
                    _stop_generation.set()
                    for pending in futures:
                        pending.cancel()
                    break
            if completed % 25 == 0 or completed == len(jobs):
                print(f'{completed}/{len(jobs)} batches; HTTP requests: {_request_count}; elapsed: {time.monotonic()-started:.0f}s; failures: {len(failures)}', flush=True)
    for language, values in dictionaries.items():
        save(args.output / f'{language}.json', values, strings)
        missing = [value for value in strings if not values.get(value)]
        if missing:
            failures.append(f'{language}: {len(missing)} missing translated values')
        for source, translated in values.items():
            if source in strings:
                if Counter(NUMBERS.findall(source)) != Counter(NUMBERS.findall(translated)):
                    failures.append(f'{language}: numeric mismatch in {source[:65]!r}')
                if Counter(PLACEHOLDERS.findall(source)) != Counter(PLACEHOLDERS.findall(translated)):
                    failures.append(f'{language}: placeholder mismatch in {source[:65]!r}')
                if len(RUSSIAN_LETTERS.findall(source)) >= 25:
                    # Shared short nouns, proper names and model codes may be
                    # identical; a whole Russian paragraph must never be used
                    # as a fallback for a missing/failed translation.
                    normalize = lambda value: re.sub(r'[^\w]', '', value.casefold())
                    if normalize(source) == normalize(translated):
                        failures.append(f'{language}: unchanged Russian paragraph in {source[:65]!r}')
    if failures:
        raise TranslationError('\n'.join(failures))
    print('Complete: every requested locale has every source key; numeric values and placeholders preserved.', flush=True)


if __name__ == '__main__':
    main()
