#ifndef COVE_ATTESTOR_COMMON_H
#define COVE_ATTESTOR_COMMON_H
#define _GNU_SOURCE
#include <stddef.h>
#include <stdint.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#define FRAME_MAX 8192
#define PATH_MAXIMUM 512
#define CONFIG_PATH "/etc/cove-grading/attestor/config.json"
#define PROOF_PATH "/etc/cove-grading/attestor/proof.json"
#define SAFE_INTEGER UINT64_C(9007199254740991)
#define REQUEST_SIZE 48
#define RESPONSE_SIZE 48
#ifndef COVE_JSMN_IMPLEMENTATION
#define JSMN_HEADER
#else
#define JSMN_STRICT
#endif
#include "vendor/jsmn/jsmn.h"

typedef struct {
    char text[FRAME_MAX + 1];
    jsmntok_t token[128];
    int count;
} Json;
typedef struct {
    uint64_t version, uid, gid, hostUserNamespaceDevice, hostUserNamespaceInode;
    char daemonSocket[108], daemonExecutable[PATH_MAXIMUM], daemonExecutableSha256[65];
    char daemonConfig[PATH_MAXIMUM], cgroupParent[PATH_MAXIMUM], attestorSocket[108];
    char attestorExecutable[PATH_MAXIMUM], attestorExecutableSha256[65];
    char clientExecutable[PATH_MAXIMUM], clientExecutableSha256[65];
    char attestorUnitSha256[65], artifactTreeIdentity[65];
} Config;
typedef struct {
    uint64_t version, pid, uid;
    char startTime[32], executable[PATH_MAXIMUM];
    uint64_t executableDevice, executableInode;
    char executableSha256[65];
    uint64_t socketDevice, socketInode;
} Daemon;
typedef struct {
    uint64_t version;
    char bootId[37], instance[65], configSha256[65];
    uint64_t helperPid, helperUid, helperGid;
    char helperStartTime[32];
    uint64_t helperUserNamespaceDevice, helperUserNamespaceInode;
    char helperCgroup[PATH_MAXIMUM], helperExecutable[PATH_MAXIMUM];
    uint64_t helperExecutableDevice, helperExecutableInode;
    char helperExecutableSha256[65], socketPath[108];
    uint64_t socketDevice, socketInode, socketUid, socketGid, socketMode;
    uint64_t noNewPrivs, seccomp, dumpable;
    char dumpabilityEvidence[40], clientExecutable[PATH_MAXIMUM];
    uint64_t clientExecutableDevice, clientExecutableInode;
    char clientExecutableSha256[65], attestorUnitSha256[65], artifactTreeIdentity[65];
} Proof;
typedef struct {
    int64_t end;
} Deadline;

int fail(const char *classification);
int deadline_new(Deadline *deadline);
int deadline_left(const Deadline *deadline);
int wait_fd(int fd, short events, const Deadline *deadline);
int io_exact(int fd, void *data, size_t length, int writing, const Deadline *deadline);
int read_bounded(int fd, char *data, size_t capacity, const Deadline *deadline);
int hash_fd(int fd, char out[65], const Deadline *deadline);
int hash_bytes(const void *data, size_t length, char out[65]);
int canonical(const char *path);
int secure_open(const char *path, uid_t owner, struct stat *metadata);
int root_owner(uid_t *owner);
int secure_read(const char *path, uid_t owner, char *data, size_t capacity, char hash[65],
                const Deadline *deadline);
int json_parse(Json *json, const char *data);
int config_parse(const char *data, Config *config);
int config_load(Config *config, char hash[65], uid_t owner, const Deadline *deadline);
int proof_parse(const char *data, Proof *proof);
int proof_load(Proof *proof, char hash[65], uid_t owner, const Deadline *deadline);
int proof_encode(const Proof *proof, char *out, size_t capacity);
int daemon_encode(const Daemon *daemon, char *out, size_t capacity);
int reply_parse(const char *data, Daemon *daemon, char instance[65], char config_hash[65],
                char boot[37]);
int boot_id(char out[37], const Deadline *deadline);
int process_start(pid_t pid, char out[32], const Deadline *deadline);
int process_cgroup(pid_t pid, const Config *config, char out[PATH_MAXIMUM],
                   const Deadline *deadline);
int same_stat(const struct stat *a, const struct stat *b);
int socket_stat(const char *path, uid_t uid, struct stat *result);
int bind_attestor_socket(const Config *config);
int connect_peer(const char *path, uid_t uid, int *pidfd, struct ucred *peer, struct stat *socket,
                 const Deadline *deadline);
int pid_alive(int pidfd);
int executable_identity(pid_t pid, const char *expected, const char *hash, uid_t owner,
                        struct stat *result, const Deadline *deadline);
int daemon_attest(const Config *config, Daemon *daemon, const Deadline *deadline);
int bootstrap_snapshot(const Config *config, const struct ucred *peer, const struct stat *socket,
                       Proof *proof, const Deadline *deadline);
int helper_self_check(const Config *config, const Deadline *deadline);
int policy_install(void);
int close_inherited(void);
#endif
