"""Exercise release/profile selection without credentials or a Docker daemon."""
import json
import importlib.util
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parent
SHA = "a" * 40
DIGEST = "b" * 64


class LearningRolloutTests(unittest.TestCase):
    def test_dlab_preflight_matches_manifest_override_without_changing_secrets(self):
        spec = importlib.util.spec_from_file_location("dlab_config", SCRIPTS / "check-dlab-config.py")
        checker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(checker)
        api = {"DLAB_OS_BASE_URL": "https://dlab-os.onrender.com/v1", "DLAB_SSO_ENABLED": "false"}
        before = dict(api)
        checker.check(api, {"DLAB_SSO_ENABLED": "false"}, {"DLAB_OS_BASE_URL": "https://os.dlabcampus.com/v1"})
        self.assertEqual(api, before)
        with self.assertRaisesRegex(ValueError, "DLAB_OS_BASE_URL"):
            checker.check(api, {"DLAB_SSO_ENABLED": "false"}, {})

    def test_release_sync_preserves_server_owned_runtime_data(self):
        workflow = (SCRIPTS.parents[1] / ".github/workflows/release-v2.yml").read_text()
        commands = workflow.split('          rsync ')[1:]
        root_command = commands[0].split('          rsync ')[0].split('\n          ssh ')[0]
        self.assertNotIn('--delete', root_command)
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / 'source'
            destination = pathlib.Path(directory) / 'destination'
            source.mkdir()
            destination.mkdir()
            (source / 'compose.production.yml').write_text('new assets')
            for name in ('state', 'video-scratch'):
                (destination / name).mkdir()
                (destination / name / 'sentinel').write_text('server data')
            subprocess.run(['rsync', '-az', str(source) + '/', str(destination) + '/'], check=True)
            self.assertEqual((destination / 'compose.production.yml').read_text(), 'new assets')
            for name in ('state', 'video-scratch'):
                self.assertEqual((destination / name / 'sentinel').read_text(), 'server data')

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        (self.root / "secrets").mkdir()
        for name in ("common.sh", "set-v2-release.sh", "pin-gui-runtime.sh"):
            shutil.copy(SCRIPTS / name, self.root / "scripts" / name)
        self.env = dict(os.environ, COVE_DEPLOY_ROOT=str(self.root))
        self.manifest = self.root / "deployment.env"
        self.manifest.write_text("\n".join(f"{key}_IMAGE=ghcr.io/acme/old:sha-{SHA}" for key in ("HOME", "STUDIO", "API", "JUDGE", "MIGRATION", "MVP")) + "\n")
        fake = self.root / "docker"
        fake.write_text("#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n")
        fake.chmod(0o700)
        self.env["PATH"] = str(self.root) + os.pathsep + self.env["PATH"]

    def tearDown(self):
        self.temporary.cleanup()

    def run_script(self, name, *args, check=True):
        return subprocess.run(["bash", str(self.root / "scripts" / name), *args], env=self.env, capture_output=True, text=True, check=check)

    def compose_arguments(self):
        result = subprocess.run(["bash", "-c", 'source "$COVE_DEPLOY_ROOT/scripts/common.sh"; compose ps'], env=self.env, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def test_older_release_has_no_learning_profiles_even_if_secret_file_has_flags(self):
        (self.root / "secrets" / "api.env").write_text("GUI_ENABLED=true\nVIDEO_LESSONS_ENABLED=true\n")
        self.assertNotIn("--profile", self.compose_arguments())

    def test_manifest_enables_both_runtimes_and_preserves_command_arguments(self):
        with self.manifest.open("a") as output:
            output.write('GUI_ENABLED="true"\nVIDEO_LESSONS_ENABLED=true\n')
        args = self.compose_arguments()
        profiles = [args[i + 1] for i, item in enumerate(args) if item == "--profile"]
        self.assertEqual(profiles, ["video", "gui"])
        self.assertEqual(args[-1], "ps")

    def test_release_adds_worker_images_and_matching_flags_without_changing_mvp(self):
        deploy = self.root / "scripts" / "deploy.sh"
        deploy.write_text('#!/usr/bin/env bash\ncp "$1" "$COVE_DEPLOY_ROOT/candidate.env"\n')
        deploy.chmod(0o700)
        previous = self.manifest.read_text()
        self.run_script("set-v2-release.sh", "ghcr.io/acme", "sha-" + SHA, "true", "true", "true", "true")
        candidate = (self.root / "candidate.env").read_text()
        for image in ("VIDEO_WORKER", "GUI_SERVICE", "GUI_RUNTIME"):
            self.assertIn(f"{image}_IMAGE=ghcr.io/acme/cove-", candidate)
        for flag in ("GUI", "SHORT_ANSWER", "MULTIPLE_CHOICE", "VIDEO_LESSONS"):
            self.assertIn(f"{flag}_ENABLED=true", candidate)
        self.assertIn(f"MVP_IMAGE=ghcr.io/acme/old:sha-{SHA}", candidate)
        self.assertIn("DLAB_OS_BASE_URL=https://os.dlabcampus.com/v1", candidate)
        self.assertEqual(self.manifest.read_text(), previous)

    def test_invalid_flag_does_not_deploy_or_replace_active_manifest(self):
        previous = self.manifest.read_text()
        result = self.run_script("set-v2-release.sh", "ghcr.io/acme", "sha-" + SHA, "not-a-boolean", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("GUI_ENABLED must be true or false", result.stderr)
        self.assertEqual(self.manifest.read_text(), previous)

    def test_rollback_does_not_require_disabled_runtime_environments(self):
        result = subprocess.run(["bash", "-c", 'source "$COVE_DEPLOY_ROOT/scripts/common.sh"; stop_learning_services'], env=self.env, capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout, "")

    def test_rollback_bounds_shutdown_of_enabled_runtimes(self):
        with self.manifest.open("a") as output:
            output.write("GUI_ENABLED=true\nVIDEO_LESSONS_ENABLED=true\n")
        result = subprocess.run(["bash", "-c", 'source "$COVE_DEPLOY_ROOT/scripts/common.sh"; stop_learning_services'], env=self.env, capture_output=True, text=True, check=True)
        commands = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([command[-1] for command in commands], ["gui-service", "video-worker"])
        self.assertTrue(all(command[-4:-1] == ["stop", "--timeout", "30"] for command in commands))

    def prepare_deployment_fixture(self):
        for name in ("deploy.sh", "rollback.sh"):
            shutil.copy(SCRIPTS / name, self.root / "scripts" / name)
        # Browser hooks have their own real-script ordering/Redis suites. These
        # fixtures exercise the pre-existing API-before-web release contract.
        for name in ("render-monitoring-config.sh", "preflight.sh", "wait-healthy.sh", "smoke.sh", "publish-turtle-browser.sh", "drain-turtle-browser.sh"):
            script = self.root / "scripts" / name
            script.write_text("#!/bin/sh\nexit 0\n")
            script.chmod(0o700)
        (self.root / "flock").write_text("#!/bin/sh\nexit 0\n")
        (self.root / "flock").chmod(0o700)
        (self.root / "docker").write_text(r"""#!/usr/bin/env python3
import json, os, pathlib, sys
root = pathlib.Path(os.environ['COVE_DEPLOY_ROOT'])
args = sys.argv[1:]
manifest = (root / 'deployment.env').read_text()
with (root / 'calls.jsonl').open('a') as output:
    output.write(json.dumps({'args': args, 'candidate': 'new-api' in manifest}) + '\n')
if os.environ.get('FAIL_API') and '--wait' in args:
    sys.exit(42)
if os.environ.get('FAIL_APP') and args[-3:] == ['up', '-d', '--remove-orphans'] and 'new-api' in manifest:
    sys.exit(43)
""")
        self.candidate = self.root / "new.env"
        self.candidate.write_text(self.manifest.read_text().replace("API_IMAGE=ghcr.io/acme/old", "API_IMAGE=ghcr.io/acme/new-api"))
        self.previous_manifest = self.manifest.read_text()

    def deployment_calls(self):
        return [json.loads(line) for line in (self.root / "calls.jsonl").read_text().splitlines()]

    def test_deployment_waits_for_api_before_replacing_web(self):
        self.prepare_deployment_fixture()
        self.run_script("deploy.sh", str(self.candidate))
        calls = self.deployment_calls()
        api = next(i for i, call in enumerate(calls) if '--wait' in call['args'])
        app = next(i for i, call in enumerate(calls) if call['args'][-3:] == ['up', '-d', '--remove-orphans'])
        self.assertLess(api, app)
        self.assertEqual(calls[api]['args'][-1], 'api')
        self.assertEqual((self.root / 'state/current-deployment.env').read_text(), self.candidate.read_text())

    def test_api_failure_does_not_start_new_web_and_restores_manifest(self):
        self.prepare_deployment_fixture()
        self.env['FAIL_API'] = '1'
        result = self.run_script("deploy.sh", str(self.candidate), check=False)
        self.assertEqual(result.returncode, 42)
        self.assertEqual(self.manifest.read_text(), self.previous_manifest)
        app_starts = [call for call in self.deployment_calls() if call['args'][-3:] == ['up', '-d', '--remove-orphans']]
        self.assertEqual(len(app_starts), 1)
        self.assertFalse(app_starts[0]['candidate'])

    def test_automatic_rollback_stops_new_web_before_restoring_old_api(self):
        self.prepare_deployment_fixture()
        self.env['FAIL_APP'] = '1'
        self.assertEqual(self.run_script("deploy.sh", str(self.candidate), check=False).returncode, 43)
        calls = self.deployment_calls()
        stop = next(i for i, call in enumerate(calls) if call['args'][-4:] == ['stop', '--timeout', '30', 'studio'])
        restored = next(i for i, call in enumerate(calls) if call['args'][-3:] == ['up', '-d', '--remove-orphans'] and not call['candidate'])
        self.assertLess(stop, restored)

    def test_manual_rollback_stops_new_web_before_restoring_old_api(self):
        self.prepare_deployment_fixture()
        (self.root / 'state').mkdir()
        (self.root / 'state/previous-deployment.env').write_text(self.previous_manifest)
        self.manifest.write_text(self.candidate.read_text())
        self.run_script('rollback.sh')
        calls = self.deployment_calls()
        self.assertEqual(calls[0]['args'][-4:], ['stop', '--timeout', '30', 'studio'])
        self.assertTrue(calls[0]['candidate'])
        self.assertEqual(self.manifest.read_text(), self.previous_manifest)

    def test_runtime_is_pinned_by_digest_and_secret_file_stays_private(self):
        with self.manifest.open("a") as output:
            output.write(f"GUI_RUNTIME_IMAGE=ghcr.io/acme/cove-gui-runtime:sha-{SHA}\n")
        secret = self.root / "secrets" / "gui.env"
        previous = 'c' * 64
        secret.write_text(f"GUI_SERVICE_SECRET=synthetic-test-value\nGUI_RUNTIME_IMAGE=ghcr.io/acme/cove-gui-runtime@sha256:{previous}\n")
        (self.root / "docker").write_text(f'#!/bin/sh\nif [ "$1" = image ]; then printf "%s\\n" "ghcr.io/acme/cove-gui-runtime@sha256:{DIGEST}"; fi\n')
        self.run_script("pin-gui-runtime.sh")
        self.assertIn(f"GUI_RUNTIME_IMAGE=ghcr.io/acme/cove-gui-runtime@sha256:{DIGEST}", secret.read_text())
        self.assertIn("GUI_SERVICE_SECRET=synthetic-test-value", secret.read_text())
        self.assertIn(f"GUI_RETAINED_RUNTIME_IMAGES=ghcr.io/acme/cove-gui-runtime@sha256:{previous}", secret.read_text())
        self.run_script("pin-gui-runtime.sh")
        self.assertEqual(secret.read_text().count(f"@sha256:{previous}"), 1)
        self.assertEqual(secret.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
