# Academy manager Turtle PIN management

User authorized manager UI and confirmed one shared PIN per academy.

Add a manager-only section to Academy settings with Generate, Show/Hide, Copy
and Replace code, plus a link to `/turtle`. Replacement uses a Cove confirmation
dialog describing revocation of that academy's existing guest access. A stale
manager view must refresh rather than silently overwrite another manager.

Generate cryptographically random six-digit strings server-side, preserving
leading zeros. Active PINs are globally unique so `/turtle` needs only the PIN.
Store encrypted PINs and a keyed lookup digest in the existing durable Redis
service (production AOF and noeviction are already configured). Never put codes
in URLs, audit metadata, logs, browser storage or shared query caches. Retain
retired digests for two hours to avoid immediate reassignment to another academy.
The API-only pepper derives a separate AES-GCM encryption key with HKDF.

Manager operations use existing authenticated oRPC and live
`academy.settings.manage` authorization, academy ACTIVE checks and Redis limits.
Record non-secret audit intent before revealing or rotating secrets; Redis CAS
atomically changes PIN/index/version. Audit failure refuses the operation.

Guest grants carry academy ID and PIN version. Check current version and live
academy status on protected requests. Rotating academy A does not revoke B.
Public guests remain account-free and never gain membership/course access.
Bootstrap supplies the academy name for the workspace header.

The operator's old global code becomes an explicitly enabled legacy option;
production defaults to academy-managed codes. Keep it enabled only for the
isolated existing local fixture. No database migration or production mutation.
Redis data/key loss fails managed access closed; restore its durable backup or
have managers replace their codes. Changing the pepper requires replacing codes.

Validate real Redis collisions/CAS/revocation/cross-academy behavior; manager
authorization and audit failures; config flags; public legacy regressions; and
manager UI confirmation, copy, error and Korean/English states. Run memory-heavy
checks sequentially on the local 8 GiB machine.
