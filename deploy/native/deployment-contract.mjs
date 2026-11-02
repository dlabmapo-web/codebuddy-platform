/** Validate operator-supplied resolved deployment intent before any launch. Runtime independently verifies kernel limits. */
export function validateDeployment(plan, config) {
    if (plan.family !== 'native' || plan.descriptor !== JSON.stringify(config.manifest.descriptor))
        throw Error('Queue family or descriptor mismatch');
    if (plan.publicPorts?.length || plan.privileged || plan.dockerSocket || plan.hostRoot || plan.network === 'host')
        throw Error('Unsafe public/network/host access');
    if (plan.uid !== plan.launcherUid || plan.uid !== plan.workerUid || !Number.isInteger(plan.uid))
        throw Error('Private 0600 socket requires same trusted UID');
    if (!plan.readOnlySource || !plan.readOnlyRootfs || !plan.workerCapsDropped || !plan.launcherPrivateEnvironment)
        throw Error('Trusted source/rootfs/authority constraints required');
    if (plan.serviceLeaf !== `${config.cgroupRoot}/service` || !Number.isInteger(plan.parentPids) || plan.parentPids < 128 || plan.parentPids > 1024)
        throw Error('Common parent service leaf and finite PID envelope required');
    if (config.manifest.resources.maxCaseMemoryMb !== 512)
        throw Error('Qualification profile must retain 512 MiB capacity');
    const r = config.manifest.resources;
    if (r.envelopeMemoryMb > r.physicalMemoryMb - Math.max(1024, Math.ceil(r.physicalMemoryMb * .2)))
        throw Error('Insufficient OS memory headroom');
    if (!Array.isArray(plan.mounts) || plan.mounts.some(m => !['artifact', 'work', 'socket', 'cgroup'].includes(m.kind) || (m.kind === 'artifact' && !m.readOnly)))
        throw Error('Unexpected writable mount');
    return true;
}
