"""The production Studio proxy holds a request through a brief outage instead
of answering 502. A class opening /turtle together once got 502s for page
scripts, which left those students on a page with no PIN box.
"""
import pathlib
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CADDY = 'caddy:2.10.0-alpine'

def studio_block():
    text = (ROOT / 'caddy/Caddyfile').read_text()
    site = text.index('cs.coveedu.com {')
    start = text.index('\thandle {\n\t\treverse_proxy studio:3000 {', site)
    end = text.index('\n\t}\n', start) + 4
    return text[start:end]

def docker(*args, check=True):
    return subprocess.run(['docker', *args], check=check, capture_output=True, text=True, timeout=120).stdout.strip()

@unittest.skipUnless(shutil.which('docker'), 'Docker is required to exercise the real proxy')
class StudioRetry(unittest.TestCase):
    def setUp(self):
        self.name = 'cove-retry-' + secrets.token_hex(4)
        self.tmp = tempfile.TemporaryDirectory()
        config = pathlib.Path(self.tmp.name) / 'Caddyfile'
        config.write_text('{\n\tadmin off\n\tauto_https off\n}\n:80 {\n' + studio_block() + '}\n')
        docker('network', 'create', '--label', 'com.cove.fixture=studio-retry', self.name)
        self.proxy = docker('run', '-d', '--rm', '--label', 'com.cove.fixture=studio-retry', '--network', self.name,
                            '-p', '127.0.0.1::80', '-v', f'{config}:/etc/caddy/Caddyfile:ro', CADDY,
                            'caddy', 'run', '--config', '/etc/caddy/Caddyfile')
        self.base = 'http://' + docker('port', self.proxy, '80/tcp').splitlines()[0]
        self.studio = None; self.timer = None

    def tearDown(self):
        if self.timer: self.timer.cancel(); self.timer.join()
        for container in (self.studio, self.proxy):
            if container: docker('rm', '-f', container, check=False)
        docker('network', 'rm', self.name, check=False)
        self.tmp.cleanup()

    def start_studio(self):
        self.studio = docker('run', '-d', '--rm', '--label', 'com.cove.fixture=studio-retry', '--network', self.name,
                             '--network-alias', 'studio', CADDY, 'caddy', 'respond', '--listen', ':3000', '--body', 'studio ok')

    def get(self, path, timeout=20):
        try:
            with urllib.request.urlopen(self.base + path, timeout=timeout) as response:
                return response.status, response.read().decode()
        except urllib.error.HTTPError as error:
            return error.code, ''

    def wait_for_proxy(self):
        # Not by requesting: with Studio down, that request is exactly what waits.
        for _ in range(100):
            logs = subprocess.run(['docker', 'logs', self.proxy], capture_output=True, text=True, timeout=10)
            if 'serving initial configuration' in logs.stdout + logs.stderr: return
            time.sleep(.1)
        self.fail('proxy never started')

    def test_a_page_script_requested_during_a_studio_blip_still_loads(self):
        self.wait_for_proxy()
        self.timer = threading.Timer(2.0, self.start_studio); self.timer.start()
        began = time.monotonic()
        status, body = self.get('/_next/static/chunks/webpack.js')
        self.assertEqual((status, body), (200, 'studio ok'))
        self.assertGreater(time.monotonic() - began, 1.5)  # It waited for Studio rather than failing fast.

    def test_a_studio_that_stays_down_is_reported_within_the_retry_window(self):
        self.wait_for_proxy()
        began = time.monotonic()
        status, _ = self.get('/turtle', timeout=30)
        self.assertEqual(status, 502)
        self.assertLess(time.monotonic() - began, 15)

if __name__ == '__main__': unittest.main()
