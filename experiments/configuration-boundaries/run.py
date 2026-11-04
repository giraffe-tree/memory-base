"""Run actual upstream configuration/path helpers without starting an LLM/service.

Namespace packages only bypass ReMe's eager package imports. Every function and
schema exercised below is loaded unchanged from the pinned upstream files.
"""
from __future__ import annotations

import importlib
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
import tempfile
import types
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
UPSTREAM = ROOT / 'refernece' / 'ReMe'
PIN = 'd323356e6f11c0faf4bf30fae7a2edc30e18fbb9'
revision = subprocess.check_output(['git', '-C', str(UPSTREAM), 'rev-parse', 'HEAD'], text=True).strip()
if revision != PIN:
    raise SystemExit(f'Expected {PIN}, got {revision}; update evidence explicitly before rerunning.')

# Supply package paths, not replacement implementations. This avoids importing
# unrelated AgentScope/provider backends through package __init__ side effects.
for package in ('reme', 'reme.config', 'reme.utils', 'reme.schema', 'reme.steps', 'reme.steps.file_io'):
    namespace = types.ModuleType(package)
    namespace.__path__ = [str(UPSTREAM.joinpath(*package.split('.')))]
    sys.modules[package] = namespace
os.environ['REME_DISABLE_LOGURU'] = 'true'
logger = importlib.import_module('reme.utils.logger_utils')
sys.modules['reme.utils'].get_logger = logger.get_logger
parser = importlib.import_module('reme.config.config_parser')
path_helpers = importlib.import_module('reme.steps.file_io._path')
schema = importlib.import_module('reme.schema.application_config')

results = []

def case(name, check):
    try:
        details = check()
        results.append({'case': name, 'passed': True, 'observed': details})
    except Exception as error:  # Report all cases, then fail the runner.
        results.append({'case': name, 'passed': False, 'error': f'{type(error).__name__}: {error}'})

def equal(actual, expected):
    assert actual == expected, f'{actual!r} != {expected!r}'
    return actual

def rejects(call, message):
    try:
        call()
    except ValueError as error:
        assert message in str(error), str(error)
        return message
    raise AssertionError('Expected ValueError')

cfg = parser.resolve_app_config(log_config=False)
case('default-keyword-without-vector', lambda: equal(
    [cfg['components']['keyword_index']['default']['backend'], cfg['components']['file_store']['default']['embedding_store']],
    ['bm25', '']))
case('dream-window-and-unit-defaults', lambda: equal(
    [cfg['jobs']['auto_dream']['steps'][0]['scan_days'], cfg['jobs']['auto_dream']['steps'][0]['max_units']], [2, 5]))
case('disable-cron-preserves-manual-job', lambda: equal(
    [schema.ApplicationConfig(**parser.resolve_app_config(log_config=False, **parser.parse_kwargs('jobs.dream_cron.enabled=false'))).jobs[name].enabled
     for name in ('dream_cron', 'auto_dream', 'optimize_index_cron')], [False, True, True]))
case('leading-zero-ID-remains-string', lambda: equal(parser.parse_kwargs('session_id=007')['session_id'], '007'))
case('nested-value-collision-rejected', lambda: rejects(lambda: parser.parse_kwargs('jobs=false', 'jobs.dream_cron.enabled=false'), 'already a value'))
case('undefined-environment-rejected', lambda: rejects(lambda: parser.expand_env_vars('${MEMORY_BASE_EXPERIMENT_UNDEFINED_6F11}'), 'undefined env var'))
case('absolute-session-dir-rejected', lambda: rejects(lambda: schema.ApplicationConfig(session_dir='/tmp/outside'), 'workspace-relative'))

with tempfile.TemporaryDirectory(prefix='memory-base-study-') as temp:
    workspace = (Path(temp) / 'workspace').resolve()
    workspace.mkdir()
    outside = Path(temp) / 'outside'
    outside.mkdir()
    (workspace / 'daily').mkdir()
    (workspace / 'link').symlink_to(outside, target_is_directory=True)
    case('relative-path-stays-in-workspace', lambda: equal(path_helpers.resolve_path(workspace, 'daily/note.md'), (workspace / 'daily/note.md', None))[1])
    case('parent-traversal-rejected', lambda: equal(path_helpers.resolve_path(workspace, '../outside/note.md')[0], None))
    case('symlink-escape-rejected', lambda: equal(path_helpers.resolve_path(workspace, 'link/note.md')[0], None))
    case('empty-allowlist-fails-closed', lambda: equal(path_helpers._check_path_permission(workspace, workspace / 'daily/note.md', []), False))
    case('path-prefix-collision-denied', lambda: equal(path_helpers._check_path_permission(workspace, workspace / 'daily-other/note.md', ['daily']), False))
    case('allowed-directory-descendant-accepted', lambda: equal(path_helpers._check_path_permission(workspace, workspace / 'daily/note.md', ['daily']), True))

report = {
    'revision': revision,
    'executed_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
    'environment': {'python': platform.python_version(), 'platform': platform.system(),
                    'pydantic': importlib.metadata.version('pydantic'), 'PyYAML': importlib.metadata.version('PyYAML')},
    'scope': 'Unchanged upstream configuration parser, public application schema and file-path helpers, imported in isolated namespace packages; no model, no service, no full ReMe dependency installation.',
    'results': results,
    'passed': sum(row['passed'] for row in results),
    'total': len(results),
}
out = Path(__file__).with_name('results.json')
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(0 if report['passed'] == report['total'] else 1)
