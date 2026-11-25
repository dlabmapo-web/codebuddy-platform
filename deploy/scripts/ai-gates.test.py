"""The AI assistant rollback guard, run as rollback.sh runs it, with a stub docker."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parent
TARGET = 'ghcr.io/test/api:sha-' + 'a' * 40

class AiGates(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = pathlib.Path(self.tmp.name)
        scripts = self.root / 'scripts'; scripts.mkdir(); (self.root / 'bin').mkdir(); (self.root / 'state').mkdir()
        for name in ('common.sh', 'rollback.sh', 'check-language-floor.sh', 'check-project-floor.sh', 'clear-ai-gates.sh'):
            shutil.copy(SCRIPTS / name, scripts / name)
        self.current = 'API_IMAGE=ghcr.io/test/api:sha-' + 'b' * 40 + '\n'
        (self.root / 'deployment.env').write_text(self.current)
        (self.root / 'state/previous-deployment.env').write_text(f'API_IMAGE="{TARGET}"\n')
        self.log = self.root / 'events'
        self.env = dict(os.environ, COVE_DEPLOY_ROOT=str(self.root), EVENTS=str(self.log), ROWS='0', CLEARED='0', HAS_AI='0')
        self.env.pop('COVE_ROLLBACK_PAST_AI_ASSISTANT', None)
        self.env['PATH'] = str(self.root / 'bin') + os.pathsep + self.env['PATH']
        # Only the AI guard's queries see ROWS; the other floors count nothing.
        docker = self.root / 'bin/docker'
        docker.write_text('''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['EVENTS'], 'a') as f: f.write(json.dumps(args) + '\\n')
if 'exec' in args:
    if not any('AI_ASSISTANT' in arg for arg in args): print('0'); sys.exit(0)
    clear = args[-1] == 'clear'
    if os.environ.get('FAIL_' + ('CLEAR' if clear else 'COUNT')) == '1': sys.exit(2)
    print(os.environ['CLEARED' if clear else 'ROWS'])
elif args[0] == 'run':
    sys.exit(0 if os.environ['HAS_AI'] == '1' else 1)
'''); docker.chmod(0o700)

    def tearDown(self): self.tmp.cleanup()

    def guard(self, target='state/previous-deployment.env', **env):
        return subprocess.run(['bash', str(self.root / 'scripts/clear-ai-gates.sh'), str(self.root / target)],
                              env={**self.env, **env}, text=True, capture_output=True)

    def events(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def cleared(self):
        return [e for e in self.events() if 'exec' in e and e[-1] == 'clear']

    def test_no_switches_allow_rollback_without_touching_the_image(self):
        result = self.guard()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(e[0] in ('pull', 'run') for e in self.events()))
        self.assertEqual(self.cleared(), [])

    def test_a_target_that_reads_the_value_keeps_the_switches(self):
        result = self.guard(ROWS='2', HAS_AI='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.cleared(), [])
        run = next(e for e in self.events() if e[0] == 'run')
        # The target image is inspected offline, never started as an API.
        self.assertIn(TARGET, run); self.assertEqual(run[run.index('--network') + 1], 'none')
        self.assertIn("AI_ASSISTANT: 'AI_ASSISTANT'", run)

    def test_an_older_target_switches_ai_off_and_says_so(self):
        result = self.guard(ROWS='2', CLEARED='2')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.cleared()), 1)
        self.assertIn('Switched the AI assistant off (2 academy rows)', result.stderr)
        self.assertIn(['pull', '--quiet', TARGET], self.events())

    def test_a_failed_clear_refuses(self):
        result = self.guard(ROWS='1', FAIL_CLEAR='1')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Refusing rollback', result.stderr)

    def test_an_unreadable_count_refuses_unless_the_operator_checked(self):
        refused = self.guard(FAIL_COUNT='1')
        self.assertEqual(refused.returncode, 1); self.assertIn('yes-I-checked', refused.stderr)
        self.assertEqual(self.guard(FAIL_COUNT='1', COVE_ROLLBACK_PAST_AI_ASSISTANT='yes').returncode, 1)
        self.assertEqual(self.guard(FAIL_COUNT='1', COVE_ROLLBACK_PAST_AI_ASSISTANT='yes-I-checked').returncode, 0)

    def test_a_target_without_an_api_image_is_refused(self):
        (self.root / 'state/empty.env').write_text('WEB_IMAGE=x\n')
        result = self.guard('state/empty.env')
        self.assertEqual(result.returncode, 2); self.assertIn('API_IMAGE', result.stderr)

    def test_rollback_runs_the_guard_before_stopping_anything(self):
        result = subprocess.run(['bash', str(self.root / 'scripts/rollback.sh')],
                                env={**self.env, 'FAIL_COUNT': '1'}, text=True, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('COVE_ROLLBACK_PAST_AI_ASSISTANT', result.stderr)
        self.assertFalse(any('stop' in e for e in self.events()))
        self.assertEqual((self.root / 'deployment.env').read_text(), self.current)

if __name__ == '__main__':
    unittest.main()
