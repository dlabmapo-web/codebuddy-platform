/*
 * Trusted first process of every native-gcc jail, built static into both
 * learner roots. It speaks the CPython bootstrap's gate protocol on FD 3, so
 * the launcher verifies the jail, applies limits and reads them back before
 * GO exactly as it does for Python:
 *
 *   gate -> host  "R"   ready, before any request exists
 *   host -> gate  stdin: "cove-gate-1 <stdin bytes> <time limit ms>[ hold]\n" + bytes
 *   gate -> host  "A"   CPU-time rlimit lowered to this case
 *   host -> gate  "G"   go
 *
 *   exec-gate exec PATH ARGS...  closes FD 3 and execs PATH (the compiler).
 *   exec-gate run PROGRAM        forks the program once, installs the program
 *                                filter in the child, and reports the child's
 *                                wait status on FD 3: "X <code>\n" for an exit,
 *                                "S <signal>\n" for a signal. Exits 0.
 *
 * The program is PID 2, never the namespace's init: as init its own SIGABRT
 * would be dropped. The gate stays init, so signals from the program cannot
 * reach it, and the jail filter keeps the program from naming it otherwise.
 * Every argument comes from the launcher's jail configuration; only the
 * request on stdin is data. Any protocol fault exits 125 without a record.
 *
 * `hold` (run only) is an interactive Run: the program reads its input from a
 * pipe whose write end the gate keeps open, so a read past the input blocks
 * instead of meeting end of file. The launcher sees a live program that has
 * stopped using CPU, which is a program waiting for input, and ends the case.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <signal.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <unistd.h>

#define CONTROL 3
/* The shared stdin limit (gradingDataLimits.testTextChars) in UTF-8 bytes. */
#define MAX_STDIN_BYTES (4ULL * 8 * 1024 * 1024)
#define MAX_TIME_LIMIT_MS 120000ULL
/* An interactive Run's typed input, held in one pipe buffer. */
#define MAX_HELD_STDIN_BYTES (1024ULL * 1024)

#if defined(__x86_64__)
#define GATE_AUDIT_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define GATE_AUDIT_ARCH AUDIT_ARCH_AARCH64
#else
#error "Unsupported architecture"
#endif

extern char **environ;

static void fail(void) { _exit(125); }

static void put(int fd, const char *bytes, size_t length) {
  while (length > 0) {
    ssize_t written = write(fd, bytes, length);
    if (written <= 0) fail();
    bytes += written;
    length -= (size_t)written;
  }
}

/* Strict unsigned decimal: digits only, no sign, no leading zero, bounded. */
static const char *decimal(const char *cursor, unsigned long long max,
                           unsigned long long *value) {
  unsigned long long result = 0;
  const char *start = cursor;
  while (*cursor >= '0' && *cursor <= '9') {
    if (result > (max - (unsigned long long)(*cursor - '0')) / 10) fail();
    result = result * 10 + (unsigned long long)(*cursor - '0');
    cursor++;
  }
  if (cursor == start || (cursor - start > 1 && *start == '0')) fail();
  *value = result;
  return cursor;
}

static void read_header(unsigned long long *bytes, unsigned long long *limit, int *hold) {
  char header[64];
  size_t length = 0;
  for (;;) {
    char c;
    if (read(0, &c, 1) != 1) fail();
    if (c == '\n') break;
    if (length + 1 >= sizeof header) fail();
    header[length++] = c;
  }
  header[length] = '\0';
  const char prefix[] = "cove-gate-1 ";
  if (strncmp(header, prefix, sizeof prefix - 1) != 0) fail();
  const char *cursor = decimal(header + sizeof prefix - 1, MAX_STDIN_BYTES, bytes);
  if (*cursor++ != ' ') fail();
  cursor = decimal(cursor, MAX_TIME_LIMIT_MS, limit);
  *hold = strcmp(cursor, " hold") == 0;
  if ((*cursor != '\0' && !*hold) || *limit == 0) fail();
  if (*hold && *bytes > MAX_HELD_STDIN_BYTES) fail();
}

/* Copies exactly `bytes` of stdin into a sealed-size memory file, then EOF. */
static int stdin_file(unsigned long long bytes) {
  int file = memfd_create("stdin", MFD_CLOEXEC);
  if (file < 0) fail();
  char chunk[65536];
  while (bytes > 0) {
    size_t want = bytes < sizeof chunk ? (size_t)bytes : sizeof chunk;
    ssize_t got = read(0, chunk, want);
    if (got <= 0) fail();
    put(file, chunk, (size_t)got);
    bytes -= (unsigned long long)got;
  }
  char extra;
  if (read(0, &extra, 1) != 0) fail();
  if (lseek(file, 0, SEEK_SET) != 0) fail();
  return file;
}

/*
 * Copies exactly `bytes` of stdin into a pipe the gate keeps writing open:
 * the program reads them, then blocks rather than meeting end of file.
 * Returns the read end; the write end stays in `*held`.
 */
static int stdin_held(unsigned long long bytes, int *held) {
  int ends[2];
  if (pipe2(ends, O_CLOEXEC) != 0) fail();
  if (fcntl(ends[1], F_SETPIPE_SZ, (int)MAX_HELD_STDIN_BYTES) < (int)bytes) fail();
  char chunk[65536];
  while (bytes > 0) {
    size_t want = bytes < sizeof chunk ? (size_t)bytes : sizeof chunk;
    ssize_t got = read(0, chunk, want);
    if (got <= 0) fail();
    put(ends[1], chunk, (size_t)got);
    bytes -= (unsigned long long)got;
  }
  char extra;
  if (read(0, &extra, 1) != 0) fail();
  *held = ends[1];
  return ends[0];
}

#define DENY(nr)                                       \
  BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, (nr), 0, 1),     \
  BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS)

/* Stacks on the jail filter: no processes, threads or filter changes. */
static void program_filter(void) {
  struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, GATE_AUDIT_ARCH, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
#if defined(__x86_64__)
    /* x32 numbers carry this bit; none is ever the program's to use. */
    BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x40000000, 0, 1),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    DENY(__NR_fork),
    DENY(__NR_vfork),
#endif
    DENY(__NR_clone),
    DENY(__NR_clone3),
    DENY(__NR_memfd_create),
    DENY(__NR_seccomp),
    DENY(__NR_prctl),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_fprog program = {
    .len = (unsigned short)(sizeof filter / sizeof filter[0]),
    .filter = filter,
  };
  if (syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER, 0, &program) != 0) _exit(126);
}

static void exec_compiler(char **argv, int input) {
  if (close(CONTROL) != 0) fail();
  if (dup2(input, 0) != 0) fail();
  if (close(input) != 0) fail();
  execve(argv[0], argv, environ);
  _exit(126);
}

static void run_program(const char *program, int input) {
  if (prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0) fail();
  /* Fork-style flags only: the jail filter admits no other clone. */
  long child = syscall(SYS_clone, SIGCHLD, 0, 0, 0, 0);
  if (child < 0) fail();
  if (child == 0) {
    if (dup2(input, 0) != 0) _exit(126);
    if (syscall(SYS_close_range, 3, ~0U, 0) != 0) _exit(126);
    /* NsJail already set it; the filter must never depend on that. */
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) _exit(126);
    program_filter();
    char *const arguments[] = {"./main", NULL};
    execve(program, arguments, environ);
    _exit(126);
  }
  /* The gate keeps only FD 3: the program alone owns stdin/stdout/stderr. */
  close(input);
  close(0);
  close(1);
  close(2);
  int status;
  for (;;) {
    pid_t reaped = waitpid((pid_t)child, &status, 0);
    if (reaped == (pid_t)child) break;
    if (reaped < 0 && errno != EINTR) fail();
  }
  char record[32];
  int length;
  if (WIFEXITED(status))
    length = snprintf(record, sizeof record, "X %d\n", WEXITSTATUS(status));
  else if (WIFSIGNALED(status))
    length = snprintf(record, sizeof record, "S %d\n", WTERMSIG(status));
  else
    fail();
  if (length <= 0 || (size_t)length >= sizeof record) fail();
  put(CONTROL, record, (size_t)length);
  _exit(0);
}

int main(int argc, char **argv) {
  int run = argc == 3 && strcmp(argv[1], "run") == 0;
  int exec = argc >= 3 && strcmp(argv[1], "exec") == 0;
  if (!run && !exec) fail();
  put(CONTROL, "R", 1);
  unsigned long long bytes, limit;
  int hold, held = -1;
  read_header(&bytes, &limit, &hold);
  if (exec && (bytes != 0 || hold)) fail();
  /* The held write end is closed in the child by close_range, kept here. */
  int input = hold ? stdin_held(bytes, &held) : stdin_file(bytes);
  /* Whole seconds above the case, as the CPython bootstrap sets them. */
  rlim_t seconds = (rlim_t)((limit + 999) / 1000 + 1);
  struct rlimit cpu = {seconds, seconds};
  if (setrlimit(RLIMIT_CPU, &cpu) != 0) fail();
  put(CONTROL, "A", 1);
  char go;
  if (read(CONTROL, &go, 1) != 1 || go != 'G') fail();
  if (exec) exec_compiler(argv + 2, input);
  run_program(argv[2], input);
  (void)held;
  return 125;
}
