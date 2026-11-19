"""The multi-file C/C++ rollback guard, run as rollback.sh runs it, with a stub docker."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parent
TARGET = 'ghcr.io/test/api:sha-' + 'a' * 40

class ProjectFloor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = pathlib.Path(self.tmp.name)
        scripts = self.root / 'scripts'; scripts.mkdir(); (self.root / 'bin').mkdir(); (self.root / 'state').mkdir()
        for name in ('common.sh', 'rollback.sh', 'check-language-floor.sh', 'check-project-floor.sh'):
            shutil.copy(SCRIPTS / name, scripts / name)
        self.current = 'API_IMAGE=ghcr.io/test/api:sha-' + 'b' * 40 + '\n'
        (self.root / 'deployment.env').write_text(self.current)
        (self.root / 'state/previous-deployment.env').write_text(f'API_IMAGE="{TARGET}"\n')
        self.log = self.root / 'events'
        self.env = dict(os.environ, COVE_DEPLOY_ROOT=str(self.root), EVENTS=str(self.log), ROWS='0', HAS_PROJECTS='0')
        self.env.pop('COVE_ROLLBACK_PAST_SOURCE_PROJECTS', None)
        self.env['PATH'] = str(self.root / 'bin') + os.pathsep + self.env['PATH']
        # `compose exec` prints the row count; `run ... grep` answers whether the image knows source_project.
        docker = self.root / 'bin/docker'
        docker.write_text('''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['EVENTS'], 'a') as f: f.write(json.dumps(args) + '\\n')
if 'exec' in args:
    if os.environ.get('EXEC_FAIL') == '1': sys.exit(2)
    # The language floor's count first, then this one's.
    script = args[-1]
    print(os.environ['ROWS'] if 'source_project' in script else '0')
elif args[0] == 'run':
    sys.exit(0 if os.environ['HAS_PROJECTS'] == '1' else 1)
'''); docker.chmod(0o700)

    def tearDown(self): self.tmp.cleanup()

    def floor(self, target='state/previous-deployment.env', **env):
        return subprocess.run(['bash', str(self.root / 'scripts/check-project-floor.sh'), str(self.root / target)],
                              env={**self.env, **env}, text=True, capture_output=True)

    def events(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_no_projects_allow_rollback_without_touching_the_image(self):
        result = self.floor()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(e[0] in ('pull', 'run') for e in self.events()))

    def test_projects_and_a_target_that_predates_them_refuse(self):
        result = self.floor(ROWS='2')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Refusing rollback: 2 multi-file', result.stderr)
        run = next(e for e in self.events() if e[0] == 'run')
        self.assertIn(TARGET, run); self.assertEqual(run[run.index('--network') + 1], 'none')
        self.assertIn('source_project', run)

    def test_the_count_reads_projects_and_version_six_submissions_on_any_schema(self):
        self.floor(ROWS='1', HAS_PROJECTS='1')
        count = next(e for e in self.events() if 'exec' in e)
        self.assertTrue(any("to_jsonb(pe) -> \\x27source_project\\x27" in arg for arg in count))
        self.assertTrue(any("grading_policy_snapshot ->> \\x27version\\x27 = \\x276\\x27" in arg for arg in count))

    def test_a_target_that_reads_projects_is_allowed(self):
        self.assertEqual(self.floor(ROWS='2', HAS_PROJECTS='1').returncode, 0)

    def test_an_unreadable_count_refuses_unless_the_operator_checked(self):
        refused = self.floor(EXEC_FAIL='1')
        self.assertEqual(refused.returncode, 1); self.assertIn('yes-I-checked', refused.stderr)
        self.assertEqual(self.floor(EXEC_FAIL='1', COVE_ROLLBACK_PAST_SOURCE_PROJECTS='yes-I-checked').returncode, 0)

    def test_rollback_refuses_before_stopping_anything(self):
        result = subprocess.run(['bash', str(self.root / 'scripts/rollback.sh')],
                                env={**self.env, 'ROWS': '1'}, text=True, capture_output=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('multi-file', result.stderr)
        self.assertFalse(any('stop' in e for e in self.events()))
        self.assertEqual((self.root / 'deployment.env').read_text(), self.current)

if __name__ == '__main__':
    unittest.main()
