# Release-controlled DLAB OS domain

The approved SSO release must move the API and Studio to the new OS domain while retaining rollback to the currently deployed image, whose API schema accepts only the old domain. Changing the shared private API file ahead of approval would leave rollback unable to start that image.

Follow the established release-manifest pattern: `set-v2-release.sh` adds the public new `DLAB_OS_BASE_URL` alongside the new image SHAs. Compose overrides this value for API and judge worker, which share API configuration. An older manifest without the key resolves to the old Render origin. Private API credentials and its legacy domain value remain unchanged. Preflight checks the effective manifest override. Local environment behavior is unchanged.

The protected GitHub production approval controls when the new images and domain become active. Application rollback restores the previous manifest and its domain together. The additive staff-SSO migration remains forward-only and managed account reconciliation uses the documented audited operator commands after deployment. Enable only verified mapped campuses, leaving Mapo's existing ordinary accounts unchanged.

Acceptance: test release selection without replacing the active manifest, preflight resolution without modifying private inputs, and real Compose configuration for both new and old manifests. Run CI and disposable SSO integration/browser tests before tagging. Never commit real deployment environments or approve the protected environment on the user's behalf.
