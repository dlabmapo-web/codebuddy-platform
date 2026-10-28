import importlib.util
import json
import pathlib
import tempfile
import unittest

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

if __name__ == '__main__': unittest.main()
