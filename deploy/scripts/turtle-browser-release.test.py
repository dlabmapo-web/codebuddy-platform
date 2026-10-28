"""Reject unsafe pilot metadata before changing the active release manifest."""
import base64
import importlib.util
import json
import pathlib
import sys
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('browser_release', pathlib.Path(__file__).with_name('turtle-browser-release.py'))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def encode(value):
    return base64.b64encode(json.dumps(value).encode()).decode()


class BrowserReleaseTests(unittest.TestCase):
    def setUp(self):
        self.pilot = {
            'TURTLE_TRIAL_BROWSER_ENABLED': 'true',
            'TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED': 'true',
            'TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN': 'https://turtle-runtime.coveedu.com',
            'TURTLE_TRIAL_BROWSER_RUNTIME_ID': 'brython-3.15.0-' + 'a' * 20,
            'TURTLE_TRIAL_BROWSER_PARENT_ORIGIN': 'https://cs.coveedu.com',
            'TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS': '20000000-0000-4000-8000-000000000001',
        }
        self.current = {'TURTLE_TRIAL_ENABLED': 'true'}

    def test_absent_configuration_does_not_disable_an_installed_pilot(self):
        self.assertEqual(helper.release_updates('', self.pilot), {})

    def test_explicit_pilot_is_valid_and_does_not_modify_current_values(self):
        self.assertEqual(helper.release_updates(encode(self.pilot), self.current), self.pilot)
        self.assertEqual(self.current, {'TURTLE_TRIAL_ENABLED': 'true'})

    def test_kill_switch_preserves_the_installed_artifact_metadata(self):
        updates = {'TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED': 'false'}
        self.assertEqual(helper.release_updates(encode(updates), self.current | self.pilot), updates)

    def test_rejects_encoding_unknown_fields_and_shell_payloads(self):
        for value in ('bad encoding', encode({'API_IMAGE': 'arbitrary'}), encode({'TURTLE_TRIAL_BROWSER_ENABLED': 'true\nAPI_IMAGE=arbitrary'})):
            with self.subTest(value=value), self.assertRaises(ValueError):
                helper.release_updates(value, self.current)

    def test_rejects_non_string_or_non_boolean_switches(self):
        for value in (True, 'yes', '$(touch /tmp/not-allowed)'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                helper.release_updates(encode(self.pilot | {'TURTLE_TRIAL_BROWSER_ENABLED': value}), self.current)

    def test_requires_public_turtle_and_browser_feature_for_admission(self):
        with self.assertRaises(ValueError):
            helper.release_updates(encode(self.pilot), {'TURTLE_TRIAL_ENABLED': 'false'})
        with self.assertRaises(ValueError):
            helper.release_updates(encode(self.pilot | {'TURTLE_TRIAL_BROWSER_ENABLED': 'false'}), self.current)

    def test_requires_dedicated_canonical_https_runtime(self):
        for value in ('https://cs.coveedu.com', 'http://turtle-runtime.coveedu.com', 'https://turtle-runtime.coveedu.com/path', 'https://turtle-runtime.coveedu.com:443', 'https://user:pass@turtle-runtime.coveedu.com'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                helper.release_updates(encode(self.pilot | {'TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN': value}), self.current)

    def test_requires_pinned_artifact_and_specific_pilot(self):
        for patch in ({'TURTLE_TRIAL_BROWSER_RUNTIME_ID': 'latest'}, {'TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS': ''}, {'TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS': 'all'}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                helper.release_updates(encode(self.pilot | patch), self.current)

    def test_inactive_metadata_cannot_inject_shell_or_noncanonical_lists(self):
        for patch in (
            {'TURTLE_TRIAL_BROWSER_PARENT_ORIGIN': '$(touch /tmp/not-allowed)'},
            {'TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS': '20000000-0000-4000-8000-000000000001, 20000000-0000-4000-8000-000000000002'},
            {'TURTLE_TRIAL_BROWSER_RETAINED_RUNTIME_IDS': ','},
        ):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                helper.release_updates(encode(patch), self.current)


if __name__ == '__main__':
    unittest.main()
