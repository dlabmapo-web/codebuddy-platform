# COVE Edu marketing site

**Status:** design
**Date:** 2026-08-11

## 1. What this is

A public marketing site for COVE Edu, the company, with Cove Studio — the
product this repo builds — as its most prominent exhibit.

It ships as a **new workspace package, `@cove/home`**, not as a route group
inside `@cove/web`. Three reasons the separation is worth a second Next app:

1. `@cove/web` sets `Cross-Origin-Embedder-Policy: require-corp` on `/:path*`
   so Pyodide can use `SharedArrayBuffer`. A marketing site wants the freedom
   to embed a YouTube frame, a map, or a tag manager, and every one of those is
   blocked under COEP. Relaxing it per-route is possible and fragile; not
   inheriting it is neither.
2. Everything in `@cove/web` is behind authentication and renders dynamically
   from a cookie. The marketing site is anonymous and static. Keeping them in
   one app means the static site pays for the dynamic app's root layout.
3. Release cadence differs. Marketing copy changes weekly and must never be
   able to break a class in session.

The two apps share `@cove/i18n` — the same locale files, the same `ko`/`en`
settings, the same cookie name — so a reader's language choice survives the
hop between them.

### Routes

| Route | Purpose |
| --- | --- |
| `/` | The company. Every section from the client brief. |
| `/cove-studio` | The product, in depth. |

Named `/cove-studio` rather than `/studio` on purpose: `/studio` is the real
application's path in `@cove/web`, and having the marketing mirror shadow it
would make every future conversation about "the studio route" ambiguous.

### Ports

`@cove/web` owns 3000. `@cove/home` takes **3100**.

## 2. Audience and job

Two buyers arrive on the same page:

- **Education operators** — academy directors, school and university staff —
  who might adopt Cove Studio or enrol students.
- **Institutional buyers** — enterprise L&D, public agencies, military units —
  booking AI·AX lectures and startup programs.

The page's single job is to make a Korean institutional buyer believe COVE Edu
is a real operating company — it runs a campus, ships a product, and teaches
actual rooms full of people — and then get them to call **02-6941-1311**.

## 3. Where the visual language comes from

The logo is a hexagon assembled from discrete coloured blocks — teal, blue,
coral, yellow — with a wave running through it. Two things follow.

**It is not a mono-blue brand.** Almost every Korean edtech site is one blue
and a stack of grey cards; both reference sites (crabit.co.kr, elice.io) are.
COVE Edu's own mark sanctions four hues. Using them as a *functional* system —
one hue per audience, carried consistently down the page — is the cheapest
available way to look like nobody else while staying entirely on-brand.

**It is a construction.** Separate pieces locking into one shape, with water
through them. "Cove" is a sheltered bay: separate currents arriving in one
place. That is also, literally, the company's pitch — 학생부터 대학, 기업,
공공기관까지, one company.

### Signature: the spectrum rail

One idea, two appearances:

1. The hero's four audience panels each carry a 3px top rail in their own hue.
2. Each section eyebrow sits above a short 2px rule in that section's hue.

The rail encodes which part of the business you are reading, so it is
navigation rather than decoration.

A third appearance — a four-segment bar along the footer's top edge — was cut.
By that point in the page the rail has already done its work, and a hard band
of four colours between the last section and the footer read as a divider
someone forgot to remove rather than as the page closing on its own shape.

### Gradients

The first version of this design used none. The client asked for them, so the
question became which ones — and the answer came off the mark again:

- **The aura.** The hero's background is the mark's four blocks at page scale,
  blurred into the paper and positioned the way the logo positions them: teal
  upper left, blue upper right, sun far right, coral low centre. It is the
  logo's own colour arrangement rather than a stock mesh.
- **`--grad-brand`** is the wave — the mark's blue running into its teal. It
  fills the primary button, the index plates, and the card's hover border.
- **`--grad-warm`** is the two warm blocks, for the 기업·기관 and 창업 sections.
- **`--grad-deep`** lights the navy bands from the upper left.

What is deliberately absent is a single four-stop sweep through every hue. The
mark's colours cross from cool to warm, and interpolating blue straight into
coral runs through a purple that appears nowhere in the brand. So the hues are
paired the way the mark pairs them, and all four together only ever appear as
discrete segments — which is what they are in the logo.

### Section grounds

No section is flat white. Between the coloured bands, plain paper read as
unfinished rather than as restraint. Every light section carries one of the
mark's hues as a pair of radial washes at 5–13% alpha, and they alternate so
two consecutive sections never share one:

| Ground | Hues | Used by |
| --- | --- | --- |
| `cool` | blue + teal | 사업영역, 문의, product 학생 화면 |
| `mist` | flat `--mist` + a brand bloom | 회사소개, AI·AX, 파트너 |
| `teal` | teal + blue | 캠퍼스, product 연결 구조 |
| `warm` | coral + sun | 창업 프로그램, product 세부 사항 |
| `deep` | the navy radial | the Cove Studio band |

None is strong enough to cost body text its contrast; the darkest of them
takes `--ink` on white from 15.9:1 to 15.1:1.

### Elevation

Shadows are tinted with `--ink` rather than neutral black, so a raised card
reads as lifted off *this* page and not off a grey one. The primary button
carries a blue-tinted shadow (`--shadow-brand`), so it sits in coloured light
rather than on a grey drop.

## 4. Tokens

### Colour

Sampled from the supplied `coveedu-logo.svg`.

| Token | Hex | Role |
| --- | --- | --- |
| `--cove-blue` | `#095EDB` | Anchor. The mark's blue. |
| `--cove-teal` | `#58D5C3` | Students / AI·코딩 교육 |
| `--cove-coral` | `#F56B61` | 기업·기관 교육 |
| `--cove-sun` | `#FAC517` | 파트너 / 문의 |
| `--cove-sky` | `#86BBF1` | The mark's second wave |
| `--cove-deep` | `#101C2E` | Deep water. Hero panels, footer, the Cove Studio band. |
| `--paper` | `#FFFFFF` | Page |
| `--mist` | `#F2F6FC` | Alternate section ground |
| `--ink` | `#1B2638` | Body text — the wordmark's own colour |
| `--sub` | `#5A6678` | Secondary text |
| `--line` | `#E1E8F3` | Hairlines |

**Fills and text are different tokens.** As text on white the logo values
measure 1.8:1 (teal), 2.9:1 (coral), and 1.6:1 (sun) — all under the 4.5:1
body bar, the last two under even the 3:1 bar for large text and icons. They
are right as fills and on the deep bands, and wrong the instant a glyph is set
in them, so each has a darkened counterpart used only for type on paper:

| Token | Hex | On white |
| --- | --- | --- |
| `--cove-teal-ink` | `#0B7A6A` | 5.3:1 |
| `--cove-coral-ink` | `#D33F32` | 4.6:1 |
| `--cove-sun-ink` | `#8F6708` | 5.2:1 |

Blue needs no counterpart: `#095EDB` is already 5.8:1 on white, and white on it
is the same. `lib/hues.ts` encodes the split — `bar` is the fill, `text` is the
ink.

The logo's `edu` grey (`#8693A4`) is 3.1:1 on white, so it stays at logo scale
and never becomes a text token.

Neutrals are cooled toward the blue rather than taken from a stock grey ramp —
`--mist` and `--line` both carry blue, so a section ground never reads as
default slate.

The hero panel tints do not share one alpha. The four hues sit at very
different luminances, and a uniform 7% would put a clearly visible blue plane
next to an almost-white teal one; each is tuned until the four read as equally
present.

### Type

Pretendard alone is what every Korean edtech site uses, and it is why they all
look alike. The pairing here splits the two jobs:

- **Pretendard** — all Korean, all body copy. Already a dependency of
  `@cove/web`; self-hosted, no network fetch.
- **Space Grotesk** — Latin structural layer *only*: eyebrows, section labels,
  numerals, `COVE STUDIO`, `AI · AX`, `01`–`05`. Its slightly irregular
  geometry echoes the constructed feel of the mark, and it never touches
  Korean or body text. Loaded through `next/font/google`, which self-hosts at
  build time.

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Display | `clamp(2.5rem, 6vw, 4.5rem)` | 800 | `-0.035em` |
| H2 | `clamp(1.75rem, 3.5vw, 2.75rem)` | 700 | `-0.03em` |
| H3 | `1.25rem` | 700 | `-0.02em` |
| Body | `1rem / 1.75` | 400 | `-0.006em` |
| Eyebrow (Grotesk) | `0.8125rem` | 600 | `0.14em`, uppercase |

`word-break: keep-all` applies under `:lang(ko)`, as it does in `@cove/web`:
Korean has no intra-word spaces and the default `break-word` splits 어절
mid-word.

### Layout

A 12-column grid at `max-width: 1200px`. Section headers occupy columns 1–5
and their content columns 6–12, so headers and content **stagger** down the
page rather than centring. Section rhythm is 120px desktop / 72px mobile.

Cards are used only where the content is a genuine set of peers — the three
사업 영역, the five 창업 steps. Everything else is hairline dividers and space.
No shadowed-card soup.

## 5. The hero is the range

The most characteristic true thing about COVE Edu is that the same company
teaches a child their first `print()` and briefs an auditorium of officers on
AI adoption. 스타트업부터 대기업, 국가기관, 그리고 학교 현장까지.

So the hero is not a headline over a product shot. It is the range, stated and
then evidenced:

```
배움에서 경험으로,
경험에서 가능성으로               [Cove Studio 보러가기]  [교육 문의]

COVE EDU는 AI와 코딩을 통해 새로운 가능성을 발견하고,
직접 만들어가는 교육을 제공합니다.

━━━━━━━━━  ━━━━━━━━━━  ━━━━━━━━  ━━━━━━━━━━━━━
│ 학생    │ 학원·학교  │ 대학    │ 기업·공공기관 │
│ teal    │ blue       │ coral   │ sun           │
└─────────┴────────────┴─────────┴───────────────┘
```

Each panel carries a photograph of the room it names, plus its icon and its
hue rail.

The two photographs from the client's brief are **not** used here — they are
the campus and AI·AX sections' evidence, and repeating them 800px higher up
made the page look like it owned two images. The hero instead uses four
Pexels photographs (Pexels License: commercial use, no attribution required),
one per audience, centre-cropped to the panel's 4:5 and verified against their
labels before shipping. Any of the four is a one-line swap for a real COVE Edu
photograph, and that swap is worth making — a real room always beats a stock
one, which is exactly why the campus section keeps its own.

## 5a. Code layout

Both `page.tsx` files are an order and a set of props, nothing else. Every
section is its own file:

```
src/components/sections/          ← the company page
  hero-section.tsx  about.tsx  areas.tsx  studio-preview.tsx
  campus.tsx  enterprise.tsx  startup.tsx  partners.tsx  contact.tsx
src/components/sections/studio/   ← /cove-studio
  hero.tsx  students.tsx  teachers.tsx  flow.tsx
  details.tsx  close.tsx  points.tsx
src/components/site/
  site-chrome.tsx                 ← SiteHeader / SiteFooter, copy wired
```

`site-chrome.tsx` exists because both pages were repeating forty lines of
identical prop mapping, which is how a nav item ends up present on one page and
missing from the other. Each page now names only what differs: which link is
current, and what the header is sitting on.

Each page resolves translations once and passes `t` down, typed as
`MarketingT` or `ProductT` from `i18n/types.ts`. A section never opens its own
i18next instance, and the namespace tuple in the type is what keeps a typo in
`t("about.titel")` a compile error instead of a raw dotted key on screen. The
product page resolves both namespaces separately — `t` for its own copy, `m`
for the shared chrome — which is cheaper to read than prefixing forty call
sites with `marketing:`.

The two page files are **42 and 56 lines**. Before the split they were ~600 and
~500, at which point the section order — the one thing a page file should make
obvious — was invisible.

## 6. Page structure

### `/` — the company

| # | Section | Hue | Content |
| --- | --- | --- | --- |
| 1 | Header | — | Logo, anchor nav, language switch, 교육 문의 CTA |
| 2 | Hero | all four | Above |
| 3 | 회사소개 | blue | 교육과 기술을 연결합니다 + the positioning paragraph |
| 4 | 주요 사업 영역 | blue | 교육부터 기술까지, 하나의 흐름으로 연결합니다 — three cards: AI·코딩 교육 / 교육 솔루션 / 기업·기관 교육 |
| 5 | Cove Studio | teal | Full-bleed `--cove-deep` band. 교육 현장에서 시작한 코딩 학습 솔루션. Product screenshot, square-on. Links to `/cove-studio`. |
| 6 | 디랩코딩학원 마포캠퍼스 | teal | The campus they operate |
| 7 | 기업·대학·공공기관 | coral | 스타트업부터 대기업, 국가기관, 그리고 학교 현장까지 + the three outcome figures |
| 8 | 창업 프로그램 | coral | `01`–`05`: Education / Writing / Program / Coaching / Consulting |
| 9 | 파트너사 | sun | Logo wall |
| 10 | 문의 | sun | 02-6941-1311 |
| 11 | Footer | rail | Company details, links |

**On the `01`–`05` numbering.** Numbered markers are a design cliché when the
content is an unordered set. Here it is an actual sequence — 아이템 발굴 →
사업계획서 → 정부지원사업 → IR 피칭 → MVP — so the ordinals carry information
the reader needs, and they are set large in Space Grotesk as a result.

### `/cove-studio` — the product

Hero, then the four surfaces the brief names — 코드 에디터 / 문제풀이 /
학생 학습 / 선생님 관리 — each with a screenshot and a short claim, then a
close that routes to the real application's sign-in.

Screenshots are rendered square-on in plain browser chrome. No tilt, no 3D, no
device mockup: the product is the argument, and perspective tricks make a
screenshot harder to read in exchange for looking like every other SaaS page.

## 7. Motion

- On load, the hero headline's two lines fade up, then the four audience
  panels wipe up in sequence at 90ms stagger — the four currents arriving.
  This is the one orchestrated moment.
- Section headers and list items fade up on scroll, once, never on the way
  back.
- Cards and panels lift 4–6px on hover with the shadow deepening; the card's
  hairline becomes the brand gradient and its hue bloom fades in.
- Buttons lift 1px on hover and return to zero on `:active`, so they have a
  press. An arrow inside any button slides 2px.
- The partner wall scrolls continuously and pauses on hover.

- The hero's audience photographs scale 6% on hover. The photo is its own
  layer rather than a background on the panel, so the scrim, rail, icon and
  caption stay put while it moves.
- A band of light sweeps once across the filled brand button on hover. Only
  that one — a sheen on every control stops being an accent and becomes noise.
- The `Live` dot on the teacher roster pulses. It is the one element on the
  site whose entire job is to say "this is happening now", so it earns it.

No parallax, no counting numbers, no hover tilts. Every one of the above is
inside a `@media (prefers-reduced-motion: reduce)` guard — including the
partner wall, which is the worst offender on the page if it never stops.

### One accessibility note

The site shipped with a skip-to-content link — the standard control that lets
a keyboard user jump past the nav instead of tabbing through five links on
every page. It was removed at the client's request.

Nothing else on the site depends on it, and restoring it is a single component
plus one line in each page. Keyboard focus order, visible focus rings, and the
`prefers-reduced-motion` guards are all still in place.

## 7a. Language control

The marketing site uses the same control as the product, so the two never read
as two companies: a globe glyph plus the locale *code* on the trigger, and each
language's own name in the menu. It mirrors
`components/studio/header-controls.tsx` in `@cove/web`, down to the fixed-width
code box that stops the header reflowing when the language changes. The only
addition is an `onDeep` tone, because this header spends its first screen over
the navy hero and the product's never does.

## 8. Content and i18n

Copy lives in `@cove/i18n` as two new namespaces, `marketing` and `product`,
in both `ko` and `en`. Two rather than one because `locales.spec.ts` caps any
single namespace at 15 KB, and a full landing page plus a product page in one
file would approach it.

Neither namespace joins `layoutNamespaces` — that list is `@cove/web`'s root
payload budget, and marketing copy has no business in it. `@cove/home` loads
them per-page.

Korean is the authoring language for tone; English is a real translation, not
a machine pass, since elice.io/en is a stated reference.

## 9. Brand assets

The supplied logo is in place:

- `public/brand/coveedu-logo.svg` — the full lockup, mark plus wordmark
- `public/brand/coveedu-mark.svg` — the mark alone, derived by cropping the
  lockup's viewBox to the mark's bounds (`0 0 228 281`)
- `src/app/icon.svg` — the same mark, as the favicon

The pages render the lockup through `components/brand/logo.tsx`, which inlines
the paths rather than loading the file. Two reasons: the header then costs no
extra request, and `tone` can recolour the wordmark. The supplied wordmark is
`#1B2638`, which is invisible on the deep navy bands, so on those it renders
white with the `edu` grey lightened to `#93A3B8`. The mark's six colours are
literal hex in that component and are never tokens — a logo is a fixed asset
and must not move if the palette is retuned.

The two files under `public/brand/` remain canonical for everything outside
React: OG images, decks, anything a designer opens.

## 10. Assets in place, and what still needs a decision

The logo (§9), both photographs, and all eight partner marks are now in the
repo. The photographs and partner marks were lifted out of the client's own
brief PDF at the client's instruction, trimmed, and optimised:

- `public/photos/classroom.jpg` — the Mapo campus, in the 캠퍼스 section
- `public/photos/lecture.jpg` — an institutional lecture, in the AI·AX section
- `public/partners/*.png` — eight marks, normalised to a 120px render height

Three things are still the client's call, not the build's:

1. **The classroom photograph shows minors** with emoji stickers over their
   faces. The stickers are low quality and sit on a public commercial page. If
   it ships, the redaction should be redone properly, or the shot replaced
   with one taken for the purpose with consent on file.
2. **The lecture photograph shows identifiable faces** in the foreground.
   Same question, for adults on a client site.
3. **The partner marks are third-party trademarks.** Lifting them from the
   brief is not the same as clearance. Each of AI LEADERS, MILITERA, D·LAB,
   연세대학교, AIIRC, GigaVis, Samsung, and Kakao needs a written agreement
   permitting use on a commercial homepage before launch. They are trivially
   removable — one entry each in `components/site/partner-wall.tsx`, which
   falls back to the name as a wordmark when a `src` is absent.

The marks also arrive with their backgrounds baked in — black, navy, yellow —
because they are screenshots rather than logo files. They are shown in full
colour on a shared white tile for that reason; a grayscale pass does nothing
to a black plate and muddies the yellow ones. Clean transparent files would
let the wall drop the tiles entirely.

Still outstanding: real Cove Studio screenshots at 2x, to replace the CSS
mocks in `components/site/screenshot.tsx`.
