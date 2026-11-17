#!/usr/bin/env python3
"""Verify immutable build artifacts and render the dedicated static origin only.
No secrets, source programs or application routes belong in this directory.
"""
import argparse
import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import tempfile
import urllib.parse

RUNTIME_ID = re.compile(r'brython-3\.15\.0-[a-f0-9]{20}')
FILES = {'BRYTHON-LICENSE.txt', 'brython.js', 'brython_stdlib.js', 'config.mjs', 'modules.js',
         'frame.mjs', 'index.html', 'protocol.mjs', 'renderer.mjs', 'runtime.mjs', 'surface.css', 'worker.js'}
# Caddy serves `<file>.br` / `<file>.gz` as they are instead of compressing the
# 6.4 MB engine once per new computer. They live in their own tree: the plain
# `<destination>/<id>` directories stay exactly as earlier releases expect, so a
# rollback still verifies them.
PRECOMPRESSED = 'precompressed'
ENCODED = re.compile(r'(.+)\.(br|gz)')

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def encodings(manifest):
    declared = manifest.get('encodings', {})
    if not isinstance(declared, dict): raise ValueError('Unexpected runtime encodings')
    for name, entry in declared.items():
        match = ENCODED.fullmatch(name)
        if (not match or match[1] not in FILES or not isinstance(entry, dict) or entry.get('source') != match[1]
                or entry.get('encoding') != match[2] or not re.fullmatch(r'[a-f0-9]{64}', str(entry.get('sha256')))
                or not isinstance(entry.get('bytes'), int) or not 0 < entry['bytes'] < manifest['files'][match[1]]['bytes']):
            raise ValueError('Unexpected runtime encodings')
    return declared

def decoded(encoding, data):
    if encoding == 'gz': return gzip.decompress(data)
    try: import brotli
    except ImportError: return None  # Pinned by the approved image's manifest; the package build round-trips it.
    return brotli.decompress(data)

def verify_encoded(path, entry, manifest):
    if path.is_symlink() or not path.is_file(): raise ValueError('Missing regular runtime asset')
    data = path.read_bytes()
    if sha256(data) != entry['sha256'] or len(data) != entry['bytes']:
        raise ValueError('Runtime asset hash mismatch')
    plain = decoded(entry['encoding'], data)
    if plain is not None and sha256(plain) != manifest['files'][entry['source']]['sha256']:
        raise ValueError('Runtime encoding does not match its asset')

def read_env(path):
    values = {}
    for line in pathlib.Path(path).read_text().splitlines():
        key, separator, value = line.strip().partition('=')
        if separator and not key.startswith('#'):
            values[key.strip()] = value.strip().strip('\"\'')
    return values

def origin(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path or url.query or url.fragment or value != 'https://' + url.netloc or not re.fullmatch(r'[a-z0-9.-]+(?::[0-9]+)?', url.netloc):
        raise ValueError('Expected a dedicated HTTPS origin')
    return url

def verify(directory, manifest, parent, encoded=False, complete=False):
    """`encoded` admits the manifest's compressed copies; each one present must
    match it. `complete` also requires all of them (a freshly built artifact)."""
    compressed = verify_files(directory, manifest, parent)
    names = set(p.name for p in directory.iterdir())
    declared = encodings(manifest) if encoded else {}
    if not names <= FILES | set(declared):
        raise ValueError('Unexpected files in runtime directory')
    if complete and set(declared) - names:
        raise ValueError('Missing runtime encodings')
    for name in sorted(names - FILES): verify_encoded(directory / name, declared[name], manifest)
    return compressed

def verify_files(directory, manifest, parent):
    """The uncompressed assets only; the runtime ID is their digest."""
    if manifest.get('engineVersion') != '3.15.0' or manifest.get('protocol') != 1 or manifest.get('profile') != 'cove-browser-turtle-v1' or not RUNTIME_ID.fullmatch(manifest.get('id', '')):
        raise ValueError('Unrecognized runtime manifest')
    if set(manifest.get('files', {})) != FILES:
        raise ValueError('Unexpected runtime files')
    digest_input = []
    compressed = 0
    for name in sorted(FILES):
        path = directory / name
        if path.is_symlink() or not path.is_file(): raise ValueError('Missing regular runtime asset')
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != manifest['files'][name]['sha256'] or len(data) != manifest['files'][name]['bytes']:
            raise ValueError('Runtime asset hash mismatch')
        digest_input.append(name + ':' + digest)
        compressed += len(gzip.compress(data))
    digest = hashlib.sha256('\n'.join(digest_input).encode()).hexdigest()
    if digest != manifest.get('digest') or manifest['id'] != 'brython-3.15.0-' + digest[:20] or compressed > 2 * 1024 * 1024:
        raise ValueError('Runtime version or size mismatch')
    if (directory / 'config.mjs').read_text() != 'export const parentOrigin = ' + json.dumps(parent) + ';\n':
        raise ValueError('Runtime artifact belongs to a different parent origin')
    return compressed

def install(source, target, names, manifest, parent, encoded=False):
    temporary = pathlib.Path(tempfile.mkdtemp(prefix='.publish-', dir=target.parent))
    try:
        for name in names: shutil.copyfile(source / name, temporary / name)
        verify(temporary, manifest, parent, encoded, complete=encoded)
        temporary.chmod(0o755)
        for path in temporary.iterdir(): path.chmod(0o644)
        temporary.rename(target)
    finally:
        if temporary.exists(): shutil.rmtree(temporary)

def publish_precompressed(source, destination, manifest, parent):
    root = destination / PRECOMPRESSED; root.mkdir(exist_ok=True)
    target = root / manifest['id']; declared = encodings(manifest)
    if not target.exists():
        install(source, target, FILES | set(declared), manifest, parent, encoded=True)
        return
    # Same ID means the same plain files; only the compressed copies can differ
    # (another build, or a rollback without them). Swap each atomically.
    verify_files(target, manifest, parent)
    for path in target.iterdir():
        if path.name in FILES or path.name in declared: continue
        if path.is_symlink() or not path.is_file() or not ENCODED.fullmatch(path.name):
            raise ValueError('Unexpected files in runtime directory')
        path.unlink()
    for name, entry in declared.items():
        current = target / name
        if current.is_file() and not current.is_symlink() and sha256(current.read_bytes()) == entry['sha256']: continue
        handle, temporary = tempfile.mkstemp(prefix='.publish-', dir=root); os.close(handle)
        try:
            shutil.copyfile(source / name, temporary); os.chmod(temporary, 0o644); os.replace(temporary, current)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
    verify(target, manifest, parent, encoded=True, complete=True)

def stage(destination, version, manifest, parent):
    """Every served version has a precompressed directory. One published before
    compressed copies existed gets its plain files, which Caddy compresses."""
    root = destination / PRECOMPRESSED; root.mkdir(exist_ok=True)
    target = root / version
    if not target.exists(): install(destination / version, target, FILES, manifest, parent)
    verify(target, manifest, parent, encoded=True)

def publish(artifact, destination, runtime_id, parent):
    manifest = json.loads((artifact / 'manifest.json').read_text())
    if manifest['id'] != runtime_id: raise ValueError('Configured runtime ID does not match approved web image')
    size = verify(artifact / runtime_id, manifest, parent, encoded=True, complete=True)
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / runtime_id
    if target.exists(): verify(target, manifest, parent)
    else: install(artifact / runtime_id, target, FILES, manifest, parent)
    publish_precompressed(artifact / runtime_id, destination, manifest, parent)
    manifests = destination / '.manifests'; manifests.mkdir(exist_ok=True)
    (manifests / (runtime_id + '.json')).write_text(json.dumps(manifest, indent=2) + '\n')
    return size

def render(env, destination, snippet):
    enabled = env.get('TURTLE_TRIAL_BROWSER_ENABLED') == 'true' or env.get('TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED') == 'true'
    runtime_id = env.get('TURTLE_TRIAL_BROWSER_RUNTIME_ID', '')
    runtime_origin = env.get('TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN', '')
    snippet.parent.mkdir(parents=True, exist_ok=True)
    if not runtime_id and not runtime_origin and not enabled:
        snippet.unlink(missing_ok=True)
        return
    runtime = origin(runtime_origin)
    parent = env.get('TURTLE_TRIAL_BROWSER_PARENT_ORIGIN', 'https://cs.coveedu.com')
    if runtime.hostname == origin(parent).hostname: raise ValueError('Runtime must use a different hostname')
    ids = list(dict.fromkeys([runtime_id] + [v.strip() for v in env.get('TURTLE_TRIAL_BROWSER_RETAINED_RUNTIME_IDS', '').split(',') if v.strip()]))
    if len(ids) > 17 or any(not RUNTIME_ID.fullmatch(i) for i in ids): raise ValueError('Invalid retained runtime IDs')
    for version in ids:
        manifest = json.loads((destination / '.manifests' / (version + '.json')).read_text())
        verify(destination / version, manifest, parent)
        stage(destination, version, manifest, parent)
    workers =' '.join(runtime_origin + '/' + i + '/worker.js' for i in ids)
    versions = '(?:' + '|'.join(re.escape(i) for i in ids) + ')'
    names = '(?:' + '|'.join(re.escape(i) for i in sorted(FILES)) + ')'
    common = "default-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"
    text = f'''# Generated from verified immutable assets. No proxy or application routes.
{runtime.netloc} {{
  # This outer deferred header must win over production_common's default.
  header >Referrer-Policy no-referrer
  import production_common
  @assets {{
    method GET HEAD
    path_regexp turtle_assets ^/{versions}/{names}$
  }}
  @worker path_regexp turtle_worker ^/{versions}/worker\\.js$
  handle @assets {{
    # Sends the verified .br/.gz copies as they are; the proxy compresses
    # nothing for a class downloading the engine together.
    root * /srv/turtle-browser/{PRECOMPRESSED}
    header {{
      -Set-Cookie
      Referrer-Policy no-referrer
      Cross-Origin-Opener-Policy same-origin
      Cross-Origin-Embedder-Policy require-corp
      Cross-Origin-Resource-Policy cross-origin
      Cache-Control "public, max-age=31536000, immutable"
    }}
    handle @worker {{
      header Content-Security-Policy "{common} script-src 'self' 'unsafe-eval'; style-src 'none'; worker-src 'none'; frame-ancestors 'none'"
      file_server {{
        precompressed br gzip
      }}
    }}
    handle {{
      header Content-Security-Policy "{common} script-src 'self'; style-src 'self'; worker-src {workers}; frame-ancestors {parent}"
      file_server {{
        precompressed br gzip
      }}
    }}
  }}
  handle {{
    respond 404
  }}
}}
'''
    temporary = snippet.with_suffix('.tmp'); temporary.write_text(text); temporary.replace(snippet)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--env', required=True); parser.add_argument('--destination', required=True)
    parser.add_argument('--artifact'); parser.add_argument('--snippet', required=True)
    args = parser.parse_args(); env = read_env(args.env)
    destination = pathlib.Path(args.destination)
    if args.artifact:
        publish(pathlib.Path(args.artifact), destination, env.get('TURTLE_TRIAL_BROWSER_RUNTIME_ID', ''), env.get('TURTLE_TRIAL_BROWSER_PARENT_ORIGIN', 'https://cs.coveedu.com'))
    render(env, destination, pathlib.Path(args.snippet))
