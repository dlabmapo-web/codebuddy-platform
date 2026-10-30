#include "common.h"
#include <errno.h>
#include <fcntl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>
int close_inherited(void) { return (int)syscall(SYS_close_range, 3U, ~0U, 0); }
#define ALLOW(n)                                                                                   \
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_##n, 0, 1), BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW)
#define ARG(n) (offsetof(struct seccomp_data, args) + (n) * sizeof(uint64_t))
#define DENY BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM)
int policy_install(void) {
    /* Every special rule returns; the main chain always has the syscall number
     * in A. x32 syscalls are rejected despite sharing AUDIT_ARCH_X86_64. */
    struct sock_filter filter[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
        BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x40000000, 0, 1), DENY,
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_openat, 0, 4),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(2)),
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K,
                 ~(O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK | O_DIRECTORY | O_LARGEFILE), 0, 1),
        DENY, BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_mmap, 0, 4),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(2)),
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, PROT_EXEC, 0, 1), DENY,
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_socket, 0, 7),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(0)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AF_UNIX, 1, 0), DENY,
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(1)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SOCK_STREAM | SOCK_NONBLOCK | SOCK_CLOEXEC, 1, 0), DENY,
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        /* send() uses sendto; permit connected streams only, no destination. */
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_sendto, 0, 13),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(4)), BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 0),
        DENY, BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(4) + 4),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 0), DENY,
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(5)), BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 0),
        DENY, BPF_STMT(BPF_LD | BPF_W | BPF_ABS, ARG(5) + 4),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0, 1, 0), DENY,
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW), ALLOW(read), ALLOW(write), ALLOW(close),
        ALLOW(fstat), ALLOW(newfstatat), ALLOW(lstat), ALLOW(stat), ALLOW(readlink),
        ALLOW(readlinkat), ALLOW(poll), ALLOW(ppoll), ALLOW(clock_gettime), ALLOW(connect),
        ALLOW(getsockopt), ALLOW(accept4), ALLOW(listen), ALLOW(recvfrom), ALLOW(shutdown),
        ALLOW(pidfd_open), ALLOW(brk), ALLOW(munmap), ALLOW(futex), ALLOW(getpid),
        ALLOW(rt_sigreturn), ALLOW(exit), ALLOW(exit_group), DENY};
    struct sock_fprog program = {.len = (unsigned short)(sizeof(filter) / sizeof(filter[0])),
                                 .filter = filter};
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) || prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) ||
        prctl(PR_GET_DUMPABLE, 0, 0, 0, 0) != 0 || prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) != 1)
        return -1;
    return (int)syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER, 0, &program);
}
