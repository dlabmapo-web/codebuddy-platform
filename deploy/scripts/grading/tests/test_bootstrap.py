import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[4]
class BootstrapTests(unittest.TestCase):
    def test_supported_entrypoints_emit_runtime_before_consumers(self):
        scripts=json.loads((ROOT/'package.json').read_text())['scripts']
        self.assertEqual(scripts['prepare:grading'],'pnpm --filter @cove/shared build && pnpm --filter @cove/grading-runtime build')
        for name in ['dev','dev:api','typecheck']:self.assertTrue(scripts[name].startswith('pnpm prepare:grading && '),name)
        pretest=json.loads((ROOT/'packages/api/package.json').read_text())['scripts']['pretest']
        self.assertIn('@cove/shared build && pnpm --filter @cove/grading-runtime build &&',pretest)
        ci=(ROOT/'.github/workflows/ci.yml').read_text();self.assertLess(ci.index('pnpm prepare:grading'),ci.index('run: pnpm -r typecheck'))
if __name__=='__main__':unittest.main()
