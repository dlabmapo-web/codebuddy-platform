/* Test-only executable. It is never packaged with host/bin runtime tools. */
#include "common.h"
#include <errno.h>
#include <fcntl.h>
#include <linux/filter.h>
#include <linux/sched.h>
#include <linux/seccomp.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/ptrace.h>
#include <sys/syscall.h>
#include <sys/un.h>
#include <unistd.h>
static int policy_test(const char *operation, int filtered) {
    int pair[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, pair))
        return 2;
    void *mapping = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (mapping == MAP_FAILED)
        return 2;
    if (filtered && policy_install()) {
        fprintf(stderr, "fixture policy install errno=%d\n", errno);
        return 2;
    }
    char *args[] = {"/bin/true", NULL};
    char *env[] = {NULL};
    errno = 0;
    long result = -2;
    if (!strcmp(operation, "exec"))
        result = syscall(SYS_execve, args[0], args, env);
    else if (!strcmp(operation, "execat"))
        result = syscall(SYS_execveat, AT_FDCWD, args[0], args, env, 0);
    else if (!strcmp(operation, "fork"))
        result = syscall(SYS_fork);
    else if (!strcmp(operation, "clone"))
        result = syscall(SYS_clone, 0, NULL, NULL, NULL, 0);
    else if (!strcmp(operation, "clone3")) {
        struct clone_args ca = {0};
        result = syscall(SYS_clone3, &ca, sizeof(ca));
    } else if (!strcmp(operation, "vfork"))
        result = syscall(SYS_vfork);
    else if (!strcmp(operation, "setns"))
        result = syscall(SYS_setns, -1, CLONE_NEWUSER);
    else if (!strcmp(operation, "unshare"))
        result = syscall(SYS_unshare, CLONE_NEWUSER);
    else if (!strcmp(operation, "ptrace"))
        result = syscall(SYS_ptrace, PTRACE_TRACEME, 0, NULL, NULL);
    else if (!strcmp(operation, "process-write"))
        result = syscall(SYS_process_vm_writev, getpid(), NULL, 0, NULL, 0, 0);
    else if (!strcmp(operation, "mmap-exec"))
        result = syscall(SYS_mmap, NULL, 4096, PROT_READ | PROT_EXEC, MAP_PRIVATE | MAP_ANONYMOUS,
                         -1, 0);
    else if (!strcmp(operation, "mprotect-exec"))
        result = syscall(SYS_mprotect, mapping, 4096, PROT_EXEC);
    else if (!strcmp(operation, "dumpable"))
        result = prctl(PR_SET_DUMPABLE, 1, 0, 0, 0);
    else if (!strcmp(operation, "sendmsg")) {
        char byte = 'x', control[CMSG_SPACE(sizeof(int))] = {0};
        struct iovec io = {.iov_base = &byte, .iov_len = 1};
        struct msghdr message = {.msg_iov = &io,
                                 .msg_iovlen = 1,
                                 .msg_control = control,
                                 .msg_controllen = sizeof(control)};
        struct cmsghdr *cmsg = CMSG_FIRSTHDR(&message);
        cmsg->cmsg_level = SOL_SOCKET;
        cmsg->cmsg_type = SCM_RIGHTS;
        cmsg->cmsg_len = CMSG_LEN(sizeof(int));
        memcpy(CMSG_DATA(cmsg), &pair[0], sizeof(int));
        result = sendmsg(pair[0], &message, 0);
    } else if (!strcmp(operation, "sendmmsg"))
        result = syscall(SYS_sendmmsg, pair[0], NULL, 0, 0);
    int error = errno;
    if (!filtered)
        return result == 1 ? 0 : 3;
    if (result != -1 || error != EPERM)
        return 3;
    printf("%d\n", error);
    return 0;
}
static int daemon_fixture(int argc, char **argv) {
    if (argc != 4)
        return 2;
    if (prctl(PR_SET_NAME, "fixture ) comm", 0, 0, 0))
        return 2;
    const char *path = argv[2];
    struct sockaddr_un address = {.sun_family = AF_UNIX};
    if (strlen(path) >= sizeof(address.sun_path))
        return 2;
    strcpy(address.sun_path, path);
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0 || bind(fd, (struct sockaddr *)&address, sizeof(address)) || listen(fd, 16))
        return 2;
    for (;;) {
        int client = accept(fd, NULL, NULL);
        if (client < 0)
            return 2;
        /* No Docker API. A held connection is enough for kernel identity. */ close(client);
    }
}
int main(int argc, char **argv) {
    if (argc < 2)
        return 2;
    if (!strcmp(argv[1], "policy-environment")) {
        int nnp = prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0), nnp_error = errno;
        int dump = prctl(PR_SET_DUMPABLE, 0, 0, 0, 0), dump_error = errno;
        int observed_dump = prctl(PR_GET_DUMPABLE, 0, 0, 0, 0);
        int observed_nnp = prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0);
        struct sock_filter allow[] = {BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW)};
        struct sock_fprog program = {.len = 1, .filter = allow};
        int filter = (int)syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER, 0, &program),
            filter_error = errno;
        printf("nnp=%d errno=%d dump=%d errno=%d observedDump=%d observedNnp=%d minimalSeccomp=%d "
               "errno=%d\n",
               nnp, nnp_error, dump, dump_error, observed_dump, observed_nnp, filter, filter_error);
        return filter ? 1 : 0;
    }
    if (!strcmp(argv[1], "exec-unfiltered")) {
        execl("/bin/true", "true", (char *)NULL);
        return 2;
    }
    if (argc == 3 && !strcmp(argv[1], "policy"))
        return policy_test(argv[2], 1);
    if (!strcmp(argv[1], "fd-export-unfiltered"))
        return policy_test("sendmsg", 0);
    if (argc == 3 && !strcmp(argv[1], "bind-attestor")) {
        Config config = {0};
        if (strlen(argv[2]) >= sizeof(config.attestorSocket))
            return 2;
        strcpy(config.attestorSocket, argv[2]);
        int fd = bind_attestor_socket(&config);
        if (fd < 0)
            return 2;
        struct stat metadata;
        int flags = fcntl(fd, F_GETFL), descriptor_flags = fcntl(fd, F_GETFD);
        if (lstat(config.attestorSocket, &metadata) || flags < 0 || descriptor_flags < 0) {
            close(fd);
            return 2;
        }
        printf("%u %u %u\n", (unsigned)(metadata.st_mode & 07777), (unsigned)!!(flags & O_NONBLOCK),
               (unsigned)!!(descriptor_flags & FD_CLOEXEC));
        close(fd);
        return unlink(config.attestorSocket) ? 2 : 0;
    }
    if (!strcmp(argv[1], "daemon"))
        return daemon_fixture(argc, argv);
    Deadline d;
    if (deadline_new(&d))
        return 2;
    if (!strcmp(argv[1], "sha256")) {
        char hash[65];
        if (hash_fd(STDIN_FILENO, hash, &d))
            return 1;
        puts(hash);
        return 0;
    }
    char data[FRAME_MAX + 1];
    if (read_bounded(STDIN_FILENO, data, sizeof(data), &d) < 0)
        return 1;
    if (!strcmp(argv[1], "json")) {
        Json j;
        return json_parse(&j, data) ? 1 : 0;
    }
    if (!strcmp(argv[1], "config")) {
        Config c;
        return config_parse(data, &c) ? 1 : 0;
    }
    if (!strcmp(argv[1], "proof")) {
        Proof p;
        return proof_parse(data, &p) ? 1 : 0;
    }
    return 2;
}
