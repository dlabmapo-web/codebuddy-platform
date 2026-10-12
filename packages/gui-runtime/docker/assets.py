import base64,json,pathlib,os,sys
root=pathlib.Path('/assets')
for asset in json.load(sys.stdin):
    name=asset['name']
    if '/' in name or name in ('', '.', '..'):
        raise ValueError('Invalid asset')
    path=root/name
    path.write_bytes(base64.b64decode(asset['data'],validate=True))
    path.chmod(0o444)
root.chmod(0o555)
