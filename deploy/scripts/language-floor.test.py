"""The C/C++ rollback guard, run as rollback.sh runs it, with a stub docker."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parent
TARGET = 'ghcr.io/test/api:sha-' + 'a' * 40

class LanguageFloor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = pathlib.Path(self.tmp.name)
        scripts = self.root / 'scripts'; scripts.mkdir(); (self.root / 'bin').mkdir(); (self.root / 'state').mkdir()
        for name in ('common.sh', 'rollback.sh', 'check-language-floor.sh'):
            shutil.copy(SCRIPTS / name, scripts / name)
        self.current = 'API_IMAGE=ghcr.io/test/api:sha-' + 'b' * 40 + '\n'
        (self.root / 'deployment.env').write_text(self.current)
        (self.root / 'state/previous-deployment.env').write_text(f'API_IMAGE="{TARGET}"\n')
        self.log = self.root / 'events'
        self.env = dict(os.environ, COVE_DEPLOY_ROOT=str(self.root), EVENTS=str(self.log), ROWS='0', HAS_CPP='0')
        self.env.pop('COVE_ROLLBACK_PAST_COMPILED_LANGUAGES', None)
        self.env['PATH'] = str(self.root / 'bin') + os.pathsep + self.env['PATH']
        # `compose exec` prints the row count; `run ... grep` answers whether the image knows CPP.
        docker = self.root / 'bin/docker'
        docker.write_text('''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['EVENTS'], 'a') as f: f.write(json.dumps(args) + '\\n')
if 'exec' in args:
    if os.environ.get('EXEC_FAIL') == '1': sys.exit(2)
    print(os.environ['ROWS'])
elif args[0] == 'run':
    sys.exit(0 if os.environ['HAS_CPP'] == '1' else 1)
'''); docker.chmod(0o700)

    def tearDown(self): self.tmp.cleanup()

    def floor(self, target='state/previous-deployment.env', **env):
        return subprocess.run(['bash', str(self.root / 'scripts/check-language-floor.sh'), str(self.root / target)],
                              env={**self.env, **env}, text=True, capture_output=True)

    def events(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_no_compiled_rows_allows_rollback_without_touching_the_image(self):
        result = self.floor()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(e[0] in ('pull', 'run') for e in self.events()))

    def test_compiled_rows_and_a_target_without_cpp_refuse(self):
        result = self.floor(ROWS='3')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Refusing rollback: 3 C/C++', result.stderr)
        self.assertIn(TARGET, result.stderr)
        run = next(e for e in self.events() if e[0] == 'run')
        # The target image is inspected offline, never started as an API.
        self.assertIn(TARGET, run); self.assertEqual(run[run.index('--network') + 1], 'none')
        self.assertIn(['pull', '--quiet', TARGET], self.events())

    def test_a_target_that_reads_cpp_is_allowed(self):
        self.assertEqual(self.floor(ROWS='3', HAS_CPP='1').returncode, 0)

    def test_an_unreadable_count_refuses_unless_the_operator_checked(self):
        refused = self.floor(EXEC_FAIL='1')
        self.assertEqual(refused.returncode, 1); self.assertIn('yes-I-checked', refused.stderr)
        self.assertEqual(self.floor(EXEC_FAIL='1', COVE_ROLLBACK_PAST_COMPILED_LANGUAGES='yes').returncode, 1)
        self.assertEqual(self.floor(EXEC_FAIL='1', COVE_ROLLBACK_PAST_COMPILED_LANGUAGES='yes-I-checked').returncode, 0)

    def test_a_target_without_an_api_image_is_refused(self):
        (self.root / 'state/empty.env').write_text('WEB_IMAGE=x\n')
        result = self.floor('state/empty.env')
        self.assertEqual(result.returncode, 2); self.assertIn('API_IMAGE', result.stderr)

    def test_rollback_refuses_before_stopping_anything_or_replacing_the_manifest(self):
        result = subprocess.run(['bash', str(self.root / 'scripts/rollback.sh')],
                                env={**self.env, 'ROWS': '1'}, text=True, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(any('stop' in e for e in self.events()))
        self.assertEqual((self.root / 'deployment.env').read_text(), self.current)
        self.assertFalse((self.root / 'state/failed-deployment.env').exists())

if __name__ == '__main__':
    unittest.main()
