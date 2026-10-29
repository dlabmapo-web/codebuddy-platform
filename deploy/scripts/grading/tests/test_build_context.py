"""BuildKit COPY test using exclusively synthetic canaries, no repository secrets."""
from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[4]
class BuildContextTests(unittest.TestCase):
    def test_secret_canaries_never_enter_copy_layers(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);context=root/'context';context.mkdir();output=root/'output'
            (context/'.dockerignore').write_bytes((ROOT/'.dockerignore').read_bytes())
            secrets=['.env-backups/backup-data','e2e/.auth/session.json','.env','deploy/secrets/api.env','deploy/secrets/redis-password','deploy/state/accepted.json','deploy/generated/alertmanager.yml','deploy/grading/acceptance.json','deployment.env','local/private.env','local/private.env.production','local/signing.key','local/key.pem','local/key.p8','local/key.p12','local/key.pfx','local/id_rsa','local/id_ed25519','.ssh/config','packages/api/.env','packages/api/.env.production','packages/api/prototypes/native-grading/controller.ts']
            for index,name in enumerate(secrets):
                path=context/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('SYNTHETIC_PRIVATE_CANARY_'+str(index))
            (context/'package.json').write_text('{"synthetic":true}')
            # All production builds use this shared context: a migration-style
            # COPY of its entirety is the widest possible source/artifact boundary.
            (context/'Dockerfile').write_text('FROM scratch\nCOPY . /context/\n')
            subprocess.run(['docker','build','--output','type=local,dest='+str(output),str(context)],check=True,capture_output=True,text=True,timeout=90)
            self.assertTrue((output/'context/package.json').is_file())
            for name in secrets:self.assertFalse((output/'context'/name).exists(),name)
            for path in (output/'context').rglob('*'):
                if path.is_file():self.assertNotIn(b'SYNTHETIC_PRIVATE_CANARY_',path.read_bytes())
if __name__=='__main__':unittest.main()
