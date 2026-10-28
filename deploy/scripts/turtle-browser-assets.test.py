import importlib.util
import json
import pathlib
import tempfile
import unittest
import shutil
import subprocess
import time
import urllib.request

SCRIPTS = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('browser_assets', SCRIPTS / 'turtle-browser-assets.py')
assets = importlib.util.module_from_spec(spec); spec.loader.exec_module(assets)
ARTIFACT = SCRIPTS.parents[1] / 'packages/turtle-browser-runtime/dist'

@unittest.skipUnless((ARTIFACT / 'manifest.json').exists(), 'Build the production runtime package first')
class BrowserAssets(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = pathlib.Path(self.tmp.name)
        self.manifest = json.loads((ARTIFACT / 'manifest.json').read_text()); self.id = self.manifest['id']
        self.env = {'TURTLE_TRIAL_BROWSER_ENABLED':'true', 'TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN':'https://turtle-runtime.coveedu.com', 'TURTLE_TRIAL_BROWSER_RUNTIME_ID':self.id}
    def tearDown(self): self.tmp.cleanup()
    def test_verified_immutable_publish_and_distinct_worker_policy(self):
        destination = self.root / 'assets'; snippet = self.root / 'optional/runtime.caddy'
        self.assertLess(assets.publish(ARTIFACT, destination, self.id, 'https://cs.coveedu.com'), 2 * 1024 * 1024)
        assets.publish(ARTIFACT, destination, self.id, 'https://cs.coveedu.com')
        assets.render(self.env, destination, snippet)
        text = snippet.read_text(); self.assertIn('worker-src \'none\'', text); self.assertIn("script-src 'self' 'unsafe-eval'", text)
        self.assertIn('handle @worker', text); self.assertNotIn('reverse_proxy', text); self.assertIn('method GET HEAD', text)
        (destination / self.id / 'worker.js').write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'hash mismatch'): assets.render(self.env, destination, snippet)
    def test_wrong_parent_version_and_injected_origin_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'parent origin'): assets.publish(ARTIFACT, self.root, self.id, 'https://wrong.example')
        with self.assertRaisesRegex(ValueError, 'ID'): assets.publish(ARTIFACT, self.root, 'brython-3.15.0-' + '0'*20, 'https://cs.coveedu.com')
        for value in ('https://cs.coveedu.com', 'https://runtime.example/path', 'https://runtime.example\n{', 'http://runtime.example'):
            with self.assertRaises(ValueError): assets.render({**self.env, 'TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN':value}, self.root, self.root / 'runtime.caddy')
    def test_default_off_needs_no_dns_or_artifact_and_never_deletes_retained_assets(self):
        sentinel = self.root / 'sentinel'; sentinel.write_text('retained')
        snippet = self.root / 'optional/runtime.caddy'
        assets.render({}, self.root, snippet); self.assertFalse(snippet.exists()); self.assertTrue(sentinel.exists())
        assets.publish(ARTIFACT, self.root, self.id, 'https://cs.coveedu.com')
        assets.render({**self.env, 'TURTLE_TRIAL_BROWSER_ENABLED':'false'}, self.root, snippet)
        self.assertTrue(snippet.exists()); self.assertTrue(sentinel.exists())

    @unittest.skipUnless(shutil.which('docker'), 'Docker is required for effective header verification')
    def test_effective_referrer_and_worker_policies_with_real_production_common(self):
        destination = self.root / 'assets'; snippet = self.root / 'runtime.caddy'
        assets.publish(ARTIFACT, destination, self.id, 'https://cs.coveedu.com')
        assets.render(self.env, destination, snippet)
        production = (SCRIPTS.parent / 'caddy/Caddyfile').read_text()
        start = production.index('(production_common) {')
        end = production.index('\n}\n', start) + 3
        config = self.root / 'Caddyfile'
        config.write_text(production[start:end] + '\n' + snippet.read_text().replace('turtle-runtime.coveedu.com {', ':80 {', 1))
        container = subprocess.check_output([
            'docker', 'run', '--rm', '-d', '--label', 'com.cove.fixture=browser-header-test',
            '--memory=64m', '--cpus=0.25', '--pids-limit=64', '-p', '127.0.0.1::80',
            '-v', str(destination) + ':/srv/turtle-browser:ro',
            '-v', str(config) + ':/etc/caddy/Caddyfile:ro', 'caddy:2.10.0-alpine',
            'caddy', 'run', '--config', '/etc/caddy/Caddyfile',
        ], text=True, timeout=60).strip()
        try:
            binding = subprocess.check_output(['docker', 'port', container, '80/tcp'], text=True, timeout=5).strip()
            base = 'http://' + binding
            for attempt in range(50):
                try:
                    with urllib.request.urlopen(base + '/' + self.id + '/index.html', timeout=1) as response:
                        frame_headers = response.headers
                    break
                except OSError:
                    if attempt == 49: raise
                    time.sleep(.1)
            with urllib.request.urlopen(base + '/' + self.id + '/worker.js', timeout=2) as response:
                worker_headers = response.headers
            for headers in (frame_headers, worker_headers):
                self.assertEqual(headers['Referrer-Policy'], 'no-referrer')
                self.assertEqual(headers['Cross-Origin-Embedder-Policy'], 'require-corp')
                self.assertEqual(headers['Cross-Origin-Resource-Policy'], 'cross-origin')
                self.assertIsNone(headers['Set-Cookie'])
                self.assertIsNone(headers['Server'])
            self.assertNotIn('unsafe-eval', frame_headers['Content-Security-Policy'])
            self.assertIn("worker-src 'none'", worker_headers['Content-Security-Policy'])
        finally:
            subprocess.run(['docker', 'rm', '-f', container], check=True, capture_output=True, timeout=10)

if __name__ == '__main__': unittest.main()
