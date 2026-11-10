// Real-kernel native-gcc gate (spec §6): compiles and runs through the actual
// NativeExecutionService + NsJailBackend, with the node's own compile and run
// jails. Called by kernel-qualification.mjs when the manifest carries GCC.
import assert from 'node:assert/strict';
import { arch } from 'node:os';
import { readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export async function qualifyGcc({ runtime, config }) {
    const { NativeExecutionService, NativeExecutionClient, NsJailBackend } = runtime;
    const service = new NativeExecutionService({ ...config, backend: new NsJailBackend(config) });
    await service.listen();
    const client = new NativeExecutionClient({ socketPath: config.socketPath, descriptor: config.manifest.gcc, lane: 'official' });
    let passed = 0;
    const timings = {};
    try {
        assert.equal((await client.health()).ready, true, 'GCC runtime not ready: ' + service.options?.backend?.gccFailure);
        const build = (language, code) => client.compile({ language, code, leaseMs: 120_000 });
        const run = (compiled, stdin = '', extra = {}) => client.run({ code: '', artifact: compiled.artifact, lease: compiled.lease, stdin, memoryLimitMb: 128, timeLimitMs: 1000, outputLimitBytes: 4096, ...extra });
        const program = async (language, code, stdin = '', extra = {}) => {
            const compiled = await build(language, code);
            assert.equal(compiled.status, 'COMPILED', compiled.diagnostics);
            try { return await run(compiled, stdin, extra); }
            finally { await client.release(compiled.lease); }
        };
        const check = async (label, language, code, expected, stdin = '', extra = {}) => {
            const result = await program(language, code, stdin, extra);
            for (const [key, value] of Object.entries(expected))
                assert.deepEqual(result[key], value, `${label}: ${key} was ${JSON.stringify(result[key])}; stderr ${result.stderr}`);
            passed++;
            return result;
        };
        const C = (body, head = '') => `#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <unistd.h>\n#include <signal.h>\n#include <sys/syscall.h>\n${head}\nint main(void) {\n${body}\n}\n`;

        // Correct programs: stdin, stdout, Unicode, 64-bit sizes, files in /tmp, EOF.
        let started = performance.now();
        const sum = await build('C', C('int a, b; if (scanf("%d %d", &a, &b) != 2) return 3; printf("%d\\n", a + b); printf("%zu %zu\\n", sizeof(long), sizeof(void *)); return 0;'));
        timings.cMs = performance.now() - started;
        assert.equal(sum.status, 'COMPILED'); assert.equal(sum.diagnostics, '');
        assert.deepEqual((await run(sum, '2 3\n')).stdout, '5\n8 8\n');
        assert.equal((await run(sum, '')).termination?.exit, 3, 'reading past the input is end-of-file');
        await client.release(sum.lease);
        passed++;
        await check('unicode and files', 'C', C('FILE *f = fopen("data.txt", "w"); fprintf(f, "%s", "학생"); fclose(f); char s[32] = {0}; f = fopen("data.txt", "r"); fgets(s, sizeof s, f); printf("안녕 %s\\n", s); return 0;'), { outcome: 'PASSED', stdout: '안녕 학생\n' });
        started = performance.now();
        const iostream = await build('CPP', '#include <iostream>\n#include <vector>\n#include <algorithm>\nint main() { int n; std::cin >> n; std::vector<int> v(n); for (auto &x : v) std::cin >> x; std::sort(v.begin(), v.end()); for (int x : v) std::cout << x << " "; std::cout << "\\n"; }\n');
        timings.cppIostreamMs = performance.now() - started;
        assert.equal((await run(iostream, '3\n3 1 2\n')).stdout, '1 2 3 \n');
        await client.release(iostream.lease);
        passed++;
        // The precompiled header is valid: no -Winvalid-pch warning, and fast.
        const bits = '#include <bits/stdc++.h>\nusing namespace std;\nint main() { map<string, int> m; string w; while (cin >> w) m[w]++; for (auto &[k, v] : m) cout << k << " " << v << "\\n"; }\n';
        started = performance.now();
        const pch = await build('CPP', bits);
        timings.cppBitsPchMs = performance.now() - started;
        assert.equal(pch.status, 'COMPILED'); assert.equal(pch.diagnostics, '', 'precompiled header rejected: ' + pch.diagnostics);
        assert.equal((await run(pch, 'b a b\n')).stdout, 'a 1\nb 2\n');
        // The same source compiles once.
        const again = await build('CPP', bits);
        assert.equal(again.cached, true); assert.equal(again.artifact, pch.artifact);
        await client.release(pch.lease); await client.release(again.lease);
        passed++;

        // Compile errors are the learner's, cached, and located for the editor.
        const bad = await build('C', 'int main(void) { return x; }\n');
        assert.equal(bad.status, 'COMPILE_ERROR'); assert.equal(bad.reason, 'ERRORS');
        assert.match(bad.diagnostics, /^main\.c:1:\d+: error: .x. undeclared/m);
        assert.equal((await build('C', 'int main(void) { return x; }\n')).cached, true);
        assert.match((await build('C', 'int helper(void) { return 0; }\n')).diagnostics, /undefined reference to .main./);
        passed++;
        for (const path of ['/etc/passwd', '/proc/self/environ', '/dev/stdin', '/var/lib/cove-native/artifacts']) {
            const included = await build('C', `#include "${path}"\nint main(void) { return 0; }\n`);
            assert.equal(included.status, 'COMPILE_ERROR', path); assert.equal(included.reason, 'ERRORS', path);
            passed++;
        }
        // Compiler limits come only from the host's own evidence.
        started = performance.now();
        // GCC bounds constant evaluation itself: that is the learner's error.
        const ops = await build('CPP', 'constexpr long long burn() { long long s = 0; for (long i = 0; i < 200000; i++) for (long j = 0; j < 200000; j++) s += (i ^ j) % 7; return s; }\nint main() { constexpr long long x = burn(); return (int)x; }\n');
        assert.equal(ops.status, 'COMPILE_ERROR'); assert.equal(ops.reason, 'ERRORS');
        assert.match(ops.diagnostics, /constexpr.*operation count exceeds limit/);
        passed++;
        // Doubling a macro 27 times is about 134 million tokens: the host's
        // memory or CPU limit stops the compiler, and only that sets LIMITS.
        started = performance.now();
        const macros = ['#define A0 1+', ...Array.from({ length: 27 }, (_, i) => `#define A${i + 1} A${i} A${i}`)].join('\n');
        const bomb = await build('CPP', `${macros}\nint main() { return A27 1; }\n`);
        timings.compileLimitMs = performance.now() - started;
        assert.equal(bomb.status, 'COMPILE_ERROR'); assert.equal(bomb.reason, 'LIMITS'); assert.equal(bomb.cached, false);
        assert.match(bomb.diagnostics, /The compiler stopped: compiling this program needs more than/);
        passed++;
        const huge = await build('C', 'static char a[1 << 30] = {1};\nint main(void) { return a[5]; }\n');
        assert.equal(huge.status, 'COMPILE_ERROR'); assert.equal(huge.reason, 'ERRORS');
        passed++;

        // Endings come from the gate's record, never NsJail's exit code.
        await check('exit 139', 'C', C('return 139;'), { outcome: 'RUNTIME_ERROR', termination: { exit: 139 } });
        await check('null write', 'C', C('volatile int *p = 0; *p = 1; return 0;'), { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGSEGV' } });
        await check('assert', 'C', C('assert(1 == 2); return 0;', '#include <assert.h>'), { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGABRT' } });
        await check('uncaught exception', 'CPP', '#include <vector>\nint main() { std::vector<int> v; return v.at(3); }\n', { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGABRT' } });
        await check('raise SIGFPE', 'C', C('raise(SIGFPE); return 0;'), { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGFPE' } });
        if (arch() === 'x64')
            await check('integer division by zero', 'C', C('volatile int z = 0; printf("%d", 7 / z); return 0;'), { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGFPE' } });
        await check('getchar exit code', 'C', C('return getchar();'), { outcome: 'RUNTIME_ERROR', termination: { exit: 65 } }, 'A');
        await check('system()', 'C', C('return system("ls");'), { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGSYS' } });
        await check('fork()', 'C', C('fork(); return 0;'), { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGSYS' } });
        await check('std::thread', 'CPP', '#include <thread>\nint main() { std::thread t([] {}); t.join(); }\n', { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGSYS' } });
        await check('exec the gate', 'C', C('char *a[] = {"/opt/cove/exec-gate", "run", "/box/main", NULL}; execv(a[0], a); return 9;'), { outcome: 'RUNTIME_ERROR', termination: { exit: 125 } });
        await check('exec itself again', 'C', C('if (!getenv("AGAIN")) { setenv("AGAIN", "1", 1); char *a[] = {"./main", NULL}; execv("/box/main", a); return 9; } puts("restarted"); return 0;'), { outcome: 'PASSED', stdout: 'restarted\n' });
        const loader = arch() === 'x64' ? '/lib64/ld-linux-x86-64.so.2' : '/lib/ld-linux-aarch64.so.1';
        const viaLoader = await program('C', C(`FILE *in = fopen("/box/main", "rb"), *out = fopen("copy", "wb"); int c; while ((c = fgetc(in)) != EOF) fputc(c, out); fclose(out); if (!getenv("AGAIN")) { setenv("AGAIN", "1", 1); char *a[] = {"${loader}", "/tmp/copy", NULL}; execv(a[0], a); return 8; } puts("loaded from tmp"); return 0;`));
        assert.notEqual(viaLoader.stdout, 'loaded from tmp\n', 'a /tmp file ran through the loader');
        assert.equal(viaLoader.outcome, 'RUNTIME_ERROR');
        passed++;
        await check('host files', 'C', C('printf("%d %d %d\\n", fopen("/etc/passwd", "r") == NULL, fopen("/proc/self/status", "r") == NULL, access("/var/lib/cove-native", F_OK) != 0); return 0;'), { outcome: 'PASSED', stdout: '1 1 1\n' });
        await check('control FD', 'C', C('printf("%d\\n", (int)write(3, "X 0\\n", 4)); return 0;'), { outcome: 'PASSED', stdout: '-1\n' });
        await check('signals to the gate', 'C', C('kill(1, SIGKILL); kill(-1, SIGKILL); puts("alive"); return 0;'), { outcome: 'PASSED', stdout: 'alive\n' });
        // Nothing may name another process (spec §5.2): each call ends the program.
        for (const [label, body] of [
            ['prlimit64 on PID 1', 'struct { unsigned long cur, max; } low = {0, 0}; syscall(SYS_prlimit64, 1, 0, &low, NULL); return 0;'],
            ['prlimit64 nofile on PID 1', 'struct { unsigned long cur, max; } low = {3, 3}; syscall(SYS_prlimit64, 1, 7, &low, NULL); return 0;'],
            ['prlimit64 fsize on PID 1', 'struct { unsigned long cur, max; } low = {0, 0}; syscall(SYS_prlimit64, 1, 1, &low, NULL); return 0;'],
            ['sched_getaffinity on PID 1', 'unsigned long mask[16]; syscall(SYS_sched_getaffinity, 1, sizeof mask, mask); return 0;'],
            ['setpriority on PID 1', 'syscall(SYS_setpriority, 0, 1, 19); return 0;'],
            ['pidfd_open on PID 1', 'syscall(SYS_pidfd_open, 1, 0); return 0;'],
            ['pidfd_getfd', 'syscall(SYS_pidfd_getfd, 0, 3, 0); return 0;'],
            ['process_vm_writev on PID 1', 'syscall(SYS_process_vm_writev, 1, NULL, 0, NULL, 0, 0); return 0;'],
            ['kcmp on PID 1', 'syscall(SYS_kcmp, 1, 2, 0, 0, 0); return 0;'],
            ['ptrace attach PID 1', 'syscall(SYS_ptrace, 16, 1, 0, 0); return 0;'],
        ])
            await check(label, 'C', C(body), { outcome: 'RUNTIME_ERROR', termination: { signal: 'SIGSYS' } });
        // Host limits outrank the record.
        await check('memory bomb', 'C', C('for (;;) { char *p = malloc(1 << 20); if (p) memset(p, 1, 1 << 20); } return 0;'), { outcome: 'MEMORY_LIMIT', termination: undefined }, '', { memoryLimitMb: 64, timeLimitMs: 3000 });
        await check('busy loop', 'C', C('volatile unsigned long i = 0; for (;;) i++; return 0;'), { outcome: 'TIME_LIMIT', termination: undefined }, '', { timeLimitMs: 200 });
        await check('sleep', 'C', C('sleep(10); return 0;'), { outcome: 'TIME_LIMIT' }, '', { timeLimitMs: 200 });
        const flood = await program('C', C('for (int i = 0; i < 100000; i++) fputs("한", stdout); return 0;'), '', { outputLimitBytes: 100 });
        assert.ok(flood.outputTruncated && Buffer.byteLength(flood.stdout) <= 100);
        passed++;
        // The stack may use the memory limit: deep recursion works, unbounded does not.
        const deep = 'int f(int n) { volatile char pad[256]; pad[0] = (char)n; return n == 0 ? 0 : 1 + f(n - 1) + pad[0] * 0; }';
        await check('deep recursion', 'C', C('printf("%d\\n", f(200000)); return 0;', deep), { outcome: 'PASSED', stdout: '200000\n' });
        const unbounded = await program('C', C('return f(1 << 30);', deep));
        assert.ok(unbounded.outcome === 'MEMORY_LIMIT' || unbounded.termination?.signal === 'SIGSEGV', JSON.stringify(unbounded));
        passed++;
        // A lapsed or unknown lease is refused without running anything.
        await assert.rejects(client.run({ code: '', artifact: 'sha256:' + '0'.repeat(64), lease: crypto.randomUUID(), stdin: '', memoryLimitMb: 64, timeLimitMs: 100 }), /INVALID_REQUEST/);
        passed++;
        // Concurrent compiles and runs share the node's slots correctly.
        const results = await Promise.all([0, 1, 2, 3].map(i => program('C', C(`printf("%d\\n", ${i} * 10); return 0;`))));
        results.forEach((r, i) => assert.equal(r.stdout, `${i * 10}\n`));
        passed++;
        assert.equal((await client.health()).ready, true);
        console.log(JSON.stringify({ gate: 'actual-linux-gcc', status: 'PASS', passed, timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])), descriptor: config.manifest.gcc }));
    }
    finally {
        await client.dispose();
        await service.close();
        for (let i = 0; (await readdir(config.cgroupRoot)).some(n => n.startsWith('case-')); i++) {
            if (i > 100) throw Error('GCC cases left cgroups behind');
            await delay(50);
        }
    }
}
