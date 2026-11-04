"""Reject an unavailable or corrupted scanner before it can be executed."""
import os
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name('install-trivy.sh')


class TrivyInstallTests(unittest.TestCase):
    def run_fake_download(self, body):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            commands = root / 'commands'
            commands.mkdir()
            curl = commands / 'curl'
            curl.write_text('#!/usr/bin/env python3\n' + body)
            curl.chmod(0o755)
            github_path = root / 'github-path'
            github_path.write_text('existing-path\n')
            target = root / 'installed'
            result = subprocess.run(['bash', str(SCRIPT), str(target)],
                                    env=dict(os.environ, PATH=str(commands) + os.pathsep + os.environ['PATH'],
                                             GITHUB_PATH=str(github_path)),
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((target / 'trivy').exists())
            self.assertEqual(github_path.read_text(), 'existing-path\n')

    def test_rejects_tampered_download_before_install(self):
        self.run_fake_download("import pathlib, sys\npathlib.Path(sys.argv[sys.argv.index('--output') + 1]).write_bytes(b'untrusted binary')\n")

    def test_transport_failure_never_installs_or_changes_path(self):
        self.run_fake_download('raise SystemExit(7)\n')


if __name__ == '__main__':
    unittest.main()
