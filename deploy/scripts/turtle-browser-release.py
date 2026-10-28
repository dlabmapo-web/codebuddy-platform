"""Validate optional, non-secret browser pilot configuration before deployment."""
import base64
import json
import re
import urllib.parse
import uuid

PREFIX = 'TURTLE_TRIAL_BROWSER_'
KEYS = {PREFIX + name for name in (
    'ENABLED', 'ADMISSION_ENABLED', 'RUNTIME_ORIGIN', 'RUNTIME_ID',
    'PARENT_ORIGIN', 'PILOT_ACADEMY_IDS', 'RETAINED_RUNTIME_IDS',
)}
RUNTIME_ID = re.compile(r'brython-3\.15\.0-[a-f0-9]{20}')


def release_updates(encoded, current):
    if not encoded:
        return {}  # Ordinary releases preserve the installed pilot selection.
    try:
        if len(encoded) > 65536:
            raise ValueError('configuration is too large')
        updates = json.loads(base64.b64decode(encoded, validate=True))
    except (ValueError, UnicodeError) as error:
        raise ValueError('Invalid browser release configuration encoding') from error
    if not isinstance(updates, dict) or not updates or set(updates) - KEYS:
        raise ValueError('Unexpected browser release configuration keys')
    if any(not isinstance(v, str) or any(c in v for c in '\r\n\x00') for v in updates.values()):
        raise ValueError('Browser release configuration requires single-line strings')
    effective = {**current, **updates}
    for name in ('ENABLED', 'ADMISSION_ENABLED'):
        if effective.get(PREFIX + name, 'false') not in ('true', 'false'):
            raise ValueError('Browser switches must be true or false')
    enabled = effective.get(PREFIX + 'ENABLED') == 'true'
    admission = effective.get(PREFIX + 'ADMISSION_ENABLED') == 'true'
    if admission and not enabled:
        raise ValueError('Browser admission requires the browser feature')
    if (enabled or admission) and effective.get('TURTLE_TRIAL_ENABLED') != 'true':
        raise ValueError('Browser execution requires public Turtle')

    def origin(value):
        parsed = urllib.parse.urlsplit(value)
        if (not re.fullmatch(r'https://[a-z0-9.-]+(?::[0-9]+)?', value)
                or not parsed.hostname or parsed.hostname.endswith('.')
                or parsed.port == 443):
            raise ValueError('Browser origins must be canonical HTTPS origins')
        return parsed.hostname

    runtime = effective.get(PREFIX + 'RUNTIME_ORIGIN', '')
    parent = effective.get(PREFIX + 'PARENT_ORIGIN', 'https://cs.coveedu.com')
    runtime_id = effective.get(PREFIX + 'RUNTIME_ID', '')
    if enabled or runtime or runtime_id:
        if origin(runtime) == origin(parent):
            raise ValueError('Browser runtime must use a different hostname')
        if not RUNTIME_ID.fullmatch(runtime_id):
            raise ValueError('Browser runtime ID must identify the pinned artifact')
    pilots = [v.strip() for v in effective.get(PREFIX + 'PILOT_ACADEMY_IDS', '').split(',') if v.strip()]
    if len(pilots) > 1000 or any(str(uuid.UUID(v)) != v for v in pilots):
        raise ValueError('Invalid browser pilot academy IDs')
    if admission and not pilots:
        raise ValueError('Browser admission requires an explicit academy pilot')
    retained = [v.strip() for v in effective.get(PREFIX + 'RETAINED_RUNTIME_IDS', '').split(',') if v.strip()]
    if len(retained) > 16 or any(not RUNTIME_ID.fullmatch(v) for v in retained):
        raise ValueError('Invalid retained browser runtime IDs')
    return updates
