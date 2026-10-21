#!/usr/bin/env python3
"""Validate DLAB wiring without printing secret values."""
import pathlib
import sys


def read(path):
    result = {}
    for raw in pathlib.Path(path).read_text().splitlines():
        raw = raw.strip()
        if raw and not raw.startswith('#') and '=' in raw:
            key, value = raw.split('=', 1)
            result[key.strip()] = value.strip().strip('\"\'')
    return result


def check(api, studio):
    mode = api.get('DLAB_SSO_ROLLOUT_MODE', 'allowlist')
    if mode not in ['allowlist', 'campus']:
        raise ValueError('DLAB_SSO_ROLLOUT_MODE must be allowlist or campus')
    if api.get('DLAB_OS_BASE_URL', 'https://os.dlabcampus.com/v1') != 'https://os.dlabcampus.com/v1':
        raise ValueError('DLAB_OS_BASE_URL must use https://os.dlabcampus.com/v1')
    enabled = api.get('DLAB_SSO_ENABLED') == 'true'
    if enabled != (studio.get('DLAB_SSO_ENABLED') == 'true'):
        raise ValueError('API and Studio DLAB_SSO_ENABLED must agree')
    if not enabled:
        return
    for key in ['DLAB_CLIENT_SECRET', 'DLAB_INBOUND_SERVER_KEY']:
        if len(api.get(key, '')) < 32:
            raise ValueError(f'{key} must be configured privately')
    if api['DLAB_INBOUND_SERVER_KEY'] in [api['DLAB_CLIENT_SECRET'], api.get('BFF_SHARED_SECRET')]:
        raise ValueError('DLAB inbound key must be independent from client and BFF secrets')
    if mode == 'allowlist' and not api.get('DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS', '').strip():
        raise ValueError('An explicit DLAB test user allowlist is required')
    if api.get('DLAB_OS_BASE_URL') != 'https://os.dlabcampus.com/v1':
        raise ValueError('DLAB_OS_BASE_URL must use the registered production OS')
    if api.get('DLAB_CLIENT_ID') != 'cove':
        raise ValueError('DLAB_CLIENT_ID must be cove')
    if api.get('DLAB_REDIRECT_URI') != 'https://cs.coveedu.com/sso/callback':
        raise ValueError('DLAB_REDIRECT_URI must match the registered Studio callback')
    if not (api.get('MONITORING_REDIS_URL') or api.get('REDIS_URL')):
        raise ValueError('DLAB requires Redis')
    if not api.get('BFF_SHARED_SECRET') or api.get('BFF_SHARED_SECRET') != studio.get('BFF_SHARED_SECRET'):
        raise ValueError('API and Studio BFF secret must agree')


if __name__ == '__main__':
    try:
        check(read(sys.argv[1]), read(sys.argv[2]))
    except (ValueError, IndexError) as error:
        raise SystemExit(str(error))
    print('DLAB configuration validated (secret values omitted).')
