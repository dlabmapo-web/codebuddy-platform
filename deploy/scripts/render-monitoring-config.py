#!/usr/bin/env python3
"""Render Alertmanager configuration without logging secret values."""

from __future__ import annotations

import os
import pathlib
import re
import sys
import tempfile
from string import Template


REQUIRED = {
    "ALERT_EMAIL",
    "ALERT_SMTP_HOST",
    "ALERT_SMTP_USERNAME",
    "ALERT_SMTP_PASSWORD",
    "ALERT_FROM",
}


def parse_env(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw_line in enumerate(path.read_text().splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"{path}:{number}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError(f"{path}:{number}: invalid variable name")
        values[key] = value
    return values


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: render-monitoring-config.py ENV TEMPLATE OUTPUT", file=sys.stderr)
        return 2

    env_path, template_path, output_path = map(pathlib.Path, sys.argv[1:])
    values = parse_env(env_path)
    missing = sorted(key for key in REQUIRED if not values.get(key))
    if missing:
        print("missing monitoring variables: " + ", ".join(missing), file=sys.stderr)
        return 1

    rendered = Template(template_path.read_text()).substitute(values)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=output_path.parent, prefix=".alertmanager-", text=True
    )
    try:
        with os.fdopen(descriptor, "w") as handle:
            handle.write(rendered)
        os.chmod(temporary_name, 0o600)
        os.replace(temporary_name, output_path)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
