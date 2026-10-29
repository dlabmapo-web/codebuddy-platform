"""Real Compose parser with only synthetic env/files; no services are launched."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[4]
class ComposeTests(unittest.TestCase):
    def test_merged_model_is_control_only_and_base_remains_legacy(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'secrets').mkdir()
            for name in ['api.env','studio.env','mvp.env','monitoring.env','gui.env','video-worker.env','redis-password']:(root/'secrets'/name).write_text('SYNTHETIC=true\n')
            combined='\n'.join((ROOT/'deploy'/name).read_text() for name in ['compose.production.yml','compose.grading.yml'])
            values={key:'synthetic' for key in re.findall(r'\$\{([A-Z_]+):\?',combined)}
            values.update(GRADING_WORKER_GENERATION='12345678-1234-4234-8234-123456789abc',GRADING_CONTROL_GID='4444',GRADING_MANIFEST_HOST_PATH=str(root/'manifest.json'))
            env=root/'synthetic.env';env.write_text('\n'.join(k+'='+v for k,v in values.items()))
            base=['docker','compose','--project-directory',str(root),'--env-file',str(env),'-f',str(ROOT/'deploy/compose.production.yml')]
            def model(args):return json.loads(subprocess.run(args+['config','--format','json'],check=True,capture_output=True,text=True).stdout)
            original=model(base)
            self.assertIn('judge-sandbox',original['services']);self.assertNotIn('GRADING_RUNTIME_MANIFEST_PATH',original['services']['api']['environment'])
            merged=model(base+['-f',str(ROOT/'deploy/compose.grading.yml')])
            self.assertNotIn('judge-sandbox',merged['services'])
            api=merged['services']['api'];worker=merged['services']['judge-worker']
            self.assertEqual(api['environment']['GRADING_NATIVE_ENABLED'],'false')
            for key in ['GRADING_RUNTIME_MANIFEST_PATH','GRADING_WORKER_GENERATION']:self.assertEqual(api['environment'][key],worker['environment'][key])
            self.assertEqual(set(worker['depends_on']),{'redis'})
            self.assertIn('/ready',worker['healthcheck']['test'][-1])
            self.assertEqual([v['target'] for v in api['volumes']],['/etc/cove-grading/manifest.json'])
            self.assertEqual({v['target'] for v in worker['volumes']},{'/etc/cove-grading/manifest.json','/run/cove-grading-control'})
            for item in api['volumes']+worker['volumes']:self.assertTrue(item['read_only']);self.assertFalse(item['bind'].get('create_host_path',False))
            self.assertEqual(int(worker['mem_limit']),768*2**20);self.assertEqual(float(worker['cpus']),.75);self.assertEqual(worker['pids_limit'],256)
if __name__=='__main__':unittest.main()
