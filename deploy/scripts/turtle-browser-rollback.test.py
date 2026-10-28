"""Exercise real rollback shell ordering with disposable commands/manifests."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parent

class BrowserRollback(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = pathlib.Path(self.tmp.name)
        scripts = self.root / 'scripts'; scripts.mkdir(); (self.root / 'bin').mkdir()
        for name in ('common.sh', 'rollback.sh', 'deploy.sh', 'drain-turtle-browser.sh', 'turtle-browser-drain.mjs'):
            shutil.copy(SCRIPTS / name, scripts / name)
        (self.root / 'state').mkdir()
        self.old = 'API_IMAGE=ghcr.io/test/api:sha-' + 'a'*40 + '\n'
        self.new = 'API_IMAGE=ghcr.io/test/api:sha-' + 'b'*40 + '\n'
        (self.root / 'deployment.env').write_text(self.new)
        (self.root / 'state/previous-deployment.env').write_text(self.old)
        self.log = self.root / 'events'
        self.env = dict(os.environ, COVE_DEPLOY_ROOT=str(self.root), EVENTS=str(self.log))
        self.env['PATH'] = str(self.root / 'bin') + os.pathsep + self.env['PATH']
        docker = self.root / 'bin/docker'
        docker.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
args=sys.argv[1:]
with open(os.environ['EVENTS'],'a') as f: f.write(json.dumps(args)+'\\n')
if args[0]=='inspect': print('sha256:'+'c'*64)
elif 'ps' in args: print('d'*64)
elif 'run' in args:
 for i, arg in enumerate(args):
  if arg=='-f' and pathlib.Path(args[i+1]).name.startswith('browser-drain.'):
   override=json.loads(pathlib.Path(args[i+1]).read_text())
   assert override['services']['api']['image']=='sha256:'+'c'*64
 if os.environ.get('FAIL_DRAIN')=='1': sys.exit(17)
'''); docker.chmod(0o700)
        for name in ('sleep', 'flock'):
            path = self.root / 'bin' / name
            path.write_text('#!/bin/sh\necho "' + name + ' $*" >> "$EVENTS"\n'); path.chmod(0o700)
        for name in ('publish-turtle-browser.sh','wait-healthy.sh','smoke.sh','render-monitoring-config.sh','preflight.sh'):
            path = scripts / name
            path.write_text('#!/bin/sh\necho "' + name + '" >> "$EVENTS"\n' + ('exit "${FAIL_PREFLIGHT:-0}"\n' if name == 'preflight.sh' else ''))
            path.chmod(0o700)
    def tearDown(self): self.tmp.cleanup()
    def run_script(self, name, *args, **env):
        return subprocess.run(['bash', str(self.root/'scripts'/name), *args], env={**self.env, **env}, text=True, capture_output=True)
    def events(self): return self.log.read_text().splitlines()
    def test_help_does_not_connect_or_change_anything(self):
        result = self.run_script('drain-turtle-browser.sh', '--help')
        self.assertEqual(result.returncode, 0); self.assertIn('Usage:', result.stdout)
        self.assertFalse(self.log.exists())
    def test_unknown_arguments_do_not_revoke_grants(self):
        result = self.run_script('drain-turtle-browser.sh', '--not-a-real-option')
        self.assertNotEqual(result.returncode, 0); self.assertFalse(self.log.exists())
    def test_manual_rollback_drains_and_waits_before_replacing_manifest_or_starting_old_api(self):
        result = self.run_script('rollback.sh'); self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events(); drain = next(i for i,e in enumerate(events) if '"run"' in e)
        wait = events.index('sleep 31'); up = next(i for i,e in enumerate(events) if '"up"' in e)
        self.assertLess(drain, wait); self.assertLess(wait, events.index('publish-turtle-browser.sh')); self.assertLess(wait, up)
        self.assertEqual((self.root/'deployment.env').read_text(), self.old)
    def test_failed_drain_never_starts_an_unaware_api(self):
        result = self.run_script('rollback.sh', FAIL_DRAIN='1'); self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any('"up"' in e for e in self.events()))
        self.assertEqual((self.root/'deployment.env').read_text(), self.new)
    def test_automatic_rollback_uses_installed_image_even_when_candidate_preflight_fails(self):
        (self.root/'deployment.env').write_text(self.old); candidate = self.root/'candidate.env'; candidate.write_text(self.new)
        result = self.run_script('deploy.sh', str(candidate), FAIL_PREFLIGHT='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root/'deployment.env').read_text(), self.old)
        events = self.events(); self.assertLess(events.index('sleep 31'), next(i for i,e in enumerate(events) if '"up"' in e))
    def test_automatic_rollback_stops_before_old_manifest_on_drain_failure(self):
        (self.root/'deployment.env').write_text(self.old); candidate = self.root/'candidate.env'; candidate.write_text(self.new)
        result = self.run_script('deploy.sh', str(candidate), FAIL_PREFLIGHT='1', FAIL_DRAIN='1')
        self.assertNotEqual(result.returncode, 0); self.assertIn('rollback stopped', result.stderr)
        self.assertFalse(any('"up"' in e for e in self.events()))
        self.assertEqual((self.root/'deployment.env').read_text(), self.new)

if __name__ == '__main__': unittest.main()
