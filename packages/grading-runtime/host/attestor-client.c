#include "common.h"
#include <arpa/inet.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/random.h>
#include <unistd.h>
static int proof_config(const Proof *p, const Config *c, const char hash[65]) {
    return strcmp(p->configSha256, hash) || p->helperUid != c->uid || p->helperGid != c->gid ||
                   p->helperUserNamespaceDevice != c->hostUserNamespaceDevice ||
                   p->helperUserNamespaceInode != c->hostUserNamespaceInode ||
                   strcmp(p->socketPath, c->attestorSocket) ||
                   strcmp(p->helperExecutable, c->attestorExecutable) ||
                   strcmp(p->helperExecutableSha256, c->attestorExecutableSha256) ||
                   strcmp(p->clientExecutable, c->clientExecutable) ||
                   strcmp(p->clientExecutableSha256, c->clientExecutableSha256) ||
                   strcmp(p->attestorUnitSha256, c->attestorUnitSha256) ||
                   strcmp(p->artifactTreeIdentity, c->artifactTreeIdentity)
               ? -1
               : 0;
}
static int peer_matches(const Proof *p, const struct ucred *peer, const struct stat *socket) {
    return p->helperPid != (uint64_t)peer->pid || p->helperUid != peer->uid ||
                   p->helperGid != peer->gid || p->socketDevice != (uint64_t)socket->st_dev ||
                   p->socketInode != (uint64_t)socket->st_ino || p->socketUid != socket->st_uid ||
                   p->socketGid != socket->st_gid || p->socketMode != (socket->st_mode & 07777)
               ? -1
               : 0;
}
static int run(int bootstrap) {
    Deadline d;
    Config config;
    Proof proof = {0}, after = {0};
    Daemon daemon;
    uid_t owner;
    char config_hash[65], proof_hash[65] = {0}, boot[37], before_start[32], after_start[32],
                          group[PATH_MAXIMUM];
    if (deadline_new(&d) || root_owner(&owner) || config_load(&config, config_hash, owner, &d) ||
        boot_id(boot, &d))
        return fail("ATTESTOR_CLIENT_CONFIG");
    if (bootstrap && (getuid() != 0 || geteuid() != 0))
        return fail("ATTESTOR_CLIENT_BOOTSTRAP");
    if (!bootstrap && (getuid() != config.uid || getgid() != config.gid ||
                       proof_load(&proof, proof_hash, owner, &d) ||
                       proof_config(&proof, &config, config_hash) || strcmp(proof.bootId, boot)))
        return fail("ATTESTOR_CLIENT_PROOF");
    struct stat self;
    if (executable_identity(getpid(), config.clientExecutable, config.clientExecutableSha256, owner,
                            &self, &d) ||
        (!bootstrap && ((uint64_t)self.st_dev != proof.clientExecutableDevice ||
                        (uint64_t)self.st_ino != proof.clientExecutableInode)))
        return fail("ATTESTOR_CLIENT_EXECUTABLE");
    struct ucred peer;
    struct stat socket, final_socket;
    int pidfd = -1;
    int fd = connect_peer(config.attestorSocket, (uid_t)config.uid, &pidfd, &peer, &socket, &d);
    if (fd < 0)
        return fail("ATTESTOR_CLIENT_PEER");
    const char *error = "ATTESTOR_CLIENT_PEER";
    int result = 1;
    if (bootstrap) {
        if (bootstrap_snapshot(&config, &peer, &socket, &proof, &d))
            goto done;
        strcpy(proof.configSha256, config_hash);
        strcpy(proof.bootId, boot);
    } else if (peer_matches(&proof, &peer, &socket))
        goto done;
    if (process_start(peer.pid, before_start, &d) || strcmp(before_start, proof.helperStartTime) ||
        process_cgroup(peer.pid, &config, group, &d) || strcmp(group, proof.helperCgroup))
        goto done;
    unsigned char request[REQUEST_SIZE] = {0}, header[RESPONSE_SIZE];
    memcpy(request, "COVEAT01", 8);
    error = "ATTESTOR_CLIENT_PROTOCOL";
    if (getrandom(request + 8, 32, GRND_NONBLOCK) != 32)
        goto done;
    uint32_t net = htonl(1);
    memcpy(request + 40, &net, 4);
    if (io_exact(fd, request, sizeof(request), 1, &d) || shutdown(fd, SHUT_WR) ||
        io_exact(fd, header, sizeof(header), 0, &d) || memcmp(header, "COVEAR01", 8) ||
        memcmp(header + 8, request + 8, 32))
        goto done;
    uint32_t status, length;
    memcpy(&status, header + 40, 4);
    memcpy(&length, header + 44, 4);
    status = ntohl(status);
    length = ntohl(length);
    if (status || !length || length > FRAME_MAX - RESPONSE_SIZE)
        goto done;
    char payload[FRAME_MAX - RESPONSE_SIZE + 1], instance[65], reply_config[65], reply_boot[37];
    if (io_exact(fd, payload, length, 0, &d) || memchr(payload, 0, length))
        goto done;
    payload[length] = 0;
    unsigned char extra;
    if (wait_fd(fd, POLLIN, &d) || recv(fd, &extra, 1, 0) != 0 ||
        reply_parse(payload, &daemon, instance, reply_config, reply_boot))
        goto done;
    if (strcmp(reply_config, config_hash) || strcmp(reply_boot, boot) || daemon.uid != config.uid ||
        strcmp(daemon.executable, config.daemonExecutable) ||
        strcmp(daemon.executableSha256, config.daemonExecutableSha256))
        goto done;
    error = "ATTESTOR_CLIENT_CHANGED";
    if (bootstrap)
        strcpy(proof.instance, instance);
    else if (strcmp(proof.instance, instance))
        goto done;
    if (process_start(peer.pid, after_start, &d) || strcmp(before_start, after_start) ||
        process_cgroup(peer.pid, &config, group, &d) || strcmp(group, proof.helperCgroup) ||
        socket_stat(config.attestorSocket, (uid_t)config.uid, &final_socket) ||
        !same_stat(&socket, &final_socket) || pid_alive(pidfd))
        goto done;
    char fresh_hash[65];
    Config fresh_config;
    if (config_load(&fresh_config, fresh_hash, owner, &d) || strcmp(config_hash, fresh_hash) ||
        memcmp(&config, &fresh_config, sizeof(config)))
        goto done;
    if (bootstrap) {
        after = proof;
        if (bootstrap_snapshot(&config, &peer, &final_socket, &after, &d) ||
            memcmp(&proof, &after, sizeof(proof)))
            goto done;
    } else if (proof_load(&after, fresh_hash, owner, &d) || strcmp(proof_hash, fresh_hash) ||
               memcmp(&proof, &after, sizeof(proof)))
        goto done;
    if (!deadline_left(&d))
        goto done;
    char output[FRAME_MAX + 1];
    int n;
    if (bootstrap) {
        n = proof_encode(&proof, output, sizeof(output));
        Proof validated;
        if (n < 0 || proof_parse(output, &validated))
            goto done;
    } else {
        char identity[2048];
        if (daemon_encode(&daemon, identity, sizeof(identity)) < 0)
            goto done;
        n = snprintf(output, sizeof(output), "{\"version\":1,\"proofSha256\":\"%s\",\"daemon\":%s}",
                     proof_hash, identity);
    }
    if (n <= 0 || (size_t)n >= sizeof(output))
        goto done;
    if (fwrite(output, 1, (size_t)n, stdout) != (size_t)n || putchar('\n') == EOF || fflush(stdout))
        goto done;
    result = 0;
done:
    close(pidfd);
    close(fd);
    return result ? fail(error) : 0;
}
int main(int argc, char **argv) {
    int bootstrap = argc == 2 && !strcmp(argv[1], "--bootstrap");
    if (argc != 1 && !bootstrap)
        return fail("ATTESTOR_CLIENT_ARGUMENT");
    if (clearenv() || close_inherited())
        return fail("ATTESTOR_CLIENT_STARTUP");
    return run(bootstrap);
}
