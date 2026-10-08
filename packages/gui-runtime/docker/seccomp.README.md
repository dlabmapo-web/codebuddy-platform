This seccomp allowlist is vendored from https://raw.githubusercontent.com/moby/profiles/main/seccomp/default.json on 2026-10-08 under the adjacent Apache-2.0 license.

SHA-256: `6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6`.

Apply it explicitly; do not inherit the Docker daemon's default profile. Updating it requires rerunning the CPython/Tk and isolation integration tests. The trusted broker loads the profile file and sends it through Docker's CLI, so the path need not be mounted into the learner or Docker host.
