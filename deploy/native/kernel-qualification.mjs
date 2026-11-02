// Real-kernel gate; all execution goes through NativeExecutionService + NsJailBackend.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const [artifact, path, mode] = process.argv.slice(2), config = JSON.parse(await readFile(path, 'utf8'));
const runtime = await import(pathToFileURL(artifact + '/worker/node_modules/@cove/grading-runtime/dist/index.js'));
const { NativeExecutionService, NativeExecutionClient, NsJailBackend } = runtime;
const client = new NativeExecutionClient({ socketPath: config.socketPath, descriptor: config.manifest.descriptor, lane: 'official' });
const run = (code, extra = {}) => client.run({ code, stdin: '', memoryLimitMb: 128, timeLimitMs: 1000, outputLimitBytes: 1024, ...extra });
let service, child, passed = 0;
try {
    if (mode === '--crash') {
        child = spawn(process.execPath, [artifact + '/worker/node_modules/@cove/grading-runtime/dist/main.js', path], { stdio: ['ignore', 'inherit', 'inherit'] });
        for (let i = 0;; i++) {
            try {
                assert.equal((await client.health()).ready, true);
                break;
            }
            catch (error) {
                if (i > 100)
                    throw error;
                await delay(100);
            }
        }
        const running = run('open("/tmp/native-crash-started","w").write("started"); import time; time.sleep(60)', { timeLimitMs: 2000 });
        void running.catch(() => { });
        const groups = async () => (await readdir(config.cgroupRoot)).filter(n => n.startsWith('case-'));
        for (let i = 0; !(await groups()).length; i++) {
            if (i > 100)
                throw Error('No actual case');
            await delay(20);
        }
        // A marker written by this known fixture source proves GO and source execution,
        // rather than merely observing a group during slow namespace/bootstrap startup.
        let runningPid;
        const markerDeadline = performance.now() + 15000;
        while (!runningPid) {
            for (const group of await groups())
                for (const entry of await readdir(config.cgroupRoot + '/' + group, { withFileTypes: true }))
                    if (entry.isDirectory()) {
                        const leaf = config.cgroupRoot + '/' + group + '/' + entry.name;
                        const pids = (await readFile(leaf + '/cgroup.procs', 'utf8')).trim().split(/\s+/).filter(Boolean);
                        for (const pid of pids) {
                            try {
                                if (await readFile('/proc/' + pid + '/root/tmp/native-crash-started', 'utf8') === 'started')
                                    runningPid = pid;
                            }
                            catch (error) {
                                if (error.code !== 'ENOENT')
                                    throw error;
                            }
                        }
                    }
            if (performance.now() > markerDeadline)
                throw Error('Known fixture source never proved running before crash');
            if (!runningPid)
                await delay(10);
        }
        console.log(JSON.stringify({ gate: 'crash-execution-marker', status: 'PASS', sourceReachedExecution: true }));
        child.kill('SIGKILL');
        await assert.rejects(running);
        const end = performance.now() + 19000;
        while (true) {
            if ((await Promise.all((await groups()).map(g => readFile(config.cgroupRoot + '/' + g + '/cgroup.events', 'utf8')))).every(s => /^populated 0$/m.test(s)))
                break;
            if (performance.now() > end)
                throw Error('Crash leaked processes');
            await delay(100);
        }
        assert.ok((await groups()).length > 0);
        await assert.rejects(new NsJailBackend(config).prepare(), /Stale case cgroup|unaccounted allocations/);
        console.log(JSON.stringify({ gate: 'actual-linux-crash', status: 'PASS', staleEvidence: await groups() }));
    }
    else {
        service = new NativeExecutionService({ ...config, backend: new NsJailBackend(config) });
        await service.listen();
        const check = async (code, expected, extra = {}) => { const result = await run(code, extra); for (const [key, value] of Object.entries(expected))
            assert.equal(result[key], value, code); assert.ok(result.timings && result.timings.cleanupMs >= 0); passed++; };
        await check('print(input("이름: "))', { stdout: '이름: 학생\n', outcome: 'PASSED' }, { stdin: '학생\n' });
        await check('print(input("이름: "))', { stdout: '학생\n' }, { stdin: '학생\n', inputPromptPolicy: 'IGNORE' });
        for (const code of ['import sys; sys.exit(None)', 'import sys; sys.exit(0)'])
            await check(code, { outcome: 'PASSED' });
        for (const code of ['import sys; sys.exit(7)', 'import sys; sys.exit(256)', 'import sys; sys.exit(-256)', 'import sys; sys.exit(True)', 'raise Exception("student")', 'import asyncio; await asyncio.sleep(0)', 'open("/persist","w").write("x")', 'import socket; socket.socket()', 'import socket; socket.socket(socket.AF_UNIX)', 'import os; os.fork()', 'import threading; threading.Thread(target=lambda:None).start()', 'import os; os.write(3,b"forged")'])
            await check(code, { outcome: 'RUNTIME_ERROR' });
        await check('import os; print(sorted(os.environ)); print(os.getuid())', { stdout: "['HOME', 'LANG', 'LC_ALL', 'PATH']\n65534\n" });
        await check('import os; print(os.path.exists("/proc"),os.path.exists("/run"),os.path.exists("/etc/shadow"))', { stdout: 'False False False\n' });
        await check('while True: pass', { outcome: 'TIME_LIMIT' }, { timeLimitMs: 50 });
        await check('import time; time.sleep(10)', { outcome: 'TIME_LIMIT' }, { timeLimitMs: 50 });
        await check('x=[]\nwhile True: x.append(bytearray(10*1024*1024))', { outcome: 'MEMORY_LIMIT' }, { memoryLimitMb: 32, timeLimitMs: 2000 });
        const flood = await run('print("한"*10000)', { outputLimitBytes: 100 });
        assert.ok(flood.outputTruncated && Buffer.byteLength(flood.stdout) <= 100);
        passed++;
        await run('open("/tmp/private","w").write("first")');
        await check('import os; print(os.path.exists("/tmp/private"))', { stdout: 'False\n' });
        // All classes through 512 MiB exercise authored reservations; short valid programs only.
        for (const memoryLimitMb of [32, 64, 128, 256, 512])
            await check('print(1)', { stdout: '1\n', outcome: 'PASSED' }, { memoryLimitMb });
        for (const cohort of [1, 2, 4]) {
            const results = await Promise.all(Array.from({ length: cohort }, (_, i) => run(`print(${i})`)));
            results.forEach((r, i) => assert.equal(r.stdout, i + '\n'));
            passed++;
        }
        const controller = new AbortController(), running = run('while True: pass', { signal: controller.signal, timeLimitMs: 5000 });
        setTimeout(() => controller.abort(), 100);
        await assert.rejects(running);
        await delay(300);
        assert.equal((await client.health()).active, 0);
        passed++;
        assert.equal((await readdir(config.cgroupRoot)).filter(n => n.startsWith('case-')).length, 0);
        console.log(JSON.stringify({ gate: 'actual-linux-containment', status: 'PASS', passed, descriptor: config.manifest.descriptor }));
    }
}
catch (error) {
    console.error(JSON.stringify({ gate: 'actual-linux-native', status: 'UNSUPPORTED_OR_FAILED', passed, error: String(error), startupLog: error?.cause?.startupLog, startupStderr: error?.cause?.startupStderr }));
    process.exitCode = 78;
}
finally {
    child?.kill('SIGKILL');
    await client.dispose();
    await service?.close();
}
