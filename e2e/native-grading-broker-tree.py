"""Compare bounded stopped-carrier bytes to the actual host broker artifact tree."""
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'deploy/scripts/grading'))
from artifact import tree_identity
# The caller already bounds Docker's tar stdout to 64MiB; bound again here.
data=sys.stdin.buffer.read(64*2**20+1)
if len(data)>64*2**20: raise ValueError('Oversized broker artifact archive')
with tempfile.TemporaryDirectory(prefix='cove-broker-evidence-') as directory:
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        members=archive.getmembers()
        if len(members)>100000 or sum(item.size for item in members)>64*2**20:
            raise ValueError('Oversized broker artifact tree')
        archive.extractall(directory,filter='data')
    print(json.dumps(dict(imageTreeIdentity=tree_identity(directory),hostTreeIdentity=tree_identity(Path(sys.argv[1]).parent.parent))))
