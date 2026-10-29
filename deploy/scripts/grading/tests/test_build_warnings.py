import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('warning_audit',Path(__file__).resolve().parents[1]/'audit-build-warnings.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class WarningAuditTests(unittest.TestCase):
    def test_only_reviewed_dev_bins_are_permitted(self):
        line='WARN Failed to create bin at /artifact/node_modules/.bin/esbuild. ENOENT: synthetic'
        self.assertEqual(module.audit(line,'api'),['esbuild'])
        for kind in ['worker','broker','migration']:
            with self.assertRaises(ValueError):module.audit(line,kind)
        with self.assertRaises(ValueError):module.audit(line.replace('esbuild','node'),'api')
        with self.assertRaises(ValueError):module.audit(line.replace('ENOENT','EACCES'),'api')
if __name__=='__main__':unittest.main()
