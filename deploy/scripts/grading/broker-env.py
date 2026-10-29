#!/usr/bin/env python3
"""Reject application credentials and ambiguous settings before broker launch."""
import argparse
import re
from pathlib import Path
ALLOWED={'GRADING_RUNTIME_MANIFEST_PATH','GRADING_WARM_PROFILES_PATH','GRADING_DAEMON_SOCKET','GRADING_CGROUP_PARENT','GRADING_SYSTEMD_PARENT','GRADING_DAEMON_PID_FILE','GRADING_DAEMON_ID','GRADING_DAEMON_DATA_ROOT','GRADING_BROKER_OWNER','GRADING_WORKER_GENERATION','GRADING_JOURNAL_DIRECTORY','GRADING_OBSERVATIONS_PATH','JUDGE_SANDBOX_SOCKET'}
def validate(path):
    values={}
    for row in Path(path).read_text().splitlines():
        if not row or row.startswith('#'):continue
        key,sep,value=row.partition('=')
        if not sep or key not in ALLOWED or key in values or not re.fullmatch(r'[A-Za-z0-9_./:@+-]+',value):raise ValueError('Invalid/unknown broker environment setting')
        values[key]=value
    if set(values)!=ALLOWED:raise ValueError('Incomplete broker environment')
    if values['JUDGE_SANDBOX_SOCKET']!='/run/cove-grading-control/broker.sock':raise ValueError('Wrong control-only socket')
    if values['GRADING_SYSTEMD_PARENT']!='cove-grading.slice':raise ValueError('Wrong execution family')
    if values['GRADING_DAEMON_SOCKET']=='/var/run/docker.sock':raise ValueError('Rootful daemon forbidden')
    return values
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('file');args=parser.parse_args()
    try:validate(args.file)
    except (ValueError,OSError):raise SystemExit('Broker environment rejected; no values disclosed')
