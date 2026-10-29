#!/usr/bin/env python3
"""Kernel executable + Unix peer identity for the non-socket-activated dockerd."""
import hashlib
import os
from pathlib import Path
import socket
import stat
import struct
from release import require

def file_hash(path):
    result=hashlib.sha256()
    with open(path,'rb') as file:
        for chunk in iter(lambda:file.read(1024*1024),b''):result.update(chunk)
    return result.hexdigest()

def attest_process(config,pid,proc_root=Path('/proc')):
    require(type(pid) is int and pid>0,'Invalid endpoint PID')
    process=proc_root/str(pid)
    require(process.stat().st_uid==config['uid'],'Endpoint UID differs from dedicated account')
    reviewed=Path(config['daemonExecutable']).resolve(strict=True)
    actual=(process/'exe').resolve(strict=True)
    require(actual==reviewed,'Kernel executable differs from reviewed dockerd')
    before=(process/'exe').stat()
    require((before.st_dev,before.st_ino)==(reviewed.stat().st_dev,reviewed.stat().st_ino),'Kernel executable inode mismatch')
    require(file_hash(process/'exe')==config['daemonExecutableSha256'],'Dockerd executable content changed')
    args=(process/'cmdline').read_bytes().split(b'\0')
    require(('--config-file='+config['daemonConfig']).encode() in args,'Endpoint config argument mismatch')
    mapping=(process/'cgroup').read_text().splitlines()
    groups=[line[3:] for line in mapping if line.startswith('0::/')]
    require(len(groups)==1,'Endpoint unified cgroup missing')
    parent=Path(config['cgroupParent'])
    child=Path('/sys/fs/cgroup')/groups[0].lstrip('/')
    require(parent in child.parents,'Actual endpoint is outside grading family')
    # comm may contain spaces and parentheses; field 22 follows the LAST ')'.
    fields=(process/'stat').read_text().rsplit(')',1)[1].split()
    start_time=fields[19]
    require(start_time.isdecimal() and int(start_time)>0,'Invalid process start time')
    after=(process/'exe').stat()
    require((before.st_dev,before.st_ino,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_ctime_ns),'Executable changed during attestation')
    return dict(version=1,pid=pid,uid=config['uid'],startTime=start_time,executable=str(reviewed),executableDevice=before.st_dev,executableInode=before.st_ino,executableSha256=config['daemonExecutableSha256'])

def attest_connected(config,peer,socket_before,socket_after,snapshot=attest_process):
    """Injectable only for tests; production obtains peer with kernel SO_PEERCRED."""
    pid,uid,_gid=peer
    require(uid==config['uid'],'Unix endpoint belongs to another UID')
    before=snapshot(config,pid)
    after=snapshot(config,pid)
    require(before==after,'Daemon restarted/PID reused during attestation')
    require(socket_before==socket_after,'Daemon socket changed during attestation')
    return {**after,'socketDevice':socket_after[0],'socketInode':socket_after[1]}

def attest_daemon(config):
    require(hasattr(socket,'SO_PEERCRED'),'Linux SO_PEERCRED required')
    path=Path(config['daemonSocket'])
    before=path.stat()
    require(stat.S_ISSOCK(before.st_mode) and before.st_uid==config['uid'],'Invalid dedicated daemon socket')
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
        connection.settimeout(3);connection.connect(str(path))
        peer=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,struct.calcsize('3i')))
        # Keep the connected endpoint alive across both snapshots and pathname
        # checks. This is the process serving this socket, never argv discovery.
        first=attest_process(config,peer[0])
        result=attest_connected(config,peer,(before.st_dev,before.st_ino),(path.stat().st_dev,path.stat().st_ino))
        require(all(result[key]==value for key,value in first.items()),'Endpoint changed during peer/executable checks')
        final=path.stat()
        require((final.st_dev,final.st_ino)==(before.st_dev,before.st_ino),'Daemon socket changed after executable checks')
        return result
