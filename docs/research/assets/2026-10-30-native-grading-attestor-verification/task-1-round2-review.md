# Task 1 fix round 2 scoped review

**Source spec: ❌ pending one test-contract fix. Quality: Needs fixes.** The production socket-mode correction is correct; the affected wrong-instance fixture still has a false-positive rejection path. No production authentication bypass was identified in this scoped review. Actual AMD64 current-source contracts remain pending independently.

Scope: `3ea3e796c3a6035d33450e1e150bfff4f215b2eb..9475775d3116bd1fea05db812145a6e280333864`, supplied scoped diff, appended round2 report and retained focused evidence. The earlier packaging finding remains closed. No old full-package review or broad test suite was repeated. The accepted Yama/root-controlled launch clarification is unchanged.

## Important — Wrong-instance test can pass because its forged peer exits

**Location:** `packages/grading-runtime/host/test_native.py:432` and `:449`; affected fixture lifecycle at `:145-165`. Adjacent client classification at `packages/grading-runtime/host/attestor-client.c:102-110` was inspected specifically to validate these new exact error assertions.

The wrong-instance case now requires `ATTESTOR_CLIENT_CHANGED`, but `forged_server` closes the response connection and immediately returns, allowing the child process to exit. The client uses the same CHANGED classification for both the instance comparison and its later process/cgroup/socket/pidfd checks. If instance validation is accidentally removed or bypassed, an exited forged peer can still cause the later liveness check to return CHANGED and make this required security contract pass. Which path wins depends on process scheduling. The exact classification now excludes the earlier PEER-mode failure, but does not isolate instance verification.

**Required fix:** Keep the forged process alive after closing its response stream (EOF is required by the protocol) until the parent finishes the client operation, with bounded fixture cleanup. Add a valid-response control using the same explicitly root-forged test proof that succeeds through all remaining checks; then mutate only the response instance and require CHANGED. This is fixture-only authority and must not become a production bypass. The control makes the intended branch reviewable and prevents an incidental dead-peer rejection from masking an instance-check regression.

This is a test/evidence correctness finding, not evidence of a current production exploit. The existing production instance comparison remains correct. No additional Critical or Minor findings established in this scope.

## Production correction assessment

`protocol.c:106-122` extracts the existing startup bind into `bind_attestor_socket`. The 0177 mask removes owner execute from Linux socket creation's 0777 permission basis, producing the contract's exact0600 atomically. It preserves nonblocking/CLOEXEC, checks pathname length, closes a newly allocated FD on bind failure, does not unlink/adopt an existing entry and does not listen. The production caller still obtains the path exclusively from validated fixed root configuration.

`attestor.c:88-92` calls that shared startup function, then requires unchanged policy installation before listen. No syscall policy, verifier predicate, proof schema, capability, namespace, deadline or runtime operation was loosened. The root bootstrap's exact0600 check and normal peer/proof socket-mode equality remain intact. Both binaries changing hashes is expected because the shared protocol module is linked into each.

The compiled bind fixture exercises the actual production helper function; its observed mode/FD flags and preserved existing-path content/inode are meaningful checks. The live setup mode assertion improves failure localization. Explicit proof-parser rejection of0700 preserves verifier strictness. Forged listener0600 and PEER/PROTOCOL assertions improve branch validity; the CHANGED ambiguity above is the remaining gap.

## Evidence inspected

- Retained actual run41038461369 log hash independently recomputed as `8993cc5a0bbd9ebcdbd9ada625588e4fc4f2e768e76e00867d3414b0329cb867`, matching the report. It shows the actual production-filter contract passed on the prior source and the suite ended with19 tests/13 failures. Live setUp failures do not establish later positive/adversarial assertions or any learner execution.
- Retained shared-bind RED is an actual `448 1 1` versus expected `384 1 1` mismatch. This establishes the old0700 producer defect without relaxing0600 verification.
- Retained rebuilt local focused GREEN has6 passing contracts: shared bind, SHA256, strict JSON, config, proof and static artifact. Native build commands retain warnings-as-errors/static hardening; the build log has successful compilation/export. These are not a current full live/policy pass.
- Retained production broker build reaches image export. Artifact verification reports strict identity `fb5e4a385a598408585f8a9cab9c94740511123fe62ddf47232e69624548ddb2`, expected runtime inventory, archive root ownership,0555 tools/single links and preserved self-workspace-link handling.
- Independently hashed current extracted binaries and compared manifest/report: attestor `290c8b8b070fb0fe681de9cefdea5b40b2178bb34d62c8f37fa6c459f66b4d62` /1,210,264 bytes; client `863c2b7c3eee267e8667ca089d62be45e6172347797323a000961799b9e5c442` /1,210,392 bytes. Both match.

## Cannot Verify / disposition

The mode mismatch is a definite source defect and the producer correction repairs it. It is not proof that all other bootstrap guards or later live tests will pass; the report correctly says so. The13 affected live methods and updated exact-class tests still need actual AMD64 execution on the corrected reviewed source. The previous real policy pass must remain attributed to its previous source epoch. Kernel/learner execution remains0/24 and Task 1/Task 2 dependency closure is not established here.

Fix the fixture lifecycle/control above, then proceed through scoped source review and the mandatory actual AMD64 native-contract gate. No code, Git state, CI, services, provisioning or host settings were modified by this reviewer; only this scratch review was written.
