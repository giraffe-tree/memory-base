"""Execute unchanged Mem0 scoring and SQLite modules with stdlib-only fixtures.

No Memory/AsyncMemory construction, provider import, model call or network I/O.
"""
from __future__ import annotations

import copy
import importlib.util
import json
import math
import platform
import sqlite3
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
UPSTREAM = ROOT / 'refernece/mem0'
PIN = 'ed1f10fc87080f0b67f99be370817504888462ab'
MODULES = ('mem0/utils/scoring.py', 'mem0/memory/storage.py')
revision = subprocess.check_output(['git', '-C', str(UPSTREAM), 'rev-parse', 'HEAD'], text=True).strip()
if revision != PIN:
    raise SystemExit(f'Expected {PIN}, got {revision}')
subprocess.run(['git', '-C', str(UPSTREAM), 'diff', '--exit-code', 'HEAD', '--', *MODULES], check=True)


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, UPSTREAM / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


scoring = load('mem0_study_scoring', MODULES[0])
storage = load('mem0_study_storage', MODULES[1])
results = []


def case(name, check):
    try:
        observed = check()
        results.append({'case': name, 'passed': True, 'observed': observed})
    except Exception as error:
        results.append({'case': name, 'passed': False, 'error': f'{type(error).__name__}: {error}'})


def equal(actual, expected):
    assert actual == expected, f'{actual!r} != {expected!r}'
    return actual


def close(actual, expected):
    assert math.isclose(actual, expected, rel_tol=1e-10), f'{actual!r} != {expected!r}'
    return actual


def rank(candidates, bm25=None, entities=None, threshold=0.1, top_k=10, explain=False):
    return scoring.score_and_rank(candidates, bm25 or {}, entities or {}, threshold, top_k, explain)


case('bm25-midpoint-normalizes-to-half', lambda: close(scoring.normalize_bm25(5.0, 5.0, 0.7), 0.5))
case('query-length-parameters-without-NLP', lambda: equal(
    [scoring.get_bm25_params('', lemmatized='one two'), scoring.get_bm25_params('', lemmatized='one two three four')],
    [(5.0, 0.7), (7.0, 0.6)]))
case('semantic-threshold-gates-before-boosts', lambda: equal(
    rank([{'id': 'below', 'score': 0.09}], {'below': 1.0}, {'below': 0.5}), []))
case('keyword-only-ID-not-added-as-candidate', lambda: equal(
    [row['id'] for row in rank([{'id': 'semantic', 'score': 0.8}], {'keyword-only': 1.0})], ['semantic']))
case('semantic-only-score-unchanged', lambda: close(rank([{'id': 'a', 'score': 0.8}])[0]['score'], 0.8))
case('three-signal-score-normalized', lambda: close(
    rank([{'id': 'a', 'score': 0.8}], {'a': 0.6}, {'a': 0.5})[0]['score'], 0.76))
case('keyword-signal-changes-ranking', lambda: equal(
    [row['id'] for row in rank([{'id': 'a', 'score': 0.4}, {'id': 'b', 'score': 0.9}], {'a': 1.0})], ['a', 'b']))
case('active-signal-map-changes-denominator', lambda: close(
    rank([{'id': 'a', 'score': 0.8}], {'other': 1.0})[0]['score'], 0.4))
case('top-k-limits-results', lambda: equal(
    len(rank([{'id': 'a', 'score': 0.8}, {'id': 'b', 'score': 0.7}], top_k=1)), 1))


def explain_and_preserve():
    original = [{'id': 'a', 'score': 0.8, 'payload': {'data': 'synthetic project fact'}}]
    before = copy.deepcopy(original)
    ranked = rank(original, {'a': 0.6}, {'a': 0.5}, explain=True)
    equal(original, before)
    return equal(ranked[0]['score_details']['max_possible_score'], 2.5)


case('explain-scores-without-mutating-input', explain_and_preserve)

with tempfile.TemporaryDirectory(prefix='memory-base-mem0-') as temp:
    db_path = str(Path(temp) / 'history.db')
    db = storage.SQLiteManager(db_path)
    try:
        db.add_history('project-fact', None, 'Python', 'ADD', created_at='2026-11-03T10:00:00+00:00')
        db.add_history('project-fact', 'Python', 'Rust', 'UPDATE', created_at='2026-11-04T10:00:00+00:00')
        db.add_history('project-fact', 'Rust', None, 'DELETE', created_at='2026-11-04T11:00:00+00:00', is_deleted=1)
        case('history-keeps-add-update-delete-sequence', lambda: equal(
            [row['event'] for row in db.get_history('project-fact')], ['ADD', 'UPDATE', 'DELETE']))
        case('deleted-history-retains-old-memory', lambda: equal(
            [db.get_history('project-fact')[-1]['old_memory'], db.get_history('project-fact')[-1]['is_deleted']], ['Rust', True]))

        def batch_rollback():
            try:
                db.batch_add_history([
                    {'memory_id': 'rollback-probe', 'new_memory': 'valid', 'event': 'ADD'},
                    {'memory_id': 'rollback-probe', 'new_memory': {'not': 'sqlite text'}, 'event': 'ADD'},
                ])
            except sqlite3.ProgrammingError:
                return equal(len(db.get_history('rollback-probe')), 0)
            raise AssertionError('Expected parameter-binding failure')

        case('sqlite-history-batch-failure-rolls-back', batch_rollback)
        # The messages intentionally share a timestamp in this single save.
        # Check capacity, not which tied rows win the cutoff.
        db.save_messages([{'role': 'user', 'content': f'alpha-{i}'} for i in range(12)], 'alpha')
        db.save_messages([{'role': 'user', 'content': 'beta-only'}], 'beta')
        case('recent-message-cache-capped-at-ten', lambda: equal(len(db.get_last_messages('alpha', limit=100)), 10))
        case('message-scopes-kept-separate', lambda: equal(
            [row['content'] for row in db.get_last_messages('beta')], ['beta-only']))
        db.save_messages([{'role': 'user', 'content': 'beta-only'}], 'beta')
        case('message-save-appends-identical-content', lambda: equal(len(db.get_last_messages('beta')), 2))
    finally:
        db.close()
    restarted = storage.SQLiteManager(db_path)
    try:
        case('history-and-cache-survive-reopen', lambda: equal(
            [len(restarted.get_history('project-fact')), len(restarted.get_last_messages('alpha', limit=100))], [3, 10]))
    finally:
        restarted.close()

report = {
    'revision': revision,
    'executed_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
    'environment': {'python': platform.python_version(), 'platform': platform.system(), 'sqlite': sqlite3.sqlite_version},
    'scope': 'Direct unchanged imports of scoring.py and storage.py; explicit synthetic ranking signals and temporary SQLite DB. No providers, model, telemetry, NLP model loading, Memory construction, vector backend or hosted service.',
    'results': results,
    'passed': sum(row['passed'] for row in results),
    'total': len(results),
}
Path(__file__).with_name('results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(0 if report['passed'] == report['total'] else 1)
