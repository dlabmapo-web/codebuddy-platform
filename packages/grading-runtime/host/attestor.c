#include "common.h"
#include <arpa/inet.h>
#include <errno.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/random.h>
#include <sys/un.h>
#include <unistd.h>
static int serve(int fd, const Config *config, const char config_hash[65], const char instance[65],
                 const char boot[37]) {
    Deadline d;
    if (deadline_new(&d))
        return -1;
    unsigned char request[REQUEST_SIZE], response[FRAME_MAX];
    char daemon_json[2048], payload[FRAME_MAX - RESPONSE_SIZE];
    uint32_t status = 1;
    int length = 0;
    if (io_exact(fd, request, sizeof(request), 0, &d))
        return -1;
    uint32_t op, reserved;
    memcpy(&op, request + 40, 4);
    memcpy(&reserved, request + 44, 4);
    /* Client must half-close after its single request. This makes trailing
     * bytes unambiguously rejectable before any attestation is performed. */
    unsigned char extra;
    if (wait_fd(fd, POLLIN, &d) || recv(fd, &extra, 1, 0) != 0)
        return -1;
    if (!memcmp(request, "COVEAT01", 8) && ntohl(op) == 1 && reserved == 0) {
        Config fresh;
        char current_hash[65];
        Daemon daemon;
        status = 2;
        if (!config_load(&fresh, current_hash, 0, &d) && !strcmp(config_hash, current_hash) &&
            !memcmp(config, &fresh, sizeof(fresh))) {
            status = 3;
            if (!daemon_attest(config, &daemon, &d) &&
                daemon_encode(&daemon, daemon_json, sizeof(daemon_json)) > 0) {
                length = snprintf(payload, sizeof(payload),
                                  "{\"version\":1,\"instance\":\"%s\",\"configSha256\":\"%s\","
                                  "\"bootId\":\"%s\",\"daemon\":%s}",
                                  instance, config_hash, boot, daemon_json);
                if (length > 0 && (size_t)length < sizeof(payload))
                    status = 0;
                else
                    return -1;
            }
        }
    }
    if (status)
        length = 0;
    memcpy(response, "COVEAR01", 8);
    memcpy(response + 8, request + 8, 32);
    uint32_t net = htonl(status);
    memcpy(response + 40, &net, 4);
    net = htonl((uint32_t)length);
    memcpy(response + 44, &net, 4);
    if (length)
        memcpy(response + 48, payload, (size_t)length);
    return io_exact(fd, response, (size_t)length + RESPONSE_SIZE, 1, &d);
}
int main(int argc, char **argv) {
    (void)argv;
    if (argc != 1)
        return fail("ATTESTOR_ARGUMENT");
    if (clearenv() || close_inherited())
        return fail("ATTESTOR_STARTUP");
    Config config;
    char config_hash[65], instance[65], boot[37];
    Deadline d;
    unsigned char random[32];
    if (deadline_new(&d) || config_load(&config, config_hash, 0, &d) ||
        helper_self_check(&config, &d) || boot_id(boot, &d) ||
        getrandom(random, sizeof(random), GRND_NONBLOCK) != (ssize_t)sizeof(random))
        return fail("ATTESTOR_CONFIG");
    const char *digits = "0123456789abcdef";
    for (size_t i = 0; i < sizeof(random); i++) {
        instance[i * 2] = digits[random[i] >> 4];
        instance[i * 2 + 1] = digits[random[i] & 15];
    }
    instance[64] = 0;
    struct stat executable;
    if (executable_identity(getpid(), config.attestorExecutable, config.attestorExecutableSha256, 0,
                            &executable, &d))
        return fail("ATTESTOR_EXECUTABLE");
    struct sockaddr_un address = {.sun_family = AF_UNIX};
    strcpy(address.sun_path, config.attestorSocket);
    umask(0077);
    int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (fd < 0 || bind(fd, (struct sockaddr *)&address, sizeof(address)))
        return fail("ATTESTOR_BIND");
    /* Never remove a stale socket automatically: root lifecycle owns cleanup. */
    if (policy_install() || listen(fd, 3))
        return fail("ATTESTOR_POLICY");
    for (;;) {
        struct pollfd ready = {.fd = fd, .events = POLLIN};
        int n = poll(&ready, 1, -1);
        if (n < 0 && errno == EINTR)
            continue;
        if (n != 1 || !(ready.revents & POLLIN))
            return fail("ATTESTOR_LISTENER");
        int connection = accept4(fd, NULL, NULL, SOCK_NONBLOCK | SOCK_CLOEXEC);
        if (connection < 0) {
            if (errno == EAGAIN || errno == EINTR)
                continue;
            return fail("ATTESTOR_ACCEPT");
        }
        (void)serve(connection, &config, config_hash, instance, boot);
        close(connection);
    }
}
