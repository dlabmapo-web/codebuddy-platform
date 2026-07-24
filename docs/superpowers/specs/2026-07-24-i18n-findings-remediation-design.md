# Cove v2 i18n Findings Remediation

**Date:** 2026-07-24  
**Status:** Approved direction, pending implementation  
**Parent design:** `docs/design/2026-07-24-cove-v2-internationalization-design.md`

## Purpose

Finish the Phase 1–2 internationalization work by resolving the seven code-review findings without changing the parent design's locale model, URL strategy, namespace structure, or v2-only scope.

## Reference decisions

The remediation combines the parts of the two reference projects that fit Cove:

- Docquery supplies the extraction workflow shape: an `i18next-parser.config.mjs` beside the web package and a package script that invokes the parser.
- Kichkintoy supplies the API-error boundary: normalize unknown/oRPC errors into a typed application error, then translate stable `AppErrorCode` values through the `errors` namespace with a safe fallback.
- Cove keeps its own stricter typed resources, locale parity, payload budget, Korean plural handling, and no-proxy architecture. The references do not override the approved Next 16 decision to resolve the cookie and `Accept-Language` in the root layout.

## Architecture

### Typed translation access

`useLayoutTranslation` will preserve `react-i18next`'s native argument and return types instead of rebuilding its generics. Translation keys stored as data will use namespace-specific `TranslationKey` types or literal `satisfies` maps. Cross-namespace calls will bind all used namespaces at the hook call.

### API error translation

Add two focused modules:

1. An error normalizer that accepts `unknown`, recognizes oRPC errors, extracts validation issues, and narrows either the transport code or `data.code` to `AppErrorCode`.
2. A client hook that translates known codes from the `errors` namespace, returns the first validation issue when appropriate, and otherwise uses a caller-provided localized fallback. Raw internal server messages must not be exposed as the default user-facing result.

V2 query and mutation error states will use this hook where an actual request error is available. Screen-specific fallback messages remain in their route namespace.

### Workflow enforcement

The web package will gain:

- `i18next-parser.config.mjs`;
- `i18n:extract` for intentional extraction;
- a non-mutating `i18n:check` command covering key parity, payload size, stale keys, and unresolved `TODO(copy)` values;
- scoped `i18next/no-literal-string` configuration for `(v2-auth)`, `(v2-studio)`, and `components/studio`, with narrow exclusions for code samples, CSS/class values, technical identifiers, and user-generated content.

Parser output will be directed to a temporary directory during stale-key verification so CI never modifies the working tree.

### Formatting

The shared format package will expose date, short-date, date-time, time, number, and percent helpers using `Asia/Seoul`. `initTranslations` will register corresponding cached i18next formatters so translated strings can format interpolated values inline.

### Locale switching

Both switchers will call one browser utility responsible for setting the locale cookie, synchronizing `<html lang>`, and reloading. This retains the parent design's full-reload behavior while isolating the deliberate DOM mutation from React component lint analysis.

## Tests and verification

- Update academy-access tests to assert language-neutral state rather than removed English copy.
- Add tests for oRPC/application-code extraction, safe fallbacks, formatter output, stale-key detection, and unresolved copy markers.
- Preserve locale parity, plural normalization, payload budget, and error-code exhaustiveness tests.
- Required verification: workspace typecheck, recursive tests, focused v2 lint/i18n checks, and production web build.
- Existing unrelated repository-wide lint failures will be reported separately; no unrelated v1 cleanup is included.

## Non-goals

- No locale-prefixed routes or i18n proxy.
- No account-level locale persistence.
- No API email translation.
- No translation of user-generated content, source-code samples, provider names, or technical identifiers.
- No weakening of typed translation keys to make compilation pass.
