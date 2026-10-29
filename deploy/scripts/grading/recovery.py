"""Live fail-closed gates for same-authority accepted-work repair."""
import time
import hashlib
from pathlib import Path
from release import require

RECOVERY_CONTRACT=dict(version=1,strategy='preserve-accepted-receipts-v1',workerStartup='coordinator-recovery-before-admission')

def verify_stopped_container(state):
    require(state.get('Running') is False and state.get('Pid')==0 and state.get('Restarting') is False and state.get('Status') in ['exited','created','dead'],'Consumer termination is not proven')

def verify_stopped_broker(properties,populated):
    require(properties.get('ActiveState') in ['inactive','failed'] and properties.get('MainPID')=='0' and populated is False,'Old broker process/cgroup has not terminated')

def verify_broker_cleanup(value,worker_generation,started_at,now=None):
    now=int(time.time()*1000) if now is None else now
    require(value['version']==1 and started_at<=value['observedAt']<=now and now-value['observedAt']<=6000,'Missing fresh post-start cleanup observation')
    require(value['workerGeneration']==worker_generation and bool(value['brokerGeneration']),'Recovery broker authority mismatch')
    pool=value['pool']
    require(pool['ready'] is True and all(pool[key]==0 for key in ['cleanupFailures','quarantined','running','preparing']),'Recovery startup cleanup is uncertain')

def journal_identity(config):
    directory=Path(config['journalDirectory']);path=directory/'state.bin'
    require(directory.is_absolute() and not directory.is_symlink() and directory.stat().st_uid==config['uid'] and directory.stat().st_mode&0o077==0,'Recovery journal directory changed')
    require(path.is_file() and not path.is_symlink() and 0<path.stat().st_size<=32*1024*1024 and path.stat().st_uid==config['uid'],'Missing/empty/invalid retained journal; no replay authorized')
    before=path.stat()
    result=dict(path=str(directory),owner=config['brokerOwner'],device=directory.stat().st_dev,inode=directory.stat().st_ino,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    after=path.stat()
    require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),'Journal changed during identity collection')
    return result

if __name__=='__main__':
    import argparse
    from release import digest,read_json
    parser=argparse.ArgumentParser(description='Read-only frozen journal identity; not an acceptance proof issuer')
    parser.add_argument('host_config');args=parser.parse_args()
    print(digest(journal_identity(read_json(args.host_config))))
