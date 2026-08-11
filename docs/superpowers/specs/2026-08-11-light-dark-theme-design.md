# Light and Dark Theme Design

**Date:** 2026-08-11

**Status:** Implemented, except open question 1

**Scope:** All `@cove/web` surfaces — v2 studio, v2 auth, and the remaining v1-era route groups

**Companion:** `docs/design/2026-07-24-cove-v2-internationalization-design.md`

## 1. Decision

Cove Studio gains a light and dark theme, switched by a single icon button at
the top right of every page. The reader's choice is stored in a `cove-theme`
cookie and resolved **on the server**, so the correct theme is present in the
first byte of HTML and no theme flash is possible.

There is no `system` option. Two themes and a toggle mean the control can name
its own state, which is what lets it render correctly on the server.

The colour system is restructured into two layers. A palette layer defines
plain CSS custom properties under `:root` and `.dark`. A Tailwind layer maps
them through `@theme inline`, so every existing utility — `bg-canvas`,
`text-ink`, `border-border` — keeps its name and starts switching with the
theme. Component code does not gain `dark:` variants.

This deliberately differs from the `next-themes` approach used by the docquery
`home` package. That package is statically generated and therefore needs a
render-blocking inline script, `suppressHydrationWarning`, and a toggle that
cannot render until after hydration. Our root layout already awaits `cookies()`
for the locale, so the tree is dynamic and none of those costs are necessary.
Next 16's own guidance in `02-guides/preventing-flash-before-hydration.md`
names server-side resolution as the correct approach when the page is already
fully dynamic.

## 2. Current state and finding

`app/globals.css` declares every colour as a literal hex inside `@theme`. In
Tailwind v4 those values are substituted at build time, so a `.dark` override
of the same custom property has no effect. The token layer must be split before
any theme can switch. There is no `darkMode` config option in v4 either; the
class variant is declared in CSS with `@custom-variant`.

The token vocabulary itself is in good shape and worth preserving. Utilities
already read `ink`, `sub`, `canvas`, `surface`, `border`, `brand`, `peer`,
`present`, `unstable`, `draft`, and `retired`, and the existing comments in
`globals.css` explain what each family means. Only 6 raw `gray`/`slate`
classes exist in the entire application.

The blocking gap is `bg-white`. It appears 186 times across 82 files, with a
further 11 `bg-white/N`, 10 `hover:bg-white`, and 13 `border-white`. `white` is
a Tailwind primitive, not a Cove token, so none of it can respond to a theme.
Every raised surface in the product — `Card`, `Modal`, `Input`, the studio
`selector` trigger, sidebar panels — is painted with it.

`text-white` appears 97 times, almost all of it a label on a filled brand or
primary button. Those cannot become `text-ink`, because in dark mode the fill
beneath them is lightened rather than darkened. They need an explicit
foreground token.

138 arbitrary hex literals remain in 25 files. The large majority are VS Code
Dark+ syntax colours and terminal chrome inside the editor and result panes,
which are dark in both themes by design. `.tiptap-render` and `.cove-peer-*`
in `globals.css` also hardcode hex and do need conversion.

### 2.1 Pre-existing contrast failures

Measuring the current light palette against WCAG AA (4.5:1 for body text)
surfaces four failures that exist today and are not introduced by this work:

| Pair | Now | Role |
| --- | --- | --- |
| `#fff` on `primary` `#E8461C` | 3.94:1 | Primary CTA button label |
| `success` `#16A34A` on white | 3.30:1 | 31 `text-success` uses, incl. `bg-success/10` chips |
| `warning` `#D97706` on white | 3.19:1 | 18 `text-warning` uses |
| `retired` `#64748B` on `retired-soft` | 4.34:1 | 13 `text-retired` uses |

The last three are corrected as part of this work: `success` → `#15803D`
(5.02:1), `warning` → `#B45309` (5.02:1), `retired` → `#5A677A` (5.24:1). All
three are darkenings of the same hue and read as the same colour.

The first is a brand decision and is **left unresolved by this design**.
`#E8461C` is the Cove primary. Reaching 4.5:1 with white text requires
`#D13A12` (4.86:1) or darker; the existing `primary-hover` `#C93A15` already
clears it at 5.12:1. Section 11 records this as an open question rather than
changing brand colour unilaterally.

## 3. Goals

- Give the reader a light and dark theme choice that persists.
- Render the resolved theme server-side with no flash and no hydration warning.
- Switch themes without a page reload.
- Keep every existing token name working, so component code does not change
  except where it used a non-token colour.
- Keep `dark:` variants out of component code entirely.
- Meet WCAG AA (4.5:1) for every text-on-surface token pair in both themes.
- Keep code surfaces — Monaco, terminal, result panes — dark in both themes.
- Localize the switcher in English and Korean.
- Prevent regression with a lint check rather than review discipline.

## 4. Non-goals

- Per-academy or per-role theming, or reader-authored custom palettes.
- Persisting the theme server-side against the user record. The cookie is the
  only store; a reader on a new device starts at the default theme.
- Theming the Monaco editor, terminal, or Python result panes. They stay dark.
- A high-contrast or colour-blind-specific mode.
- Changing the type scale, spacing, radii, motion, or any non-colour token.
- Redesigning any screen. This pass changes colour resolution only.
- Adding `next-themes` or any other theming dependency.
- Cross-tab theme synchronization.
- Migrating the arbitrary syntax-highlight hex inside editor components.

## 5. Token architecture

### 5.1 Two layers

The palette layer declares plain custom properties. Nothing in the application
references these names directly.

```css
:root {
  color-scheme: light;
  --canvas: #F4F7FC;
  --card: #FFFFFF;
  --ink: #16181D;
  /* … */
}

.dark {
  color-scheme: dark;
  --canvas: #0E1117;
  --card: #171C26;
  --ink: #E6E9EF;
  /* … */
}
```

The Tailwind layer maps them. The `inline` keyword is mandatory: without it
Tailwind resolves each `var()` at build time and the `.dark` block silently
does nothing.

```css
@theme inline {
  --color-canvas: var(--canvas);
  --color-card: var(--card);
  --color-ink: var(--ink);
  /* … */
}
```

Non-colour tokens — `--radius`, `--radius-card`, `--radius-modal`,
`--font-sans` — stay in a plain `@theme` block, since they do not vary by
theme.

`color-scheme` is set per theme so native scrollbars, form controls, and
`<input type="date">` follow without further styling.

### 5.2 The dark variant

Tailwind v4 has no `darkMode` option. Dark is always an explicit choice, so one
selector covers it:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

The variant exists so third-party markup and one-off cases can reach dark
styles. Cove component code does not use it.

### 5.3 New tokens

`--color-card` is the raised surface: what `bg-white` meant. It is the single
most important addition, since 186 call sites depend on it.

`--color-on-brand`, `--color-on-primary`, `--color-on-peer`,
`--color-on-success`, `--color-on-danger`, and `--color-on-warning` are the
label colour for a filled swatch of that colour. In light they are `#FFFFFF`;
in dark they are `#0B1017`, because dark-mode fills are lightened rather than
darkened. Measured, `#0B1017` clears 6.20:1 to 9.01:1 against every dark fill.
This is the `--primary-foreground` idea from the shadcn vocabulary docquery
uses, named for readability at the call site.

### 5.4 The dark palette

Values below are measured, not estimated. Every text pair clears 4.5:1.

| Token | Light | Dark | Dark contrast |
| --- | --- | --- | --- |
| `canvas` | `#F4F7FC` | `#0E1117` | — |
| `surface` | `#F6F7F9` | `#12161F` | — |
| `card` | `#FFFFFF` | `#171C26` | 1.11:1 vs canvas |
| `accent` | `#F1F5F9` | `#1E2532` | 1.11:1 vs card |
| `border` | `#E5E8EC` | `#262D3A` | 1.23:1 vs card |
| `ink` | `#16181D` | `#E6E9EF` | 14.03:1 on card |
| `sub` | `#5A6270` | `#99A1B0` | 6.57:1 on card |
| `brand` | `#1B64DA` | `#5B93F5` | 5.64:1 on card |
| `brand-deep` | `#1450B5` | `#7FADFF` | hover lightens |
| `brand-soft` | `#EAF1FE` | `#16233A` | 5.19:1 with brand |
| `primary` | `#E8461C` | `#F2683F` | 5.55:1 on card |
| `primary-hover` | `#C93A15` | `#FF7B54` | hover lightens |
| `primary-light` | `#FDEDE7` | `#2C1610` | — |
| `success` | `#15803D` | `#45C97F` | 8.06:1 on card |
| `danger` | `#DC2626` | `#F87171` | 6.17:1 on card |
| `warning` | `#B45309` | `#E3A008` | 7.56:1 on card |
| `peer` | `#7C3AED` | `#A78BFA` | 6.00:1 on peer-soft |
| `peer-soft` | `#F3EEFE` | `#221B3A` | — |
| `present` | `#15803D` | `#45C97F` | 7.69:1 on present-soft |
| `present-soft` | `#E9F7EF` | `#10241A` | — |
| `unstable` | `#475569` | `#94A3B8` | 6.24:1 on unstable-soft |
| `unstable-soft` | `#EEF2F6` | `#1B222D` | — |
| `draft` | `#A45A08` | `#E0A34A` | 7.24:1 on draft-soft |
| `draft-soft` | `#FDF4E3` | `#2A2011` | — |
| `retired` | `#5A677A` | `#94A3B8` | 6.24:1 on retired-soft |
| `retired-soft` | `#F1F5F9` | `#1B222D` | — |
| `sidebar` | `#FFFFFF` | `#12161F` | — |
| `sidebar-border` | `#E9EDF3` | `#222937` | — |
| `sidebar-accent` | `#EAF1FE` | `#1B2740` | — |
| `ring` | `#1B64DA` | `#5B93F5` | — |
| `editor-bg` | `#1E1E1E` | `#1E1E1E` | unchanged in both |

The distinctions the existing comments protect are preserved in dark: `peer`
stays violet and separate from `brand`; `present` and `unstable` stay separate
from `success` and `retired`; `draft` stays separate from `warning`.

### 5.5 Elevation inverts

In light, a raised surface is white with a shadow on a grey page. In dark,
shadows are invisible against a dark page, so elevation is carried by
lightness and a border instead:

- `card` is **lighter** than `canvas`, not darker.
- Every raised surface keeps a `border-border` edge in dark. Shadow-only
  elevation must gain a border.
- Existing literal shadows such as
  `shadow-[0_8px_32px_rgba(22,24,29,0.18)]` on `Modal` become a
  `--shadow-modal` token that resolves to a deeper, larger-radius shadow plus a
  visible border in dark.

Pure `#FFF` on pure `#000` is not used. `ink` in dark is `#E6E9EF` on `#0E1117`
at 14.03:1 — comfortably above AA without the halation full contrast causes on
OLED panels.

## 6. Theme resolution and switching

### 6.1 Settings module

`@cove/shared` is not involved; the theme is a web-only display concern. The
module lives beside the existing i18n equivalents and mirrors their shape:

```text
src/lib/theme/settings.ts       themes, Theme, defaultTheme, isTheme,
                                themeCookieName, themeCookieMaxAge
src/lib/theme/get-theme.ts      server: cookie → Theme
src/lib/theme/set-theme.ts      client: cookie + <html> mutation
src/lib/theme/theme-provider.tsx  client: context + useTheme()
```

`Theme` is `'light' | 'dark'`. `defaultTheme` is `'light'`. `oppositeTheme()`
names what the toggle switches to, so the button and its label cannot disagree.

### 6.2 Server resolution

`getTheme()` reads `cove-theme` and falls back to `defaultTheme`. It is
deliberately simpler than `getLocale()`: there is no `Accept-*` header to
negotiate, because the reader has either chosen a theme or gets the default.

The root layout applies both attributes:

```tsx
const theme = await getTheme();

<html
  lang={locale}
  data-theme={theme}
  className={theme === 'dark' ? 'dark' : undefined}
>
```

`className` drives the dark variant. `data-theme` is not load-bearing for
styling and is kept only so the active theme is inspectable in the DOM.
`suppressHydrationWarning` is not needed and must not be added: the server and
client agree because both read the same cookie.

Reading a second cookie adds no rendering cost. The tree is already dynamic
from `getLocale()`.

### 6.3 Client switching

Unlike the language switcher, changing theme does **not** reload. Locale
reloads because the server tree, the i18next instance, and every cached React
Query entry have to agree on the language. Theme is a pure CSS concern with no
server-rendered text depending on it, so mutating the two attributes is
sufficient and instant:

```ts
export function setBrowserTheme(theme: Theme): void {
  document.cookie = `${themeCookieName}=${theme}; path=/; max-age=${themeCookieMaxAge}; SameSite=Lax`;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
```

The cookie keeps the next server render in agreement. `SameSite=Lax`,
`path=/`, and a one-year max-age match `setBrowserLocale`.

`ThemeProvider` is a thin client context seeded from the server-resolved value
and holding the current choice, so the switcher can render the selected state
during SSR. It does not read `matchMedia`, own an effect, or gate rendering on
hydration.

### 6.4 The header controls

Theme and language are two icon buttons at the top right, built together in
`components/studio/header-controls.tsx` and exported as one `HeaderControls`
pair. They share a single `control` class string, because they sit adjacent and
any difference in height, radius, or hover state reads as a defect rather than
a distinction.

Both are buttons, not menus. Each axis has exactly two values, so a menu would
ask the reader to choose between the option they want and the one they already
have. A click commits.

`ThemeToggle` shows the **current** theme — a sun means the lights are on —
while its accessible name and tooltip carry the **destination**, since an icon
alone cannot say which way a switch goes. `LanguageToggle` shows the current
locale in its own script (`한국어` / `English`), which reads correctly to
someone who cannot read the surrounding language.

`HeaderControls` mounts in two places:

- `studio-shell.tsx`, in the existing sticky header, pushed right with
  `ml-auto`. Every studio page renders through this shell, so the controls are
  in the same place on all of them.
- `auth-card.tsx`, in the auth header, so both choices are reachable before
  sign-in.

Because the value is server-rendered, each button renders its correct icon and
label on the server. The `isClient` guard docquery's `ModeToggle` needs is not
required and must not be copied.

The sidebar footer keeps only Sign out. The four earlier components —
`theme-switcher.tsx`, `language-switcher.tsx`, `auth-theme-switcher.tsx`, and
`auth-language-switcher.tsx` — are deleted rather than left as a second way to
do the same thing.

### 6.5 Localization

New `common` namespace keys: `theme.label`, `theme.light`, `theme.dark`,
`theme.switch_to`, plus `language.switch_to`. English and Korean are authored
together, and the strings pass
the existing `pnpm --filter @cove/web i18n:check`. No fragment concatenation.

`common` is already in `layoutNamespaces`, so no namespace budget changes and
the `locales.spec.ts` payload cap is unaffected by four short keys.

## 7. Migration

### 7.1 Mechanical replacements

| From | To | Count |
| --- | --- | --- |
| `bg-white` | `bg-card` | 186 |
| `bg-white/N` | `bg-card/N` | 11 |
| `hover:bg-white` | `hover:bg-card` | 10 |
| `border-white` | `border-card` | 13 |
| `text-white` on a brand/primary/peer fill | `text-on-brand` etc. | ~97 |
| `bg-gray-*`, `bg-slate-*`, `text-slate-*` | nearest token | 6 |

The `text-white` row is the only one requiring judgment: each occurrence must
be read to determine which fill it sits on. Where white sits on a permanently
dark surface — a terminal pane, an editor chrome strip, the peer cursor label —
it stays `text-white`.

`.tiptap-render` and `.cove-peer-*` in `globals.css` swap their literal hex for
`var(--…)` palette references. The peer label's `color: #fff` stays literal:
it sits on a saturated violet fill in both themes.

### 7.2 Route groups

The v2 surfaces are migrated in full. The v1-era `(admin)`, `(auth)`,
`(fullscreen)`, `(student)`, and `(teacher)` groups are **pinned to light**
instead, with `.theme-light`.

An earlier draft of this section called for migrating them too. That was wrong:
those pages hold ~1,257 colours in inline `style` props that no class migration
reaches, so converting their 65 `bg-white` sites produced near-black text on a
darkened card. Pinning is both correct and cheaper on code that the v1 cutover
deletes.

### 7.3 Regression guard

A `theme:lint` script, modelled on the existing `i18n:lint`, fails on
`bg-white`, `text-\[#…\]`, and `(bg|text|border)-(gray|slate|zinc|neutral)-\d`
outside `globals.css` and the editor components allowlist. Without it the
system decays within a release or two, which is visibly what happened to the
docquery `home` package: 233 hand-written `dark:` variants against 89 token
uses, and a `.dark` block whose Ghost-blog variables were copied from `:root`
unchanged and left `/* todo */`.

## 8. Data and security

No API, database, or authorization change. The theme is a display preference
held in a non-sensitive, non-`HttpOnly` cookie so client code can write it.

The cookie value is validated by `isTheme()` before use. An attacker-controlled
value cannot reach the DOM: an unrecognized value falls back to `defaultTheme`,
and only the literal string `dark` produces a class name. The value is never
interpolated into markup, style, or a script.

No inline script is introduced, so the design adds no `'unsafe-inline'` or
nonce requirement to any future Content Security Policy — a concrete advantage
over the `next-themes` approach, which the Next 16 guide flags as CSP-blocked
without a nonce.

## 9. Error handling

A missing, malformed, or truncated cookie resolves to `defaultTheme`, which is
`light`. A reader with cookies disabled can still toggle for the session; the
choice simply does not survive the next request.

If `document.cookie` throws, the attribute mutation still applies, so the theme
changes for the session and simply does not persist. The switcher does not
report an error for this.

There is no loading, retry, or failure state: switching performs no network
request.

## 10. Verification

### Token and unit coverage

- A contrast test asserts every text-on-surface pair in both themes clears
  4.5:1, reading the same palette module the CSS is generated from, so the
  table in §5.4 cannot silently drift.
- `isTheme` accepts the three valid values and rejects everything else.
- `getTheme` returns the cookie value when valid and `light` otherwise.
- `oppositeTheme` always names the other real theme.
- `setBrowserTheme` writes the cookie and sets both `<html>` attributes.
- The switcher renders the selected option's label without hydration.
- `theme:lint` fails on a fixture containing `bg-white`.

### End-to-end coverage

1. Load the studio with no cookie and confirm the OS preference is honoured on
   first paint.
2. Switch to dark, confirm no reload occurs and the change is immediate.
3. Hard-reload and confirm dark HTML arrives server-rendered, with no flash of
   light content at throttled network speed.
4. Confirm no hydration warning appears in the console in either theme.
5. Confirm the toggle icon and its accessible name always describe opposite
   things: a sun showing while the label offers dark.
6. Walk the student workspace, teacher live monitoring, content authoring, the
   roster data table, and the auth screens in dark and confirm every surface,
   border, and status chip is legible.
7. Confirm Monaco, the terminal, and the result panes are unchanged in both
   themes.
8. Confirm the peer caret, label, and selection remain visible against the dark
   editor and against a dark statement pane.
9. Confirm recharts axes, grid lines, and series remain legible in dark.
10. Confirm the theme survives a locale switch, which reloads the page.
11. Cover the switch in Chromium and WebKit at desktop and narrow widths.

## 11. Open questions

1. **Primary contrast.** White on `primary` `#E8461C` is 3.94:1, below AA for
   the 14–15px labels the product uses. Options: darken the button fill to
   `#D13A12` (4.86:1) while keeping `#E8461C` for non-text accents; adopt the
   existing `primary-hover` `#C93A15` (5.12:1) as the resting fill; or accept
   the gap as a brand constraint. This design does not choose.
2. Whether the `(admin)`, `(auth)`, `(fullscreen)`, `(student)`, and
   `(teacher)` groups are near enough to removal that migrating their 65 call
   sites is wasted effort.
3. **First visit on a dark OS.** With `system` gone, a new reader gets light
   regardless of their operating system. Following the OS for the cookie-less
   case only would keep the two-button control and still respect the setting,
   at the cost of the toggle not knowing its own state on the first render —
   the flash this design exists to avoid. Worth revisiting only if the default
   proves wrong for real readers.

## 12. What implementation changed

Eleven decisions were revised while building this, each because the code or a
screenshot showed the design was wrong:

1. **`bg-ink` needed `text-canvas`, not an `on-*` token.** `ink` and `canvas`
   already swap places between themes, so the pair stays correctly inverted
   with no new token. This affected the tooltip in `studio/primitives.tsx` and
   the `ink` button variant, both of which would have rendered a light label on
   a light fill in dark. The design had not considered `ink` as a fill at all.
2. **The peer cursor label could not keep a literal `#fff`.** §7.1 asserted the
   violet was saturated in both themes; it is not — `peer` lightens to
   `#A78BFA`, where white falls to 2.7:1. The label now takes `--on-peer`
   through a `--cove-peer-fg` variable, and `feedback-panel.tsx`, whose avatars
   use `var(--color-peer)` as an inline background, moved with it.
3. **`theme:lint` gained a per-line `theme-lint-ignore` escape.** The
   file-level allowlist was too blunt for `live-workspace.tsx`, which is light
   chrome wrapping a dark editor pane. Allowlisting the file would have dropped
   the rest of it from the check.
4. **`components/admin` and `components/charts` count as legacy.** Both are
   consumed only by the v1 `(admin)` pages. Their colour lives mostly in inline
   `style` props, which a className check cannot reach, so claiming to have
   migrated them would have been false. Note this also means recharts is not
   used on any v2 surface, and E2E step 9 has nothing to cover yet.
5. **The contrast test records the `primary` gap as a floor rather than
   skipping it.** 52 of 54 pairs clear 4.5:1; the two failures are both the
   brand orange from open question 1. The test pins them at their current 3.94
   so the gap cannot widen while it waits for a decision.
6. **`system` was dropped and both controls moved to the top right.** The first
   build put a three-option `ResponsiveSelector` in the sidebar footer, which
   gave a two-value choice a search field. Removing `system` also removed the
   duplicated palette block, the `prefers-color-scheme` media query, the
   two-branch `@custom-variant`, and the test that kept the copies in sync. The
   trade is that a first-time reader on a dark OS now sees light until they
   choose; §11 open question 3 records the alternative.
7. **The controls are menus, not toggles.** A toggle asked the reader to infer
   the destination from an icon; a menu shows both options and commits on
   click. They reuse the existing `DropdownMenu` primitives rather than a new
   popover, adding `DropdownMenuRadioGroup` and `DropdownMenuRadioItem` to
   `overlays.tsx`. The radio item carries no checkmark: in a two-row menu the
   indicator costs a column of padding to say what weight and colour already
   say, and Radix still reports `aria-checked`.
9. **The v1-era groups are pinned to light, not migrated.** §7.2 said migrate
   them; that was wrong. Converting their `bg-white` while ~1,257 hardcoded hex
   colours stayed light-mode left near-black text on a dark card — worse than
   leaving them alone. `.theme-light` re-declares the light palette for a
   subtree, and the four group layouts plus a new `(auth)/layout.tsx` carry it.
   They are removed at the v1 cutover, so pinning costs nothing.
10. **`theme:lint` walks `.ts` as well as `.tsx`.** An authenticated screenshot
   found the curriculum navigator rendering as a white slab in dark: its class
   string lives in `lib/workspace/navigator-geometry.ts`, and both the codemod
   and the check only walked components. One `text-slate-600` in
   `pending-presentation.ts` was hiding in the same blind spot.
11. **The rich-text iframe needed the theme handed across the boundary.**
   Authored statements render in a sandboxed `srcDoc` document, which inherits
   no CSS variables — no token migration could ever have reached it. It painted
   a white slab behind every problem statement in dark. `previewDocument` now
   takes a theme, emits `color-scheme` and a transparent canvas, and
   `RichTextFrame` reads `useTheme()`. This was invisible to every static check
   and to a DOM scan of the parent page; only a screenshot showed it.

8. **`--brand-panel` was split out of `--brand`.** Screenshotting the login
   screen showed the auth brand plane rendering *brighter* in dark (`#5B93F5`,
   luminance 0.297) than in light (`#1B64DA`, 0.144). Every other brand token
   lightens in dark so it can carry text; a plane covering half the viewport
   needs the opposite. `--brand-panel` is `#14315A` in dark at 10.25:1 with its
   foreground, and `theme-tokens.spec.ts` now asserts it is darker than its
   light counterpart so this class of mistake cannot recur.

## 13. Acceptance criteria

- A reader can switch theme and language from the top right of every studio
  page and every auth screen, in English and Korean.
- The selection persists across reloads, navigations, and sessions on the same
  browser.
- The correct theme is present in the server-rendered HTML; no flash of the
  wrong theme is observable at any network speed.
- No hydration warning is produced, and `suppressHydrationWarning` is not added
  to `<html>`.
- Switching theme does not reload the page.
- The theme and language controls are the same size, shape, and hover state.
- Every token pair in §5.4 meets 4.5:1 in both themes, asserted by a test.
- No `dark:` variant appears in Cove component code.
- No `bg-white` remains outside the editor allowlist, and `theme:lint` passes.
- Monaco, the terminal, and the result panes are visually unchanged.
- `pnpm typecheck` and `pnpm --filter @cove/web test` pass.
