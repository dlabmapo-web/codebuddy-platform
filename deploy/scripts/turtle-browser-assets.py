#!/usr/bin/env python3
"""Verify immutable build artifacts and render the dedicated static origin only.
No secrets, source programs or application routes belong in this directory.
"""
import argparse
import gzip
import hashlib
import json
import pathlib
import re
import shutil
import tempfile
import urllib.parse

RUNTIME_ID = re.compile(r'brython-3\.15\.0-[a-f0-9]{20}')
FILES = {'BRYTHON-LICENSE.txt', 'brython.js', 'brython_stdlib.js', 'config.mjs', 'modules.js',
         'frame.mjs', 'index.html', 'protocol.mjs', 'renderer.mjs', 'runtime.mjs', 'surface.css', 'worker.js'}

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

def verify(directory, manifest, parent):
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
    if set(p.name for p in directory.iterdir()) != FILES:
        raise ValueError('Unexpected files in runtime directory')
    return compressed

def publish(artifact, destination, runtime_id, parent):
    manifest = json.loads((artifact / 'manifest.json').read_text())
    if manifest['id'] != runtime_id: raise ValueError('Configured runtime ID does not match approved web image')
    size = verify(artifact / runtime_id, manifest, parent)
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / runtime_id
    if target.exists(): verify(target, manifest, parent)
    else:
        temporary = pathlib.Path(tempfile.mkdtemp(prefix='.publish-', dir=destination))
        try:
            for name in FILES: shutil.copyfile(artifact / runtime_id / name, temporary / name)
            verify(temporary, manifest, parent)
            temporary.chmod(0o755)
            for path in temporary.iterdir(): path.chmod(0o644)
            temporary.rename(target)
        finally:
            if temporary.exists(): shutil.rmtree(temporary)
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
    workers = ' '.join(runtime_origin + '/' + i + '/worker.js' for i in ids)
    versions = '(?:' + '|'.join(re.escape(i) for i in ids) + ')'
    names = '(?:' + '|'.join(re.escape(i) for i in sorted(FILES)) + ')'
    common = "default-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"
    text = f'''# Generated from verified immutable assets. No proxy or application routes.
{runtime.netloc} {{
  import production_common
  @assets {{
    method GET HEAD
    path_regexp turtle_assets ^/{versions}/{names}$
  }}
  @worker path_regexp turtle_worker ^/{versions}/worker\\.js$
  handle @assets {{
    root * /srv/turtle-browser
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
      file_server
    }}
    handle {{
      header Content-Security-Policy "{common} script-src 'self'; style-src 'self'; worker-src {workers}; frame-ancestors {parent}"
      file_server
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
