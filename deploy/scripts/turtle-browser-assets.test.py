import importlib.util
import json
import pathlib
import tempfile
import unittest
import shutil
import subprocess
import time
import urllib.error
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

    def test_precompressed_copies_are_published_verified_and_served_by_caddy(self):
        destination = self.root / 'assets'; snippet = self.root / 'runtime.caddy'
        declared = self.manifest['encodings']
        self.assertTrue({'brython.js.br', 'brython.js.gz', 'brython_stdlib.js.br', 'brython_stdlib.js.gz'} <= set(declared))
        assets.publish(ARTIFACT, destination, self.id, 'https://cs.coveedu.com')
        assets.render(self.env, destination, snippet)
        served = destination / assets.PRECOMPRESSED / self.id
        self.assertEqual({p.name for p in served.iterdir()}, assets.FILES | set(declared))
        # Earlier releases verify the plain directory as exactly FILES; a rollback must still pass.
        self.assertEqual({p.name for p in (destination / self.id).iterdir()}, assets.FILES)
        for name, entry in declared.items():
            if entry['encoding'] == 'gz':
                self.assertEqual(assets.gzip.decompress((served / name).read_bytes()), (served / entry['source']).read_bytes())
        text = snippet.read_text()
        self.assertIn('root * /srv/turtle-browser/precompressed', text)
        self.assertEqual(text.count('precompressed br gzip'), 2)
        (served / 'brython_stdlib.js.gz').write_bytes(assets.gzip.compress(b'print("not the engine")'))
        with self.assertRaisesRegex(ValueError, 'hash mismatch'): assets.render(self.env, destination, snippet)

    def test_a_forged_copy_or_stray_file_fails_closed(self):
        artifact = self.root / 'artifact'; shutil.copytree(ARTIFACT, artifact)
        forged = assets.gzip.compress(b'alert(1)')
        manifest = json.loads((artifact / 'manifest.json').read_text())
        (artifact / self.id / 'worker.js.gz').write_bytes(forged)
        manifest['encodings']['worker.js.gz'].update(sha256=assets.sha256(forged), bytes=len(forged))
        (artifact / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'does not match its asset'):
            assets.publish(artifact, self.root / 'assets', self.id, 'https://cs.coveedu.com')
        shutil.rmtree(artifact); shutil.copytree(ARTIFACT, artifact)
        (artifact / self.id / 'secrets.env.gz').write_bytes(b'x')
        with self.assertRaisesRegex(ValueError, 'Unexpected files'):
            assets.publish(artifact, self.root / 'assets', self.id, 'https://cs.coveedu.com')
        bad = {**self.manifest, 'encodings': {'../index.html.gz': {'source': 'index.html', 'encoding': 'gz', 'sha256': '0' * 64, 'bytes': 1}}}
        with self.assertRaisesRegex(ValueError, 'encodings'): assets.encodings(bad)

    def test_a_version_live_before_compressed_copies_is_upgraded_in_place_and_can_roll_back(self):
        destination = self.root / 'assets'; snippet = self.root / 'runtime.caddy'
        plain = {k: v for k, v in self.manifest.items() if k != 'encodings'}
        # What the previous release left on the server: plain files and a manifest without encodings.
        destination.mkdir(); shutil.copytree(ARTIFACT / self.id, destination / self.id, ignore=lambda _, names: [n for n in names if n not in assets.FILES])
        (destination / '.manifests').mkdir(); (destination / '.manifests' / (self.id + '.json')).write_text(json.dumps(plain))
        assets.render(self.env, destination, snippet)
        served = destination / assets.PRECOMPRESSED / self.id
        self.assertEqual({p.name for p in served.iterdir()}, assets.FILES)
        assets.publish(ARTIFACT, destination, self.id, 'https://cs.coveedu.com')
        self.assertEqual({p.name for p in served.iterdir()}, assets.FILES | set(self.manifest['encodings']))
        # Re-publishing an image built without compressed copies retires them.
        artifact = self.root / 'artifact'; shutil.copytree(ARTIFACT, artifact, ignore=lambda _, names: [n for n in names if assets.ENCODED.fullmatch(n)])
        (artifact / 'manifest.json').write_text(json.dumps(plain))
        assets.publish(artifact, destination, self.id, 'https://cs.coveedu.com')
        self.assertEqual({p.name for p in served.iterdir()}, assets.FILES)
        assets.render(self.env, destination, snippet)
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
            # The verified copies go out byte for byte: the proxy compresses nothing.
            served = destination / assets.PRECOMPRESSED / self.id
            for name in ('brython_stdlib.js', 'worker.js'):
                for accept, encoding, suffix in (('br, gzip, zstd', 'br', '.br'), ('gzip', 'gzip', '.gz'), ('identity', None, '')):
                    request = urllib.request.Request(base + '/' + self.id + '/' + name, headers={'Accept-Encoding': accept})
                    with urllib.request.urlopen(request, timeout=5) as response:
                        body = response.read()
                        self.assertEqual(response.headers['Content-Encoding'], encoding, (name, accept))
                        self.assertEqual(body, (served / (name + suffix)).read_bytes(), (name, accept))
                        self.assertIn('Accept-Encoding', response.headers.get('Vary', ''), (name, accept))
                        self.assertEqual(response.headers['Cache-Control'], 'public, max-age=31536000, immutable')
            with self.assertRaises(urllib.error.HTTPError) as missing:
                urllib.request.urlopen(base + '/' + self.id + '/brython.js.br', timeout=2)
            self.assertEqual(missing.exception.code, 404)  # Copies are only reachable through negotiation.
        finally:
            subprocess.run(['docker', 'rm', '-f', container], check=True, capture_output=True, timeout=10)

if __name__ == '__main__': unittest.main()
