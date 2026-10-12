"""Exercise release/profile selection without credentials or a Docker daemon."""
import json
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

    def test_runtime_is_pinned_by_digest_and_secret_file_stays_private(self):
        with self.manifest.open("a") as output:
            output.write(f"GUI_RUNTIME_IMAGE=ghcr.io/acme/cove-gui-runtime:sha-{SHA}\n")
        secret = self.root / "secrets" / "gui.env"
        secret.write_text("GUI_SERVICE_SECRET=synthetic-test-value\nGUI_RUNTIME_IMAGE=old\n")
        (self.root / "docker").write_text(f'#!/bin/sh\nif [ "$1" = image ]; then printf "%s\\n" "ghcr.io/acme/cove-gui-runtime@sha256:{DIGEST}"; fi\n')
        self.run_script("pin-gui-runtime.sh")
        self.assertIn(f"GUI_RUNTIME_IMAGE=ghcr.io/acme/cove-gui-runtime@sha256:{DIGEST}", secret.read_text())
        self.assertIn("GUI_SERVICE_SECRET=synthetic-test-value", secret.read_text())
        self.assertEqual(secret.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
