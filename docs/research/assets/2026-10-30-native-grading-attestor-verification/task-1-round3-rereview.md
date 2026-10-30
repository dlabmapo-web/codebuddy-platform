# Task 1 round 3 scoped fixture rereview

**Source spec: ✅. Quality: Approved.** The Important wrong-instance fixture false-positive finding from `task-1-round2-review.md` is closed at `0257fc29ef2effe5fafdba2e53a23728b862dfe9`. **Actual AMD64 native contracts and Task 1 closure remain pending.**

Scope: supplied `9475775d3116bd1fea05db812145a6e280333864..0257fc29ef2effe5fafdba2e53a23728b862dfe9` diff, appended round3 report and focused retained lifecycle/build logs. Review covered the finding, affected forged-response callers, cleanup and proof/data isolation. Only test_native.py changed; unchanged production code, packaging and the old full review package were not reaudited.

## Finding resolution

The forged server closes each accepted response stream before signalling its completion barrier. It then keeps its process and listening socket alive while waiting for explicit parent release. Every native-client caller releases only after the client has returned and its expected result has been checked. The parent also checks that the child is still alive at that point. Consequently, required response EOF no longer implies process exit before the native client's later liveness observations.

The wrong-instance contract now runs valid, invalid-instance, valid responses on one PID and one socket. It writes one explicitly root-forged fixture proof beforehand and checks the same bytes throughout. Both controls require native exit 0, empty stderr, and the expected normal output object binding the exact proof SHA256 and daemon identity. The negative changes one instance character, guaranteeing a distinct valid-shaped value, and requires CHANGED. If the production instance comparison were removed, that middle exchange should succeed and the negative assertion would fail, rather than passing through an incidental dead-peer rejection. The second valid control further checks that proof/process state remains usable after the negative.

Other malformed response modes now get a valid control on the same peer/proof before the negative, while wrong-peer retains the original legitimate proof. The separate root-bootstrap test rejects the Python listener while it is alive and verifies original proof bytes remain unchanged. This clearly separates root-forged fixture authority used to isolate ordinary-client protocol checks from production bootstrap acceptance; no production bypass or diagnostic operation is introduced.

No remaining Critical, Important or Minor source findings in this scoped fixture fix.

## Cleanup and isolation assessment

- The fixture accepts at most three exchanges; accept/read timeouts are 3 seconds and the explicit release wait is bounded at 10 seconds. Parent coordination waits are also bounded.
- Context cleanup runs on assertions/exceptions as well as success, releases a waiting child, joins for 2 seconds, then kills and rejoins if needed. The parent verifies the owned child is no longer alive. Normal callers additionally require exit code 0.
- Each completed exchange has an indexed barrier. The next server exchange begins only after the prior release is consumed and cleared, so sequential controls do not reuse a stale release signal.
- Each forged peer owns one socket lifetime. The context owns process cleanup instead of leaving these children to the older live-test child list. Temporary lifecycle directories are isolated; live cases replace the old socket only between peer contexts.
- Proof mutations use a copied proof object. The instance case keeps the exact resulting bytes across all three calls; valid controls check the returned proof hash and expected daemon object. The original proof remains available for wrong-peer and separate bootstrap rejection cases.

## Evidence inspected

The retained lifecycle RED has eight failures, each specifically asserting that response EOF must not terminate its peer, across valid/wrong-peer/timeout/oversized/malformed/nonce/trailing/instance modes. It reports 1 method in 2.166 seconds, 8 failures.

The retained GREEN has 3 passing methods in 4.590 seconds: all eight response modes with exact response bytes/EOF and kernel SO_PEERCRED, repeated exchanges preserving process start time/PID/socket inode, and bounded owned-process cleanup when the parent aborts before accept. These tests exercise the same server/barrier functions used by the native-client controls. I inspected the logs without rerunning them or any broad suite.

The retained rebuild manifest records unchanged production binary hashes: attestor `290c8b8b070fb0fe681de9cefdea5b40b2178bb34d62c8f37fa6c459f66b4d62` and client `863c2b7c3eee267e8667ca089d62be45e6172347797323a000961799b9e5c442`. The production 0600 bind repair, strict verifiers, policy and runtime artifact are unchanged in this test-only round. The previous artifact identity remains `fb5e4a385a598408585f8a9cab9c94740511123fe62ddf47232e69624548ddb2`.

## Cannot Verify / disposition

The real Unix lifecycle GREEN proves the fixture's EOF/process-lifetime behavior. It does not prove the newly added ordinary native-client positive controls pass under the full native environment. Those controls and all live contracts must execute on actual AMD64 at the reviewed source. The retained prior run 41038461369 remains failed, with 13 live setup failures and their later assertions unexecuted; its policy pass remains attributed to that prior epoch. Task 1 completion, Task 2 dependency closure, actual broker/learner containment and latency acceptance remain unestablished.

The source gate is approved for proceeding to the mandatory actual AMD64 native-contract run. Only this scratch rereview was written; no implementation, Git, CI, provisioning or host-policy state was changed.
