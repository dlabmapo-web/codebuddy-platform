"""Bind the exported launcher ELF and non-glibc library closure to rootfs metadata."""
import hashlib,json,pathlib,subprocess
from shutil import copy2
base=pathlib.Path('/opt/cove')
libs=base/'launcher-lib';libs.mkdir(exist_ok=True)
for line in subprocess.check_output(['ldd','/usr/local/bin/nsjail'],text=True).splitlines():
    for field in line.split():
        if field.startswith('/'):
            path=pathlib.Path(field)
            # The disposable host must supply glibc >=2.36 and its matching loader.
            # Never mix an exported libc with an unrelated host ELF interpreter.
            if path.name.startswith(('libc.so','libm.so','libpthread.so','librt.so','libdl.so','ld-linux')):continue
            copy2(path,libs/path.name,follow_symlinks=True)
for library in sorted(libs.iterdir()):
    subprocess.check_call(['patchelf','--set-rpath','$ORIGIN',str(library)])
copy2('/usr/local/bin/nsjail',base/'nsjail')
subprocess.check_call(['patchelf','--set-rpath','$ORIGIN/launcher-lib',str(base/'nsjail')])
packages=base/'rootfs/opt/cove/packages.json'
data=json.loads(packages.read_text())
data['launcherLibraries']={p.name:'sha256:'+hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(libs.iterdir())}
packages.write_text(json.dumps(data,sort_keys=True,separators=(',',':'))+'\n')
# This script is copied beside the canonical build digest implementation.
from tree_digest import tree_digest
(base/'rootfs.digest').write_text(tree_digest(base/'rootfs')+'\n')
