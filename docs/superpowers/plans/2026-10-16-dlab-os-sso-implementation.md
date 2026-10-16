# DLAB OS SSO implementation plan

Approved design: `docs/superpowers/specs/2026-10-16-dlab-os-sso-connection-design.md`.
Branch: `feat/dlab-os-sso`, based on the reviewed local v2 history. Preserve existing untracked documents. No remote merge or deployment is included.

1. Add bounded shared contract schemas and safe redirect handling.
2. Add additive identity/campus/binding persistence and migration; explicit campus mapping command.
3. Implement state storage, OS code exchange, provisioning, Supabase bridge, and one-time session activation.
4. Implement managed eligibility and mutation restrictions, status updates, and socket backstop.
5. Add trusted and inbound controllers, Studio routes, localized login button/errors, deployment examples/routing.
6. Run boundary tests, typechecks, production builds, and inspect the resulting diff.
7. Document live-project validation and unresolved production gates. Real OS test requires registered callback and a controlled mapped student. Never use conversation credentials in tracked files.

The writing-plans skill referenced by brainstorming is not installed in the available skill directories; this repository-native plan records the implementation sequence directly. The user's instruction approves implementation; no further design approval is required.
