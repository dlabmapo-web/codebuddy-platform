# Cove v2 Internationalization (i18n) Design

**Product working name:** Cove Studio
**Status:** Proposed
**Date:** 2026-07-24
**Scope:** `packages/web` v2 surfaces (`(v2-auth)`, `(v2-studio)`, `components/studio`), new `packages/i18n`
**Reference systems:** Kichkintoy (`@kichkintoy/translations` + `packages/web/i18n`), Docquery (`packages/next/src/i18n`), [i18next docs](https://www.i18next.com/)

---

## 1. Purpose

Cove Studio serves Korean academies (D·LAB) but is built and demoed in English. Every v2 screen currently hardcodes its copy — English in `(v2-studio)`, mixed Korean/English in `(v2-auth)`. This design adds a translation layer so that every string on a v2 screen is authored once, keyed, and rendered in the viewer's language.

Launch languages: **Korean (`ko`)** and **English (`en`)**. The design must not make adding a third language a rewrite.

### 1.1 Why now

The v2 migration is in progress and only ~41 files are affected today (16 in `(v2-studio)`, 19 in `(v2-auth)`, 6 in `components/studio`). Retrofitting i18n after the studio is feature-complete costs multiples of that. Doing it now also means every new v2 screen is authored keyed from the start, enforced by lint.

### 1.2 Non-goals

- **Translating v1.** `(student)`, `(teacher)`, `(admin)`, `(auth)`, `(fullscreen)` stay as-is. They are being replaced; translating them is wasted work.
- **Localizing user-generated content.** Course titles, lecture bodies, problem statements, and AI feedback stay in whatever language the author wrote. Content localization is a database-schema problem (per-locale content rows), not a UI-string problem, and belongs in a separate design.
- **Translating API-generated emails.** Deferred to Phase 4 (§9).
- **Locale-aware URLs for SEO.** No public marketing site exists yet. See §4.3 for the upgrade path.

---

## 2. Recommendation summary

| Decision | Recommendation | Why |
| --- | --- | --- |
| Library | `i18next` 26 + `react-i18next` 17 + `i18next-resources-to-backend` 1 | Proven in both your projects; the docs you're working from |
| Locale in URL | **No** — cookie only (`i18next` cookie) | Kichkintoy's converged state; app is fully behind auth, so SEO is not a driver |
| Proxy/middleware | **None** for i18n | Next 16 deprecated `middleware.ts` → `proxy.ts`; `next-i18n-router` is not needed once the cookie is read in the root layout |
| Locale storage | `packages/i18n` workspace package | Keeps `@cove/shared` a pure contracts package; API and any future client can read the same settings |
| Provider | One root `LayoutTranslationsProvider` with all namespaces | Kichkintoy's final shape; per-page providers only for oversized namespaces |
| Default locale | `ko` | Product's primary market |
| Fallback locale | `en` | Different from default, deliberately — see §3.2 |
| Key typing | Yes — `CustomTypeOptions` augmentation from the `en` JSON | Typos become typecheck failures; neither reference has this and both have drifted keys |
| Hardcoded-string guard | `eslint-plugin-i18next`, scoped to v2 paths | The enforcement piece both references lack |

The two things this design does **differently** from your references — no proxy/middleware, and typed keys — are both deliberate and are justified in §4.2 and §7.2.

---

## 3. Locale model

### 3.1 Settings module

`packages/i18n/src/settings.ts`, mirroring `@kichkintoy/translations/settings`:

```ts
export const locales = ["ko", "en"] as const;
export type Locale = (typeof locales)[number];

/** What a brand-new visitor gets when Accept-Language matches nothing. */
export const defaultLocale: Locale = "ko";

/** What i18next falls back to for a key missing in the active locale. */
export const fallbackLocale: Locale = "en";

export const defaultNS = "common";
export const localeCookieName = "i18next";
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
```

### 3.2 Default ≠ fallback (deliberate)

Both references collapse these into one constant (`fallbackLng` doubles as the default locale). Splitting them is better:

- **Default `ko`** — a Korean academy administrator with a Korean browser, or any visitor whose `Accept-Language` matches neither locale, lands on Korean. Correct for the primary market.
- **Fallback `en`** — when a key exists in `en` but not yet in `ko`, i18next renders the English string rather than the raw key (`studio.members.title`). English is the authoring language, so it is always complete by construction.

A Korean user briefly seeing an English label is a much smaller failure than any user seeing a dotted key. §7.3's CI gate means this should not fire in practice; it is the safety net.

### 3.3 Detection order

1. `i18next` cookie, if it holds a supported locale.
2. `Accept-Language` header, matched with `@formatjs/intl-localematcher` + `negotiator` (exactly Docquery's `getLocaleServer.ts`).
3. `defaultLocale`.

Resolved once, in the root layout. There is no client-side detection — it would cause a hydration mismatch and a flash of the wrong language.

---

## 4. Architecture

### 4.1 Package layout

```
packages/i18n/                          # new
  package.json                          # exports "./settings" (built) and "./locales/*" (raw JSON)
  src/settings.ts
  src/format.ts                         # Intl date/number helpers (§6.3)
  src/locales/
    en/{common,nav,auth,academy,members,applications,invitations,courses,content,errors,validation}.json
    ko/…                                # identical key set

packages/web/src/i18n/                  # new
  server/initTranslations.ts            # createInstance + resourcesToBackend
  server/getServerTranslation.ts        # cookie/header → { locale, t } for RSC & generateMetadata
  LayoutTranslationsProvider.tsx        # context-scoped instance for the app shell
  PageTranslationsProvider.tsx          # per-page instance, for oversized namespaces only
  useLayoutTranslation.ts               # the hook v2 components call
  types/i18next.d.ts                    # typed keys (§7.2)
```

**Why a package rather than `@cove/shared`.** `@cove/shared` is a contracts package compiled to `dist` and consumed by both `@cove/api` and `@cove/web`; routing locale JSON through its `tsc` build and export map muddies that role. A dedicated package also mirrors Kichkintoy's `packages/translations`, which is the shape that survived contact with three client apps.

**Why not just `packages/web/src/i18n/locales`** (Docquery's shape): the API already owns the `AppErrorCode` union (`packages/shared/src/errors/codes.ts`) whose messages the web translates (§6.4), and Phase 4 wants localized emails from the API. A shared locale package keeps one source of truth when that happens.

### 4.2 No proxy, no `next-i18n-router`

This is the main departure from both references, and it is forced by Next 16.

- Docquery runs a vendored `i18nRouter` inside `middleware.ts`. **Next 16 deprecated the `middleware` file convention and renamed it to `proxy.ts`** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Porting a vendored router to a deprecated-then-renamed convention is churn for no gain.
- Kichkintoy still lists `next-i18n-router` in `package.json` and keeps `i18n/middleware/config.ts`, but **has no middleware file at all** — the dependency is dead. Its root layout reads the cookie directly. That is the pattern that actually ships.

So: no proxy file, no `next-i18n-router` dependency. The root layout reads the cookie and the `Accept-Language` header via `next/headers`. This is strictly less machinery than either reference and one fewer deprecated API to migrate later.

**Tradeoff to accept:** calling `cookies()`/`headers()` in the root layout opts the entire tree into dynamic rendering. Cove Studio is fully behind authentication and already dynamic, so nothing is lost. Revisit only if a statically-rendered public page group is added — at which point that group gets `/[locale]` prefixes (§4.3) and its own layout.

### 4.3 Upgrade path to prefixed URLs

If a public marketing or course-catalog surface arrives and needs per-locale SEO, add `app/(public)/[locale]/…` for that group only. `initTranslations` takes the locale as an argument and does not care where it came from, so the change is confined to one layout plus a `generateStaticParams`. The authenticated studio keeps clean, unprefixed URLs. Nothing in this design blocks that.

### 4.4 Provider strategy

`initTranslations` is the shared primitive (Kichkintoy's `server/initTranslations.ts`, essentially verbatim):

```ts
await i18nInstance.init({
  lng: locale,
  resources,
  fallbackLng: fallbackLocale,
  supportedLngs: [...locales],
  defaultNS: namespaces[0],
  fallbackNS: namespaces[0],
  ns: namespaces,
  preload: resources ? [] : [locale],
  // React already escapes interpolated values; i18next must not escape again,
  // or an apostrophe in "Bo'lim" renders as "Bo&#39;lim".
  interpolation: { escapeValue: false },
});
```

The `escapeValue: false` line and its rationale come straight from Kichkintoy's hard-won comment. Keep the comment.

**Root layout** resolves the locale, calls `initTranslations(locale, allNamespaces)`, and wraps children in `LayoutTranslationsProvider`, which serializes the resource bundle into the RSC payload once.

**Why the custom context** instead of plain `<I18nextProvider>`: `useTranslation` resolves to the *nearest* i18next context. The moment a page adds its own provider for a page-specific namespace, every shell component underneath it (sidebar, header, switcher) silently loses the layout's namespaces. Keeping the layout instance in a separate `I18nLayoutContext`, read by `useLayoutTranslation`, makes shell components immune to whatever a page does. Both references converged on this independently — adopt it, and adopt the naming so the pattern is recognizable across your projects.

**Rule for v2 code:** components under `components/studio` and any shell/nav component use `useLayoutTranslation(ns)`. Page-local components use `useTranslation(ns)` from `react-i18next` and rely on the root provider. `PageTranslationsProvider` is used only when a namespace exceeds the budget in §4.5.

### 4.5 Payload budget

Every root-provider namespace ships in the RSC payload of every page. Kichkintoy ships 28 namespaces this way without trouble; the 11 proposed here are far smaller.

**Budget: ≤50 KB total per locale in the root provider; no single namespace over 15 KB.** When one crosses it — the course builder is the likely first — move it out of the root list into a `PageTranslationsProvider` on its route. A test asserts the budget so it fails loudly rather than degrading silently.

---

## 5. Namespaces

Namespaces track the v2 route structure so a screen's keys are findable from its path.

| Namespace | Owns | Loaded by |
| --- | --- | --- |
| `common` | Buttons, states, empty/loading, confirm dialogs, language names | root |
| `nav` | Sidebar groups and links, academy switcher, sign-out | root |
| `auth` | `(v2-auth)`: login, signup, invitation, pending, welcome | root |
| `academy` | Academy overview, role selector | root |
| `members` | Members table and actions | root |
| `applications` | Join-request review | root |
| `invitations` | Invitation management | root |
| `courses` | Course list, create/edit, version marks | root |
| `content` | Course builder, sections, lectures | root → page provider when it outgrows the budget |
| `errors` | `AppErrorCode` → message (§6.4) | root |
| `validation` | Zod/form field errors | root |

`common` is `defaultNS`. Namespaces are added when a new route group appears, not per screen.

### 5.1 Key conventions

- **English sentence-case values**, `snake_case` keys, grouped by component or screen: `members.invite_dialog.title`.
- Max two levels of nesting under the namespace. Deeper trees get unreadable in the JSON and in `t()` calls.
- **No key reuse across namespaces for convenience.** Duplicating `"Save"` in two namespaces is cheaper than a shared key that one screen later needs to change.
- **Never concatenate.** `t('members.removed_count', { count })`, never `t('removed') + count + t('members')` — the word order is different in Korean.

---

## 6. Korean-specific requirements

These are what separates a working setup from a correct one, and neither reference documents them.

### 6.1 Plurals

Korean has no grammatical plural — i18next's `ko` rules produce only `_other`. English produces `_one` and `_other`. Any key with a count is authored as:

```jsonc
// en/members.json
{ "selected_one": "{{count}} member selected",
  "selected_other": "{{count}} members selected" }

// ko/members.json
{ "selected_other": "{{count}}명 선택됨" }
```

The CI key-parity check (§7.3) must treat `_one`/`_other` as one logical key, or it will report false missing keys on every Korean plural. This is a concrete gotcha to encode in the check, not an afterthought.

### 6.2 Particles — the interpolation trap

Korean subject/object particles change with the preceding syllable's final consonant: 은/는, 이/가, 을/를. Interpolating a noun mid-sentence produces grammatically wrong Korean roughly half the time:

```jsonc
// WRONG — "코스를" vs "과정을" depends on the interpolated word
{ "deleted": "{{name}}을 삭제했습니다" }

// RIGHT — one full sentence per subject
{ "course_deleted": "코스를 삭제했습니다",
  "lecture_deleted": "강의를 삭제했습니다" }
```

**Rule: interpolate numbers, dates, and user-entered proper nouns only. Never interpolate a translatable noun into the middle of a Korean sentence.** Where English wants one generic key, Korean gets several specific ones — that is correct, not duplication.

### 6.3 Formatting

Dates and numbers are formatted with `Intl`, not with translated format strings. `packages/i18n/src/format.ts` exports thin helpers bound to a locale, registered as i18next formatters so they are usable inline:

```
en: Jul 24, 2026 · 1,204 · 24%
ko: 2026년 7월 24일 · 1,204 · 24%
```

Timezone is `Asia/Seoul` for both locales — academy schedules are Korean regardless of viewer language. Hardcode it in the helper rather than relying on the browser.

### 6.4 Error messages

`packages/shared/src/errors/codes.ts` already exports `appErrorCodes` and `appErrorFallbacks` (English). This is the right seam: **the API returns codes, the web translates them.** No API changes needed.

`errors.json` uses the code as the key (`ACADEMY_NOT_FOUND`, `PERMISSION_DENIED`, …). A typecheck-level assertion binds the two so adding a code to the union without adding a message fails the build:

```ts
const _exhaustive: Record<AppErrorCode, string> = enErrors;
```

### 6.5 Typography

- `<html lang>` must be set from the resolved locale — currently hardcoded `"ko"` in `app/layout.tsx`. It drives font selection, hyphenation, and screen readers.
- `pretendard` is already a dependency and covers Latin + Hangul, so no font work is needed.
- Add `word-break: keep-all` to Korean body copy. Without it browsers break Korean lines mid-word, which reads as broken to a native speaker. Apply via a `:lang(ko)` rule in `globals.css` so it costs nothing in English.
- Korean UI text runs ~10–30% shorter than English. Sidebar and table-header layouts must not assume English width — check the studio sidebar and data-table headers when converting.

---

## 7. Developer workflow and enforcement

### 7.1 Extraction

`i18next-parser` scans `src/**/*.{ts,tsx}` and writes any new key into both locale files, English filled and Korean empty (Docquery's `i18next-parser.config.mjs` and its `"trans"` script). Exposed as `pnpm --filter @cove/web i18n:extract`.

### 7.2 Typed keys

i18next's `CustomTypeOptions` augmentation, generated from the **English** JSON as the source of truth:

```ts
// packages/web/src/i18n/types/i18next.d.ts
import type common from "@cove/i18n/locales/en/common.json";
// …

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: { common: typeof common; nav: typeof nav; /* … */ };
  }
}
```

`t('nav.membrs')` then fails `pnpm typecheck` instead of rendering the key at runtime. Neither reference does this, and both have accumulated dead and misspelled keys as a result. It costs one file.

### 7.3 CI gates

Three checks, all in `packages/web`'s existing vitest setup plus the existing `typecheck`/`lint` scripts:

1. **Key parity** — `en` and `ko` have identical key sets, with the plural-suffix normalization from §6.1. Fails on any untranslated key.
2. **No stale keys** — re-run the parser into a temp dir and diff; fails if a key exists in JSON but nowhere in the source.
3. **Payload budget** — §4.5.

### 7.4 Preventing regressions

`eslint-plugin-i18next`'s `no-literal-string` rule, enabled **only** for `src/app/(v2-*)/**` and `src/components/studio/**`. v1 route groups are excluded so the existing code does not start failing lint. New hardcoded copy in a v2 screen becomes a lint error at authoring time. This is the piece that makes the whole thing hold — without it, translation coverage decays the week after the migration lands.

### 7.5 Language switcher

A `components/studio` control (Kichkintoy's `language-switcher.tsx` is a direct model): writes the `i18next` cookie, sets `document.documentElement.lang`, and reloads.

**Phase 1 uses a full `window.location.reload()`.** Language switching is a rare, deliberate action, and a reload guarantees the server-rendered tree, the client i18n instance, and every cached React Query entry agree. A `router.refresh()` variant avoids the flash but requires the client provider to reconcile new resources into an existing instance — worth doing later, not worth the bug surface now.

Placed in the studio sidebar footer next to sign-out, and on the `(v2-auth)` screens (a user who cannot read the login page cannot reach the sidebar).

---

## 8. Migration of existing v2 screens

~41 files, in dependency order:

1. **Shell first** — `components/studio/*` and `studio-sidebar.tsx`. The nav labels (`'Academy'`, `'Overview'`, `'Courses'`, `'Members'`, `'Applications'`, `'Invitations'`) are literals in `studioNavGroups`; they become `nav.*` keys resolved via `useLayoutTranslation`.
2. **`(v2-auth)`** — 19 files, and the only place with existing Korean copy (8 strings). Those Korean strings become the seed `ko` values rather than being re-translated.
3. **`(v2-studio)` pages** — the four managers (members, applications, invitations, courses) and `academy-overview`.
4. **Course builder** — largest surface; do last, and measure it against the §4.5 budget.
5. **Metadata** — `app/layout.tsx`'s hardcoded `title: '페어코드'` becomes `generateMetadata` using `getServerTranslation`.

Server components (`StudioShell` takes `title="Academy"` as a prop today) use `getServerTranslation()`; client components use the hooks.

---

## 9. Phasing

| Phase | Scope | Exit criterion |
| --- | --- | --- |
| **1 — Foundation** | `packages/i18n`, web `i18n/` module, root layout wiring, `common`/`nav`, switcher, typed keys, CI gates | Sidebar and shell fully bilingual; switching works; gates green |
| **2 — v2 coverage** | Remaining namespaces, all `(v2-auth)` + `(v2-studio)` screens, `no-literal-string` lint enabled | Zero hardcoded strings in v2 paths |
| **3 — Account preference** | `User.locale` column; login sets the cookie from the profile; switcher writes both | Language follows the account across devices |
| **4 — API-side locale** | Invitation and notification emails read `User.locale`; API imports `@cove/i18n` | Emails arrive in the recipient's language |

Phases 1–2 are the deliverable this design asks approval for. 3 and 4 are sketched to confirm nothing here blocks them — neither does.

---

## 10. Dependencies

`packages/web`:

```
i18next@^26.3.1
react-i18next@^17.0.8
i18next-resources-to-backend@^1.2.1
@formatjs/intl-localematcher@^0.6.1
negotiator@^1.0.0            (+ @types/negotiator)
i18next-parser               (dev)
eslint-plugin-i18next        (dev)
```

Versions match what Kichkintoy runs in production against Next 16 / React 19, so the combination is known-good. `next-i18n-router` is deliberately **not** included (§4.2).

---

## 11. Decisions (resolved 2026-07-24)

1. **Default locale is `ko`.** Confirmed. `defaultLocale = "ko"`, `fallbackLocale = "en"` as specified in §3.2.
2. **`packages/i18n` is created as a workspace package.** Confirmed. Locale JSON and settings live there, not inside `packages/web`.
3. **v2's existing Korean copy is authoritative; the English side is the open work.** Resolved — see §11.1.

### 11.1 Brand, proper nouns, and marketing copy

All 8 existing Korean strings in v2 live in one file, `app/(v2-auth)/auth/_components/auth-card.tsx` — the brand panel of the auth screens. They are not UI chrome, and they do not all get the same treatment:

| Content | Class | Handling |
| --- | --- | --- |
| 코브 스튜디오 | Brand name | Key in `common`, `ko` = 코브 스튜디오, `en` = Cove Studio. Fixed brand forms, never re-translated. |
| 마포캠퍼스 | Proper noun (campus) | Key in `common`. `en` form is a brand decision, not a translation — "Mapo Campus", or keep the Korean. Defaults to "Mapo Campus"; flag if wrong. |
| 코딩 교육 플랫폼 | Tagline | Key in `auth`. Short enough to translate directly. |
| 함께 풀어서 / 더 빨리 느는 코딩 | **Marketing headline** | Key in `auth`. `ko` is authoritative. `en` gets a literal placeholder marked `TODO(copy)` — it needs English copy *written*, not translated. |
| 선생님과 1:1 실시간으로… | **Marketing subhead** | Same as above. |

**Rule this establishes:** brand names and proper nouns are keyed so each locale can render its own form, but they are never treated as translatable prose. Marketing copy is keyed with the source locale authoritative and the other locale marked `TODO(copy)` until a human writes it — a literal translation of a headline reads worse than no translation. The key-parity CI check (§7.3) passes on `TODO(copy)` values since the key exists; a separate lint surfaces the remaining count so they are not forgotten.

This applies to every future marketing surface, not just `auth-card`.
