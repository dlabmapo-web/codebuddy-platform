#include "common.h"
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdio.h>
#include <string.h>
#include <sys/syscall.h>
#include <sys/un.h>
#include <time.h>
#include <unistd.h>
int fail(const char *classification) {
    fprintf(stderr, "%s\n", classification);
    return 1;
}
static int64_t now_ms(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts))
        return -1;
    return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}
int deadline_new(Deadline *d) {
    int64_t n = now_ms();
    if (n < 0)
        return -1;
    d->end = n + 1000;
    return 0;
}
int deadline_left(const Deadline *d) {
    int64_t n = now_ms();
    return n < 0 || n >= d->end ? 0 : (int)(d->end - n);
}
int wait_fd(int fd, short events, const Deadline *d) {
    for (;;) {
        int remaining = deadline_left(d);
        if (!remaining)
            return -1;
        struct pollfd p = {.fd = fd, .events = events};
        int n = poll(&p, 1, remaining);
        if (n < 0 && errno == EINTR)
            continue;
        return n == 1 && (p.revents & events) ? 0 : -1;
    }
}
int io_exact(int fd, void *data, size_t length, int writing, const Deadline *d) {
    size_t offset = 0;
    while (offset < length) {
        if (wait_fd(fd, writing ? POLLOUT : POLLIN, d))
            return -1;
        ssize_t n = writing ? send(fd, (char *)data + offset, length - offset, MSG_NOSIGNAL)
                            : recv(fd, (char *)data + offset, length - offset, 0);
        if (n < 0 && (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK))
            continue;
        if (n <= 0)
            return -1;
        offset += (size_t)n;
    }
    return 0;
}
int read_bounded(int fd, char *data, size_t capacity, const Deadline *d) {
    size_t total = 0;
    if (!capacity)
        return -1;
    for (;;) {
        if (!deadline_left(d))
            return -1;
        if (total == capacity - 1) {
            char extra;
            ssize_t n = read(fd, &extra, 1);
            if (n < 0 && errno == EINTR)
                continue;
            if (n != 0)
                return -1;
            break;
        }
        ssize_t n = read(fd, data + total, capacity - 1 - total);
        if (n < 0 && errno == EINTR)
            continue;
        if (n < 0)
            return -1;
        if (!n)
            break;
        total += (size_t)n;
    }
    if (memchr(data, 0, total))
        return -1;
    data[total] = 0;
    return (int)total;
}
int same_stat(const struct stat *a, const struct stat *b) {
    return a->st_dev == b->st_dev && a->st_ino == b->st_ino && a->st_uid == b->st_uid &&
           a->st_gid == b->st_gid && a->st_mode == b->st_mode && a->st_nlink == b->st_nlink &&
           a->st_size == b->st_size && a->st_ctim.tv_sec == b->st_ctim.tv_sec &&
           a->st_ctim.tv_nsec == b->st_ctim.tv_nsec;
}
int socket_stat(const char *path, uid_t uid, struct stat *result) {
    return lstat(path, result) || !S_ISSOCK(result->st_mode) || result->st_uid != uid ||
                   result->st_nlink != 1
               ? -1
               : 0;
}
int pid_alive(int fd) {
    struct pollfd p = {.fd = fd, .events = POLLIN};
    return poll(&p, 1, 0) == 0 ? 0 : -1;
}
int connect_peer(const char *path, uid_t uid, int *pidfd, struct ucred *peer, struct stat *before,
                 const Deadline *d) {
    int fd = -1;
    *pidfd = -1;
    struct sockaddr_un address = {.sun_family = AF_UNIX};
    struct stat after;
    if (strlen(path) >= sizeof(address.sun_path) || socket_stat(path, uid, before))
        return -1;
    strcpy(address.sun_path, path);
    fd = socket(AF_UNIX, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    if (fd < 0)
        return -1;
    if (connect(fd, (struct sockaddr *)&address, sizeof(address))) {
        if (errno != EINPROGRESS)
            goto bad;
        if (wait_fd(fd, POLLOUT, d))
            goto bad;
        int error = 0;
        socklen_t size = sizeof(error);
        if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &size) || error)
            goto bad;
    }
    socklen_t size = sizeof(*peer);
    if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, peer, &size) || size != sizeof(*peer) ||
        peer->uid != uid || peer->pid <= 0)
        goto bad;
    *pidfd = (int)syscall(SYS_pidfd_open, peer->pid, 0);
    if (*pidfd < 0 || pid_alive(*pidfd) || socket_stat(path, uid, &after) ||
        !same_stat(before, &after))
        goto bad;
    return fd;
bad:
    if (*pidfd >= 0)
        close(*pidfd);
    *pidfd = -1;
    close(fd);
    return -1;
}
