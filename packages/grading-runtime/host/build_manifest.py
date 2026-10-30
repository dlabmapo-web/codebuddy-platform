#!/usr/bin/env python3
"""Verify provenance and static ELF properties; emit the runtime-only manifest."""
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGE = 'gcc:14.3.0-bookworm@sha256:5e927c284bf55a7dc796262e311a0703344f62f41f5621eb56843111b1d37e15'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def output(*command):
    return subprocess.check_output(command, text=True).strip()


def main():
    provenance = json.loads((ROOT / 'third-party.json').read_text())
    expected = {}
    for dependency in provenance['dependencies']:
        for relative, digest in dependency['files'].items():
            assert sha(ROOT / relative) == digest, f'Vendor bytes changed: {relative}'
            expected[relative] = digest
    actual = {str(p.relative_to(ROOT)) for p in (ROOT / 'vendor').rglob('*') if p.is_file()}
    assert actual == set(expected), 'Unexpected or missing vendor file'
    artifacts = {}
    for name in ('attestor', 'attestor-client'):
        path = ROOT / 'bin' / name
        header = output('readelf', '-hW', str(path))
        program = output('readelf', '-lW', str(path))
        dynamic = output('readelf', '-dW', str(path))
        assert 'Advanced Micro Devices X86-64' in header and 'ELF64' in header
        assert re.search(r'Type:\s+DYN ', header), 'Static PIE required'
        assert not re.search(r'^\s*INTERP\s', program, re.M), 'Dynamic interpreter forbidden'
        assert '(NEEDED)' not in dynamic, 'Dynamic dependencies forbidden'
        stack = next(line for line in program.splitlines() if line.lstrip().startswith('GNU_STACK'))
        assert re.search(r'\sRW\s', stack), 'Executable stack forbidden'
        assert 'GNU_RELRO' in program and 'BIND_NOW' in dynamic
        path.chmod(0o555)
        artifacts[name] = dict(sha256=sha(path), size=path.stat().st_size,
            elf=dict(architecture='x86_64', elfClass=64, staticPie=True,
                     hasInterpreter=False, neededLibraries=[], executableStack=False,
                     relro=True, bindNow=True))
    components = {}
    for name in ('gcc', 'ld', 'as'):
        path = Path(shutil.which(name)).resolve()
        components[name] = dict(path=str(path), sha256=sha(path), version=output(name, '--version').splitlines()[0])
    for name in ('cc1', 'libgcc.a', 'libgcc_eh.a', 'libc.a', 'rcrt1.o', 'crtbeginS.o', 'crtendS.o'):
        path = Path(output('gcc', ('-print-prog-name=' if name == 'cc1' else '-print-file-name=') + name)).resolve(strict=True)
        components[name] = dict(path=str(path), sha256=sha(path))
    licenses = ROOT / 'bin/licenses'
    licenses.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / 'vendor/mbedtls/LICENSE', licenses / 'mbedtls-Apache-2.0.txt')
    shutil.copyfile(ROOT / 'vendor/jsmn/LICENSE', licenses / 'jsmn-MIT.txt')
    shutil.copyfile('/usr/share/doc/libc6/copyright', licenses / 'glibc-copyright.txt')
    shutil.copyfile('/usr/share/common-licenses/LGPL-2.1', licenses / 'glibc-LGPL-2.1.txt')
    (licenses / 'STATIC-LINKING.txt').write_text(
        'These tools statically link glibc 2.36-9+deb12u10 (LGPL-2.1-or-later) and GCC 14.3.0 libgcc '
        '(GPL-3.0 with GCC Runtime Library Exception 3.1). Complete application source and relinking '
        'recipe are packages/grading-runtime/host in the accompanying source revision. '
        'Corresponding glibc source: https://sources.debian.org/src/glibc/2.36-9%2Bdeb12u10/ . '
        'The pinned compiler image and exact input library hashes are in manifest.json. '
        'Distributors must provide corresponding source/relinking materials with any conveyed binaries.\n')
    for name in ('COPYING.RUNTIME', 'COPYING3'):
        shutil.copyfile(ROOT / 'vendor/gcc-notices' / name, licenses / ('gcc-' + name + '.txt'))
    manifest = dict(version=1, protocolVersion=1, compilerImage=IMAGE,
        compiler=components, debianPackages=output('dpkg-query', '-W', 'libc6', 'libc6-dev', 'binutils').splitlines(),
        binaries=artifacts, thirdPartySha256=sha(ROOT / 'third-party.json'),
        dependencies=provenance['dependencies'],
        sourceFiles={str(p.relative_to(ROOT)): sha(p) for p in sorted(ROOT.iterdir())
            if p.is_file() and (p.suffix in ('.c', '.h') or p.name in ('Makefile', 'build_manifest.py', 'PROTOCOL.md'))},
        licenses={p.name: sha(p) for p in sorted(licenses.iterdir())})
    (ROOT / 'bin/manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
    print(json.dumps({'binaries': artifacts, 'compiler': components['gcc']['version'],
                      'binutils': components['ld']['version']}, sort_keys=True))


if __name__ == '__main__':
    main()
