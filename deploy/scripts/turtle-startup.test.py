#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys
sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('envelope', Path(__file__).with_name('turtle-resource-envelope.py'))
resource = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resource)

class TurtleBudgetTests(unittest.TestCase):
    def test_budget_includes_broker_guests_overlap_and_slice_once(self):
        configurations = [{'services': {'api': {'mem_limit': 1024**3}}}, {'services': {'broker': {'mem_limit': 256*1024**2}}}]
        expected = (2048 + 1024 + 256 + 4*512 + 1024) * 1024**2
        self.assertEqual(resource.allocated_memory(configurations, 4*512, 1024), expected)
    def test_budget_rejects_missing_unbounded_and_negative_allocations(self):
        for limit in [None, 0, True, '512m']:
            with self.assertRaises(ValueError):
                resource.allocated_memory([{'services': {'unbounded': {'mem_limit': limit}}}], 0, 0)
        with self.assertRaises(ValueError):
            resource.allocated_memory([], -1, 0)
    def test_insufficient_host_headroom_blocks_enablement(self):
        with self.assertRaises(ValueError):
            resource.envelope([{'services': {'api': {'mem_limit': 8 * 1024**3}}}], 0, 0, 12*1024**3, {}, 'digest')
    def test_planned_budget_does_not_attest_unverified_kernel_limits(self):
        e = resource.envelope([], 512, 512, 12*1024**3, {}, 'digest')
        self.assertTrue(e['budgetVerified']); self.assertFalse(e['verified'])
        e = resource.envelope([], 512, 512, 12*1024**3, {**resource.EXPECTED, 'cpu.quota': 1.5}, 'digest')
        self.assertTrue(e['verified'])
    def test_collector_exports_real_cgroup_counters_atomically_without_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)/'cgroup'; root.mkdir()
            for key, value in {**resource.EXPECTED, 'cpu.max': '150000 100000', 'memory.current': 123456,
                               'memory.events': 'oom 1\noom_kill 1\n', 'cpu.stat': 'throttled_usec 250000\n', 'pids.current': 15}.items():
                (root/key).write_text(str(value))
            output = Path(directory)/'metrics'; resource.collect(root, output)
            text = (output/'cove-turtle.prom').read_text()
            self.assertIn('cove_turtle_slice_oom_total 1', text)
            self.assertIn('cove_turtle_slice_cpu_throttled_seconds_total 0.25', text)
            self.assertEqual(len(list(output.iterdir())), 1)

if __name__ == '__main__':
    unittest.main()
