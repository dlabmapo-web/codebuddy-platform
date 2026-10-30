#include "common.h"
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <unistd.h>
static int proc_read(pid_t pid, const char *name, char *out, size_t capacity, const Deadline *d) {
    char path[80];
    int n = snprintf(path, sizeof(path), "/proc/%ld/%s", (long)pid, name);
    if (n < 0 || (size_t)n >= sizeof(path))
        return -1;
    int fd = open(path, O_RDONLY | O_CLOEXEC | O_NONBLOCK | O_NOFOLLOW);
    if (fd < 0)
        return -1;
    n = read_bounded(fd, out, capacity, d);
    close(fd);
    return n;
}
int boot_id(char out[37], const Deadline *d) {
    char data[40];
    int fd = open("/proc/sys/kernel/random/boot_id", O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0)
        return -1;
    int n = read_bounded(fd, data, sizeof(data), d);
    close(fd);
    if (n != 37 || data[36] != '\n')
        return -1;
    memcpy(out, data, 36);
    out[36] = 0;
    return 0;
}
int process_start(pid_t pid, char out[32], const Deadline *d) {
    char data[4096];
    if (proc_read(pid, "stat", data, sizeof(data), d) < 0)
        return -1;
    char *end = strrchr(data, ')');
    if (!end || end[1] != ' ')
        return -1;
    char *p = end + 2;
    for (int field = 3; field < 22; field++) {
        p = strchr(p, ' ');
        if (!p)
            return -1;
        p++;
    }
    end = strchr(p, ' ');
    if (!end)
        return -1;
    size_t n = (size_t)(end - p);
    if (!n || n >= 32 || p[0] == '0')
        return -1;
    for (size_t i = 0; i < n; i++)
        if (p[i] < '0' || p[i] > '9')
            return -1;
    memcpy(out, p, n);
    out[n] = 0;
    return 0;
}
int process_cgroup(pid_t pid, const Config *c, char out[PATH_MAXIMUM], const Deadline *d) {
    char data[4096];
    if (proc_read(pid, "cgroup", data, sizeof(data), d) < 0)
        return -1;
    char *line = data;
    int found = 0;
    while (*line) {
        char *end = strchr(line, '\n');
        if (!end)
            return -1;
        *end = 0;
        if (!strncmp(line, "0::/", 4)) {
            if (found++)
                return -1;
            int n = snprintf(out, PATH_MAXIMUM, "/sys/fs/cgroup%s", line + 3);
            if (n < 0 || n >= PATH_MAXIMUM || canonical(out))
                return -1;
        }
        line = end + 1;
    }
    size_t n = strlen(c->cgroupParent);
    return found != 1 || strncmp(out, c->cgroupParent, n) || out[n] != '/' ? -1 : 0;
}
static int namespace_stat(pid_t pid, struct stat *st) {
    char path[80];
    int n = snprintf(path, sizeof(path), "/proc/%ld/ns/user", (long)pid);
    return n < 0 || (size_t)n >= sizeof(path) || stat(path, st) ? -1 : 0;
}
static int process_credentials(pid_t pid, uint64_t uid, uint64_t gid, int hardened,
                               const Deadline *d) {
    char data[8192];
    if (proc_read(pid, "status", data, sizeof(data), d) < 0)
        return -1;
    const char *names[] = {
        "Uid:", "Gid:", "CapEff:", "CapPrm:", "CapAmb:", "NoNewPrivs:", "Seccomp:"};
    unsigned seen = 0;
    char *line = data;
    while (*line) {
        char *end = strchr(line, '\n');
        if (!end)
            return -1;
        *end = 0;
        for (unsigned i = 0; i < 7; i++)
            if (!strncmp(line, names[i], strlen(names[i]))) {
                if (seen & (1U << i))
                    return -1;
                seen |= 1U << i;
                unsigned long long a, b, c, e;
                char tail;
                if (i < 2) {
                    if (sscanf(line + 4, "%llu %llu %llu %llu %c", &a, &b, &c, &e, &tail) != 4 ||
                        a != (i ? gid : uid) || a != b || a != c || a != e)
                        return -1;
                } else if (i < 5) {
                    if (sscanf(line + strlen(names[i]), "%llx %c", &a, &tail) != 1 || a)
                        return -1;
                } else if (sscanf(line + strlen(names[i]), "%llu %c", &a, &tail) != 1 ||
                           (hardened && a != (i == 5 ? 1 : 2)))
                    return -1;
            }
        line = end + 1;
    }
    return seen == 127 ? 0 : -1;
}
int executable_identity(pid_t pid, const char *expected, const char *hash, uid_t owner,
                        struct stat *result, const Deadline *d) {
    struct stat reviewed, first, last;
    int canonical_fd = secure_open(expected, owner, &reviewed);
    if (canonical_fd < 0)
        return -1;
    close(canonical_fd);
    if (!(reviewed.st_mode & 0111))
        return -1;
    char path[80], link[PATH_MAXIMUM], digest[65];
    int n = snprintf(path, sizeof(path), "/proc/%ld/exe", (long)pid);
    if (n < 0 || (size_t)n >= sizeof(path))
        return -1;
    ssize_t length = readlink(path, link, sizeof(link) - 1);
    if (length < 0 || (size_t)length >= sizeof(link) - 1)
        return -1;
    link[length] = 0;
    if (strcmp(link, expected))
        return -1;
    int fd = open(path, O_RDONLY | O_CLOEXEC | O_NONBLOCK);
    if (fd < 0)
        return -1;
    int bad = fstat(fd, &first) || !same_stat(&reviewed, &first) || hash_fd(fd, digest, d) ||
              strcmp(digest, hash) || fstat(fd, &last) || !same_stat(&first, &last);
    close(fd);
    if (bad)
        return -1;
    length = readlink(path, link, sizeof(link) - 1);
    if (length < 0 || (size_t)length >= sizeof(link) - 1)
        return -1;
    link[length] = 0;
    if (strcmp(link, expected) || stat(path, &last) || !same_stat(&first, &last))
        return -1;
    *result = first;
    return 0;
}
/* SO_PEERCRED describes socket creation credentials; verify current UID as well. */
static int daemon_uid(pid_t pid, uint64_t expected, const Deadline *d) {
    char data[8192];
    if (proc_read(pid, "status", data, sizeof(data), d) < 0)
        return -1;
    char *line = data;
    int found = 0;
    while (*line) {
        char *end = strchr(line, '\n');
        if (!end)
            return -1;
        *end = 0;
        if (!strncmp(line, "Uid:", 4)) {
            unsigned long long real, effective, saved, filesystem;
            char tail;
            if (found++ ||
                sscanf(line + 4, "%llu %llu %llu %llu %c", &real, &effective, &saved, &filesystem,
                       &tail) != 4 ||
                real != expected || effective != expected || saved != expected ||
                filesystem != expected)
                return -1;
        }
        line = end + 1;
    }
    return found == 1 ? 0 : -1;
}
static int daemon_snapshot(const Config *c, const struct ucred *peer, Daemon *daemon,
                           char group[PATH_MAXIMUM], const Deadline *d) {
    memset(daemon, 0, sizeof(*daemon));
    if (peer->uid != c->uid || daemon_uid(peer->pid, c->uid, d))
        return -1;
    char before[32], after[32], cmdline[8192], path[80];
    struct stat exe;
    if (process_start(peer->pid, before, d) || process_cgroup(peer->pid, c, group, d) ||
        executable_identity(peer->pid, c->daemonExecutable, c->daemonExecutableSha256, 0, &exe, d))
        return -1;
    int n = snprintf(path, sizeof(path), "/proc/%ld/cmdline", (long)peer->pid);
    if (n < 0 || (size_t)n >= sizeof(path))
        return -1;
    int fd = open(path, O_RDONLY | O_CLOEXEC | O_NONBLOCK | O_NOFOLLOW);
    if (fd < 0)
        return -1;
    size_t total = 0;
    for (;;) {
        if (!deadline_left(d) || total == sizeof(cmdline)) {
            close(fd);
            return -1;
        }
        ssize_t count = read(fd, cmdline + total, sizeof(cmdline) - total);
        if (count < 0) {
            close(fd);
            return -1;
        }
        if (!count)
            break;
        total += (size_t)count;
    }
    close(fd);
    if (!total || cmdline[total - 1])
        return -1;
    char argument[PATH_MAXIMUM + 15];
    n = snprintf(argument, sizeof(argument), "--config-file=%s", c->daemonConfig);
    if (n < 0 || (size_t)n >= sizeof(argument))
        return -1;
    int found = 0;
    for (size_t i = 0; i < total;) {
        size_t length = strnlen(cmdline + i, total - i);
        if (length == total - i)
            return -1;
        if (!strcmp(cmdline + i, argument))
            found++;
        else if (!strncmp(cmdline + i, "--config-file", 13))
            return -1;
        i += length + 1;
    }
    if (found != 1 || process_start(peer->pid, after, d) || strcmp(before, after))
        return -1;
    daemon->version = 1;
    daemon->pid = (uint64_t)peer->pid;
    daemon->uid = c->uid;
    strcpy(daemon->startTime, before);
    strcpy(daemon->executable, c->daemonExecutable);
    strcpy(daemon->executableSha256, c->daemonExecutableSha256);
    daemon->executableDevice = (uint64_t)exe.st_dev;
    daemon->executableInode = (uint64_t)exe.st_ino;
    return 0;
}
int daemon_attest(const Config *c, Daemon *daemon, const Deadline *d) {
    struct stat before, after;
    struct ucred peer;
    int pidfd = -1;
    int fd = connect_peer(c->daemonSocket, (uid_t)c->uid, &pidfd, &peer, &before, d);
    if (fd < 0)
        return -1;
    Daemon first, second;
    char group1[PATH_MAXIMUM], group2[PATH_MAXIMUM];
    int bad = daemon_snapshot(c, &peer, &first, group1, d) ||
              daemon_snapshot(c, &peer, &second, group2, d) ||
              memcmp(&first, &second, sizeof(first)) || strcmp(group1, group2) ||
              socket_stat(c->daemonSocket, (uid_t)c->uid, &after) || !same_stat(&before, &after) ||
              pid_alive(pidfd) || !deadline_left(d);
    if (!bad) {
        *daemon = second;
        daemon->socketDevice = (uint64_t)after.st_dev;
        daemon->socketInode = (uint64_t)after.st_ino;
    }
    close(pidfd);
    close(fd);
    return bad ? -1 : 0;
}
int helper_self_check(const Config *c, const Deadline *d) {
    struct stat self;
    char group[PATH_MAXIMUM];
    if (getuid() != c->uid || geteuid() != c->uid || getgid() != c->gid || getegid() != c->gid ||
        namespace_stat(getpid(), &self) || (uint64_t)self.st_dev != c->hostUserNamespaceDevice ||
        (uint64_t)self.st_ino != c->hostUserNamespaceInode ||
        process_credentials(getpid(), c->uid, c->gid, 0, d) ||
        process_cgroup(getpid(), c, group, d))
        return -1;
    int n = getgroups(0, NULL);
    if (n < 0 || n > 1)
        return -1;
    if (n == 1) {
        gid_t group_id;
        if (getgroups(1, &group_id) != 1 || group_id != c->gid)
            return -1;
    }
    return 0;
}
int process_status_root_owned(pid_t pid) {
    struct stat proc;
    char path[80];
    /* task_dump_owner exempts 0555 directories such as /proc/PID. The fixed
     * status file reflects dumpability; ownership alone cannot distinguish 0/2. */
    int n = snprintf(path, sizeof(path), "/proc/%ld/status", (long)pid);
    if (n < 0 || (size_t)n >= sizeof(path))
        return -1;
    int fd = open(path, O_RDONLY | O_CLOEXEC | O_NONBLOCK | O_NOFOLLOW);
    if (fd < 0)
        return -1;
    int bad = fstat(fd, &proc) || !S_ISREG(proc.st_mode) || proc.st_uid != 0 || proc.st_gid != 0;
    close(fd);
    return bad ? -1 : 0;
}
int bootstrap_snapshot(const Config *c, const struct ucred *peer, const struct stat *socket,
                       Proof *p, const Deadline *d) {
    struct stat host, ns, exe, client;
    if (geteuid() != 0 || peer->uid != c->uid || peer->gid != c->gid)
        return -1;
    if (namespace_stat(1, &host) || namespace_stat(peer->pid, &ns) || host.st_dev != ns.st_dev ||
        host.st_ino != ns.st_ino || (uint64_t)host.st_dev != c->hostUserNamespaceDevice ||
        (uint64_t)host.st_ino != c->hostUserNamespaceInode ||
        process_credentials(peer->pid, c->uid, c->gid, 1, d) ||
        process_start(peer->pid, p->helperStartTime, d) ||
        process_cgroup(peer->pid, c, p->helperCgroup, d) ||
        executable_identity(peer->pid, c->attestorExecutable, c->attestorExecutableSha256, 0, &exe,
                            d) ||
        executable_identity(getpid(), c->clientExecutable, c->clientExecutableSha256, 0, &client,
                            d))
        return -1;
    if (process_status_root_owned(peer->pid))
        return -1;
    if ((socket->st_mode & 07777) != 0600 || socket->st_uid != c->uid || socket->st_gid != c->gid)
        return -1;
    p->version = 1;
    p->helperPid = (uint64_t)peer->pid;
    p->helperUid = peer->uid;
    p->helperGid = peer->gid;
    p->helperUserNamespaceDevice = (uint64_t)ns.st_dev;
    p->helperUserNamespaceInode = (uint64_t)ns.st_ino;
    strcpy(p->helperExecutable, c->attestorExecutable);
    p->helperExecutableDevice = (uint64_t)exe.st_dev;
    p->helperExecutableInode = (uint64_t)exe.st_ino;
    strcpy(p->helperExecutableSha256, c->attestorExecutableSha256);
    strcpy(p->socketPath, c->attestorSocket);
    p->socketDevice = (uint64_t)socket->st_dev;
    p->socketInode = (uint64_t)socket->st_ino;
    p->socketUid = socket->st_uid;
    p->socketGid = socket->st_gid;
    p->socketMode = socket->st_mode & 07777;
    p->noNewPrivs = 1;
    p->seccomp = 2;
    p->dumpable = 0;
    strcpy(p->dumpabilityEvidence, "native-prctl-and-proc-owner");
    strcpy(p->clientExecutable, c->clientExecutable);
    p->clientExecutableDevice = (uint64_t)client.st_dev;
    p->clientExecutableInode = (uint64_t)client.st_ino;
    strcpy(p->clientExecutableSha256, c->clientExecutableSha256);
    strcpy(p->attestorUnitSha256, c->attestorUnitSha256);
    strcpy(p->artifactTreeIdentity, c->artifactTreeIdentity);
    return 0;
}
