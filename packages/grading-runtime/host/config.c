#define _GNU_SOURCE
#define COVE_JSMN_IMPLEMENTATION
#include "common.h"
#include "mbedtls/sha256.h"
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
static int hex64(const char *s) {
    if (strlen(s) != 64)
        return -1;
    for (size_t i = 0; i < 64; i++)
        if (!((s[i] >= '0' && s[i] <= '9') || (s[i] >= 'a' && s[i] <= 'f')))
            return -1;
    return 0;
}
static int decimal(const char *s) {
    if (!*s || (*s == '0' && s[1]))
        return -1;
    for (; *s; s++)
        if (*s < '0' || *s > '9')
            return -1;
    return 0;
}
static int uuid(const char *s) {
    if (strlen(s) != 36)
        return -1;
    for (size_t i = 0; i < 36; i++) {
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (s[i] != '-')
                return -1;
        } else if (!((s[i] >= '0' && s[i] <= '9') || (s[i] >= 'a' && s[i] <= 'f')))
            return -1;
    }
    return 0;
}
int canonical(const char *path) {
    if (path[0] != '/' || strlen(path) >= PATH_MAXIMUM || path[1] == 0)
        return -1;
    const char *part = path + 1;
    for (const char *s = part;; s++) {
        if (*s == '/' || !*s) {
            size_t n = (size_t)(s - part);
            if (!n || (n == 1 && *part == '.') || (n == 2 && part[0] == '.' && part[1] == '.'))
                return -1;
            if (!*s)
                break;
            part = s + 1;
        } else if (!((*s >= 'a' && *s <= 'z') || (*s >= 'A' && *s <= 'Z') ||
                     (*s >= '0' && *s <= '9') || strchr("_.-:@", *s)))
            return -1;
    }
    return 0;
}
int secure_open(const char *path, uid_t owner, struct stat *metadata) {
    if (canonical(path))
        return -1;
    int directory = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    struct stat st;
    if (directory < 0)
        return -1;
    if (fstat(directory, &st) || st.st_uid != owner || (st.st_mode & 022)) {
        close(directory);
        return -1;
    }
    char copy[PATH_MAXIMUM];
    memcpy(copy, path, strlen(path) + 1);
    char *part = copy + 1;
    for (;;) {
        char *slash = strchr(part, '/');
        if (slash)
            *slash = 0;
        int flags = O_RDONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK;
        if (slash)
            flags |= O_DIRECTORY;
        int next = openat(directory, part, flags);
        close(directory);
        if (next < 0)
            return -1;
        if (fstat(next, &st) || st.st_uid != owner || (st.st_mode & 022) ||
            (slash ? !S_ISDIR(st.st_mode) : (!S_ISREG(st.st_mode) || st.st_nlink != 1))) {
            close(next);
            return -1;
        }
        if (!slash) {
            if (metadata)
                *metadata = st;
            return next;
        }
        directory = next;
        part = slash + 1;
    }
}
int root_owner(uid_t *owner) {
    /* uid_map is kernel data. Overflow is only a representation, never proof of ownership. */
    int fd = open("/proc/self/uid_map", O_RDONLY | O_CLOEXEC);
    char data[4096];
    Deadline deadline;
    if (fd < 0 || deadline_new(&deadline)) {
        if (fd >= 0)
            close(fd);
        return -1;
    }
    int n = read_bounded(fd, data, sizeof(data), &deadline);
    close(fd);
    if (n < 0)
        return -1;
    char *line = data;
    while (*line) {
        unsigned long long inside, outside, count;
        int used = 0;
        if (sscanf(line, "%llu %llu %llu%n", &inside, &outside, &count, &used) != 3 || !count)
            return -1;
        if (outside == 0) {
            if (inside > UINT32_MAX)
                return -1;
            *owner = (uid_t)inside;
            return *owner == geteuid() && geteuid() != 0 ? -1 : 0;
        }
        char *end = strchr(line, '\n');
        if (!end)
            break;
        line = end + 1;
    }
    fd = open("/proc/sys/kernel/overflowuid", O_RDONLY | O_CLOEXEC);
    if (fd < 0)
        return -1;
    n = read_bounded(fd, data, sizeof(data), &deadline);
    close(fd);
    if (n < 0)
        return -1;
    unsigned int value;
    char tail;
    if (sscanf(data, "%u %c", &value, &tail) != 1 || value == geteuid())
        return -1;
    *owner = (uid_t)value;
    return 0;
}
static void digest_hex(const unsigned char digest[32], char out[65]) {
    const char *digits = "0123456789abcdef";
    for (size_t i = 0; i < 32; i++) {
        out[i * 2] = digits[digest[i] >> 4];
        out[i * 2 + 1] = digits[digest[i] & 15];
    }
    out[64] = 0;
}
int hash_bytes(const void *data, size_t length, char out[65]) {
    unsigned char digest[32];
    if (mbedtls_sha256(data, length, digest, 0))
        return -1;
    digest_hex(digest, out);
    return 0;
}
int hash_fd(int fd, char out[65], const Deadline *deadline) {
    mbedtls_sha256_context context;
    unsigned char data[32768], digest[32];
    int ok = -1;
    mbedtls_sha256_init(&context);
    if (mbedtls_sha256_starts(&context, 0))
        goto done;
    for (;;) {
        if (deadline_left(deadline) <= 0)
            goto done;
        ssize_t n = read(fd, data, sizeof(data));
        if (n < 0) {
            if (errno == EINTR)
                continue;
            goto done;
        }
        if (!n)
            break;
        if (mbedtls_sha256_update(&context, data, (size_t)n))
            goto done;
    }
    if (mbedtls_sha256_finish(&context, digest))
        goto done;
    digest_hex(digest, out);
    ok = 0;
done:
    mbedtls_sha256_free(&context);
    return ok;
}
int secure_read(const char *path, uid_t owner, char *data, size_t capacity, char hash[65],
                const Deadline *deadline) {
    struct stat before, after;
    int fd = secure_open(path, owner, &before);
    if (fd < 0)
        return -1;
    int n = -1;
    if (before.st_size > 0 && (uint64_t)before.st_size < capacity)
        n = read_bounded(fd, data, capacity, deadline);
    int result = n >= 0 && !fstat(fd, &after) && same_stat(&before, &after) &&
                         n == before.st_size && !hash_bytes(data, (size_t)n, hash)
                     ? 0
                     : -1;
    close(fd);
    return result;
}
/* jsmn provides bounded tokenization. This small grammar gate rejects its deliberately
 * permissive comma/colon handling; the application accepts only objects, strings,
 * and unsigned safe integers, with no JSON escapes or alternate number syntax. */
static void space(const char **p) {
    while (**p == ' ' || **p == '\n' || **p == '\r' || **p == '\t')
        (*p)++;
}
static int string(const char **p) {
    if (*(*p)++ != '"')
        return -1;
    while (**p && **p != '"') {
        unsigned char c = (unsigned char)*(*p)++;
        if (c < 32 || c > 126 || c == '\\')
            return -1;
    }
    if (**p != '"')
        return -1;
    (*p)++;
    return 0;
}
static int value(const char **p, int depth) {
    space(p);
    if (depth > 3)
        return -1;
    if (**p == '"')
        return string(p);
    if (**p == '{') {
        (*p)++;
        space(p);
        if (**p == '}') {
            (*p)++;
            return 0;
        }
        for (;;) {
            if (**p != '"' || string(p))
                return -1;
            space(p);
            if (*(*p)++ != ':')
                return -1;
            if (value(p, depth + 1))
                return -1;
            space(p);
            if (**p == '}') {
                (*p)++;
                return 0;
            }
            if (*(*p)++ != ',')
                return -1;
            space(p);
        }
    }
    if (**p < '0' || **p > '9')
        return -1;
    uint64_t number = 0;
    const char *start = *p;
    do {
        if (number > (SAFE_INTEGER - (unsigned)(**p - '0')) / 10)
            return -1;
        number = number * 10 + (unsigned)(*(*p)++ - '0');
    } while (**p >= '0' && **p <= '9');
    return *start == '0' && *p - start > 1 ? -1 : 0;
}
static int token_equal(const Json *j, int a, int b) {
    int n = j->token[a].end - j->token[a].start;
    return n == j->token[b].end - j->token[b].start &&
           !memcmp(j->text + j->token[a].start, j->text + j->token[b].start, (size_t)n);
}
int json_parse(Json *j, const char *data) {
    size_t length = strnlen(data, FRAME_MAX + 1);
    if (!length || length > FRAME_MAX)
        return -1;
    const char *p = data;
    if (value(&p, 0))
        return -1;
    space(&p);
    if (*p)
        return -1;
    memcpy(j->text, data, length + 1);
    jsmn_parser parser;
    jsmn_init(&parser);
    j->count = jsmn_parse(&parser, j->text, length, j->token, 128);
    if (j->count < 1 || j->token[0].type != JSMN_OBJECT)
        return -1;
    for (int object = 0; object < j->count; object++)
        if (j->token[object].type == JSMN_OBJECT) {
            int keys[64], count = 0;
            for (int i = object + 1; i < j->count && j->token[i].start < j->token[object].end;) {
                if (count >= 64 || j->token[i].type != JSMN_STRING || i + 1 >= j->count)
                    return -1;
                for (int k = 0; k < count; k++)
                    if (token_equal(j, i, keys[k]))
                        return -1;
                keys[count++] = i;
                int end = j->token[i + 1].end;
                i += 2;
                while (i < j->count && j->token[i].start < end)
                    i++;
            }
        }
    return 0;
}
typedef struct {
    const char *name;
    size_t offset, size;
    int kind;
} Field;
#define N(T, k) {#k, offsetof(T, k), sizeof(((T *)0)->k), 0}
#define S(T, k) {#k, offsetof(T, k), sizeof(((T *)0)->k), 1}
static const Field config_fields[] = {N(Config, version),
                                      N(Config, uid),
                                      N(Config, gid),
                                      N(Config, hostUserNamespaceDevice),
                                      N(Config, hostUserNamespaceInode),
                                      S(Config, daemonSocket),
                                      S(Config, daemonExecutable),
                                      S(Config, daemonExecutableSha256),
                                      S(Config, daemonConfig),
                                      S(Config, cgroupParent),
                                      S(Config, attestorSocket),
                                      S(Config, attestorExecutable),
                                      S(Config, attestorExecutableSha256),
                                      S(Config, clientExecutable),
                                      S(Config, clientExecutableSha256),
                                      S(Config, attestorUnitSha256),
                                      S(Config, artifactTreeIdentity)};
static const Field daemon_fields[] = {N(Daemon, version),
                                      N(Daemon, pid),
                                      N(Daemon, uid),
                                      S(Daemon, startTime),
                                      S(Daemon, executable),
                                      N(Daemon, executableDevice),
                                      N(Daemon, executableInode),
                                      S(Daemon, executableSha256),
                                      N(Daemon, socketDevice),
                                      N(Daemon, socketInode)};
static const Field proof_fields[] = {N(Proof, version),
                                     S(Proof, bootId),
                                     S(Proof, instance),
                                     S(Proof, configSha256),
                                     N(Proof, helperPid),
                                     N(Proof, helperUid),
                                     N(Proof, helperGid),
                                     S(Proof, helperStartTime),
                                     N(Proof, helperUserNamespaceDevice),
                                     N(Proof, helperUserNamespaceInode),
                                     S(Proof, helperCgroup),
                                     S(Proof, helperExecutable),
                                     N(Proof, helperExecutableDevice),
                                     N(Proof, helperExecutableInode),
                                     S(Proof, helperExecutableSha256),
                                     S(Proof, socketPath),
                                     N(Proof, socketDevice),
                                     N(Proof, socketInode),
                                     N(Proof, socketUid),
                                     N(Proof, socketGid),
                                     N(Proof, socketMode),
                                     N(Proof, noNewPrivs),
                                     N(Proof, seccomp),
                                     N(Proof, dumpable),
                                     S(Proof, dumpabilityEvidence),
                                     S(Proof, clientExecutable),
                                     N(Proof, clientExecutableDevice),
                                     N(Proof, clientExecutableInode),
                                     S(Proof, clientExecutableSha256),
                                     S(Proof, attestorUnitSha256),
                                     S(Proof, artifactTreeIdentity)};
#define COUNT(x) (sizeof(x) / sizeof((x)[0]))
static int decode(const Json *j, int object, const Field *fields, size_t count, void *out) {
    if (j->token[object].type != JSMN_OBJECT || j->token[object].size != (int)count)
        return -1;
    uint64_t seen = 0;
    for (int i = object + 1; i < j->count && j->token[i].start < j->token[object].end; i += 2) {
        if (i + 1 >= j->count)
            return -1;
        const jsmntok_t *key = &j->token[i], *v = &j->token[i + 1];
        size_t k = 0;
        for (; k < count; k++)
            if (strlen(fields[k].name) == (size_t)(key->end - key->start) &&
                !memcmp(fields[k].name, j->text + key->start, strlen(fields[k].name)))
                break;
        if (k == count || (seen & (UINT64_C(1) << k)))
            return -1;
        seen |= UINT64_C(1) << k;
        char *target = (char *)out + fields[k].offset;
        size_t length = (size_t)(v->end - v->start);
        if (fields[k].kind) {
            if (v->type != JSMN_STRING || !length || length >= fields[k].size)
                return -1;
            memcpy(target, j->text + v->start, length);
            target[length] = 0;
        } else {
            if (v->type != JSMN_PRIMITIVE || !length || length > 16)
                return -1;
            uint64_t n = 0;
            for (int x = v->start; x < v->end; x++)
                n = n * 10 + (unsigned)(j->text[x] - '0');
            memcpy(target, &n, sizeof(n));
        }
    }
    return seen == ((UINT64_C(1) << count) - 1) ? 0 : -1;
}
static int encode(const void *object, const Field *fields, size_t count, char *out,
                  size_t capacity) {
    size_t offset = 0;
    int n = snprintf(out, capacity, "{");
    if (n < 0)
        return -1;
    offset = (size_t)n;
    for (size_t i = 0; i < count; i++) {
        const void *source = (const char *)object + fields[i].offset;
        uint64_t number = 0;
        if (!fields[i].kind)
            memcpy(&number, source, sizeof(number));
        n = fields[i].kind ? snprintf(out + offset, capacity - offset, "%s\"%s\":\"%s\"",
                                      i ? "," : "", fields[i].name, (const char *)source)
                           : snprintf(out + offset, capacity - offset, "%s\"%s\":%" PRIu64,
                                      i ? "," : "", fields[i].name, number);
        if (n < 0 || (size_t)n >= capacity - offset)
            return -1;
        offset += (size_t)n;
    }
    if (offset + 2 > capacity)
        return -1;
    out[offset++] = '}';
    out[offset] = 0;
    return (int)offset;
}
static int executable_profile(const char *path, const char *name) {
    size_t n = strlen(path), m = strlen(name);
    return canonical(path) || strncmp(path, "/opt/cove/grading/", 18) || n <= m ||
                   strcmp(path + n - m, name)
               ? -1
               : 0;
}
int config_parse(const char *data, Config *c) {
    Json j;
    memset(c, 0, sizeof(*c));
    if (json_parse(&j, data) || decode(&j, 0, config_fields, COUNT(config_fields), c))
        return -1;
    char socket[108];
    int n = snprintf(socket, sizeof(socket), "/run/user/%" PRIu64 "/cove-grading/attestor.sock",
                     c->uid);
    if (n < 0 || (size_t)n >= sizeof(socket) || c->version != 1 || !c->uid || c->uid > UINT32_MAX ||
        !c->gid || c->gid > UINT32_MAX || strcmp(c->attestorSocket, socket))
        return -1;
    n = snprintf(socket, sizeof(socket), "/run/user/%" PRIu64 "/cove-grading/docker.sock", c->uid);
    if (n < 0 || (size_t)n >= sizeof(socket) || strcmp(c->daemonSocket, socket) ||
        canonical(c->daemonExecutable) || canonical(c->daemonConfig) || canonical(c->cgroupParent))
        return -1;
    if (strncmp(c->cgroupParent, "/sys/fs/cgroup", 14) ||
        (c->cgroupParent[14] && c->cgroupParent[14] != '/'))
        return -1;
    if (executable_profile(c->attestorExecutable, "/host/bin/attestor") ||
        executable_profile(c->clientExecutable, "/host/bin/attestor-client"))
        return -1;
    return hex64(c->daemonExecutableSha256) || hex64(c->attestorExecutableSha256) ||
                   hex64(c->clientExecutableSha256) || hex64(c->attestorUnitSha256) ||
                   hex64(c->artifactTreeIdentity)
               ? -1
               : 0;
}
int config_load(Config *c, char hash[65], uid_t owner, const Deadline *d) {
    char raw[FRAME_MAX + 1];
    return secure_read(CONFIG_PATH, owner, raw, sizeof(raw), hash, d) || config_parse(raw, c) ? -1
                                                                                              : 0;
}
int proof_parse(const char *data, Proof *p) {
    Json j;
    memset(p, 0, sizeof(*p));
    if (json_parse(&j, data) || decode(&j, 0, proof_fields, COUNT(proof_fields), p))
        return -1;
    if (p->version != 1 || !p->helperPid || p->helperPid > INT32_MAX || !p->helperUid ||
        p->helperUid > UINT32_MAX || !p->helperGid || p->helperGid > UINT32_MAX ||
        p->socketUid != p->helperUid || p->socketGid != p->helperGid || p->socketMode != 0600 ||
        p->noNewPrivs != 1 || p->seccomp != 2 || p->dumpable != 0 ||
        strcmp(p->dumpabilityEvidence, "native-prctl-and-proc-owner") ||
        decimal(p->helperStartTime) || !strcmp(p->helperStartTime, "0"))
        return -1;
    if (uuid(p->bootId) || hex64(p->instance) || hex64(p->configSha256) ||
        hex64(p->helperExecutableSha256) || hex64(p->clientExecutableSha256) ||
        hex64(p->attestorUnitSha256) || hex64(p->artifactTreeIdentity) ||
        canonical(p->helperExecutable) || canonical(p->clientExecutable) ||
        canonical(p->socketPath) || canonical(p->helperCgroup))
        return -1;
    return 0;
}
int proof_load(Proof *p, char hash[65], uid_t owner, const Deadline *d) {
    char raw[FRAME_MAX + 1];
    return secure_read(PROOF_PATH, owner, raw, sizeof(raw), hash, d) || proof_parse(raw, p) ? -1
                                                                                            : 0;
}
int proof_encode(const Proof *p, char *out, size_t capacity) {
    return encode(p, proof_fields, COUNT(proof_fields), out, capacity);
}
int daemon_encode(const Daemon *p, char *out, size_t capacity) {
    return encode(p, daemon_fields, COUNT(daemon_fields), out, capacity);
}
int reply_parse(const char *data, Daemon *daemon, char instance[65], char config_hash[65],
                char boot[37]) {
    Json j;
    if (json_parse(&j, data) || j.token[0].size != 5)
        return -1;
    unsigned seen = 0;
    for (int i = 1; i < j.count;) {
        const jsmntok_t *key = &j.token[i], *v = &j.token[i + 1];
        const char *names[] = {"version", "instance", "configSha256", "bootId", "daemon"};
        int k = 0;
        for (; k < 5; k++)
            if (strlen(names[k]) == (size_t)(key->end - key->start) &&
                !memcmp(names[k], j.text + key->start, strlen(names[k])))
                break;
        if (k == 5 || (seen & (1U << k)))
            return -1;
        seen |= 1U << k;
        if (k == 0) {
            if (v->type != JSMN_PRIMITIVE || v->end - v->start != 1 || j.text[v->start] != '1')
                return -1;
        } else if (k == 4) {
            memset(daemon, 0, sizeof(*daemon));
            if (decode(&j, i + 1, daemon_fields, COUNT(daemon_fields), daemon))
                return -1;
        } else {
            size_t n = (size_t)(v->end - v->start), expected = k == 3 ? 36 : 64;
            if (v->type != JSMN_STRING || n != expected)
                return -1;
            char *target = k == 1 ? instance : k == 2 ? config_hash : boot;
            memcpy(target, j.text + v->start, n);
            target[n] = 0;
        }
        int end = v->end;
        i += 2;
        while (i < j.count && j.token[i].start < end)
            i++;
    }
    return seen != 31 || hex64(instance) || hex64(config_hash) || uuid(boot) ||
                   daemon->version != 1 || !daemon->pid || daemon->pid > INT32_MAX ||
                   !daemon->uid || daemon->uid > UINT32_MAX || decimal(daemon->startTime) ||
                   !strcmp(daemon->startTime, "0") || canonical(daemon->executable) ||
                   hex64(daemon->executableSha256)
               ? -1
               : 0;
}
