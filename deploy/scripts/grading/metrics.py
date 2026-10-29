#!/usr/bin/env python3
"""Scoped numeric collector for node_exporter textfile or private acceptance capture."""
import argparse
import time
from release import read_json, require

def render(value, now=None):
    now=time.time()*1000 if now is None else now
    require(value['version']==1 and 0<=now-value['observedAt']<=6000,'Stale broker observations')
    lines=[]
    def metric(name,number,labels=''):
        require(type(number) in (int,float,bool) and number>=0,'Invalid numeric observation')
        lines.append(f'cove_grading_{name}{labels} {float(number)}')
    for key in ['active','running','preparing','prepared','quarantined','cleanupFailures','ready']:
        metric('pool_'+key,value['pool'][key])
    for key in ['allocations','bytes','pids','waiting','oldestWaitMs']:metric('bank_'+key,value['pool']['resources'][key])
    for key,number in value['family'].items():
        require(key in ['memoryCurrentBytes','memoryPeakBytes','oom','oomKill','pids','cpuUsageUsec','cpuPeriods','cpuThrottledPeriods','cpuThrottledUsec'],'Unexpected metric')
        metric('family_'+key,number)
    groups={}
    for child in value['children']:
        require(child['engine'] in ['cpython','pyodide'] and type(child['memoryLimitMb']) is int and 16<=child['memoryLimitMb']<=4096,'Invalid fixed profile')
        profile=(child['engine'],child['memoryLimitMb']);bucket=groups.setdefault(profile,{})
        for key,number in child['counters'].items():
            require(key in value['family'] and type(number) is int and number>=0,'Invalid child counter')
            bucket[key]=bucket.get(key,0)+number
    for (engine,memory),bucket in sorted(groups.items()):
        for key,number in bucket.items():metric('guests_sum_'+key,number,f'{{engine="{engine}",memory_mb="{memory}"}}')
    return '\n'.join(lines)+'\n'
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('observations');a=p.parse_args()
    try:print(render(read_json(a.observations)),end='')
    except (ValueError,KeyError,OSError):raise SystemExit('Missing/stale/invalid grading observations')
