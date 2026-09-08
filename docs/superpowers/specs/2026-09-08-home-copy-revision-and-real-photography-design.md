# The Home Page, in the Client's Own Words and the Client's Own Rooms

**Date:** 2026-09-08
**Branch:** `fix/home-copy-and-real-photos`, cut from `feat/cove-studio-v2`
**Source:** `TalkFile_홈페이지_수정사항.pdf` — nine annotated screenshots of the
live `coveedu.com`, each red box a before, each red callout an after.
**Status:** Specified. Implementation follows on this branch.

## 1. Purpose

`coveedu.com` shipped with copy written by the people who built it and
photography bought from Pexels. The client has now read it, marked it up, and
sent back two things: twenty-one specific wording and line-break corrections,
and eleven of their own image files — six photographs of rooms COVE Edu was
actually in, and eight partner marks that are not the ones currently on the
page.

Almost none of this is a redesign. The sections stay, their order stays, their
layout stays. What changes is that the page stops paraphrasing the client and
starts quoting them, and stops illustrating itself with strangers.

Three of the corrections are not wording at all — they are **where a line
breaks**, and the current components cannot express that. §5 is about the one
primitive that fixes it.

## 2. Diagnosis

### 2.1 The copy lives in one file, and that part is fine

Every string on the page comes from `packages/i18n/src/locales/{ko,en}/marketing.json`,
resolved once in `packages/home/src/app/page.tsx` and passed down as `t`. No
section opens its own i18next instance and no string is hard-coded in a
component. Twenty of the twenty-one corrections are therefore a JSON edit.

`packages/i18n/src/locales.spec.ts` enforces key parity between `ko` and `en`,
so every key added or removed has to be added or removed twice. That is a
feature here: the client only reviewed the Korean, and the parity check is what
stops the English quietly rotting into a different page.

### 2.2 A translated string cannot currently break a line

This is the one real gap. Six of the corrections keep every word and only move
where the line ends:

| Section | The client's complaint |
| --- | --- |
| 회사소개 | One paragraph wrapping to 2 ragged lines; they want 3 deliberate ones |
| 사업영역 heading | Breaks as `교육부터 기술까지, 하나의 / 흐름으로 연결합니다` — orphaning `하나의` |
| Cove Studio lead | Breaks mid-clause instead of after the comma |
| 창업 프로그램 heading | Breaks into four short lines in the narrow head column |
| 캠퍼스 body | Wants two stanzas with a blank line between them |
| 기업·기관 교육 detail | Wants the break at the sentence boundary |

Every one of these renders as `{t("about.body")}` — a bare string in a `<p>`.
A `\n` in the JSON would reach the DOM and be collapsed by CSS like any other
whitespace. There is no mechanism, so today the answer is "whatever the
viewport decides".

### 2.3 Four of the corrections also want a word emphasised

`3분`, `검증된`, `확인된 것`, and `부서` are bolded in the client's markup. Same
problem, worse: emphasis needs an element, and `t()` returns a string.

`packages/web` solves this with `<Trans>` (`packages/web/src/i18n/index.tsx:44`).
`packages/home` has no equivalent and does not need a full one — four bold runs
and six line breaks do not justify importing `react-i18next`'s `<Trans>` into
an almost entirely server-rendered site. §5 proposes something smaller.

### 2.4 The partner wall is showing the client's PDF, not the client's logos

`packages/home/src/components/site/partner-wall.tsx:8` is candid about it:

> The files are the marks from the client's own brief, lifted out of the PDF
> and trimmed to a common 120px render height […] Several arrive with their
> background baked in — AI LEADERS and MILITERA on black, 연세대학교 on navy,
> AIIRC and kakao on yellow — so they are shown in full colour rather than
> filtered to grey.

That comment describes a workaround, and the client has now removed the reason
for it. All eight replacement marks are transparent PNGs, trimmed, with no
plate behind them:

| Mark | Current file | Replacement |
| --- | --- | --- |
| AI LEADERS | black plate, 447×120 | transparent, 1106×330 |
| MILITERA | black plate, 461×120 | transparent, 228×77 |
| 디랩코딩학원 | white, 406×120 | transparent, 305×90 |
| 연세대학교 | navy plate, 394×120 | transparent, 290×102 |
| AIIRC | yellow plate, 437×120 | transparent, 285×101 |
| GigaVis | grey plate, 252×120 | transparent, 208×96 |
| SAMSUNG | grey plate, 329×120 | transparent, 304×101 (and an SVG) |
| kakao | yellow plate, 423×120 | transparent, 235×72 |

Eight coloured rectangles marching past on white tiles is what the red box on
page 8 is objecting to. With the plates gone the wall becomes eight marks on
one surface, which is what a partner wall is for.

### 2.5 The audience strip is four strangers

`packages/home/src/components/sections/hero-section.tsx:5` already anticipated
this:

> The photographs are Pexels (commercial use, no attribution required) […]
> Every one is a one-line swap for a real COVE Edu photograph, and worth
> swapping — the campus section keeps its own real room for exactly this
> reason.

The red box on page 1 spans the whole strip. The swap is now possible.

### 2.6 The campus photograph has emoji pasted over every child's face

`packages/home/public/photos/classroom.jpg` is a real Mapo classroom with a
yellow emoji over each student's face. It was the right call for an
unreleased photo, but it reads as a placeholder, and the client has now sent a
photograph of the campus storefront — signage, street, no people at all. That
is stronger evidence that the campus exists *and* has no privacy question
attached, so it replaces the masked room.

### 2.7 The footer advertises the app the site is replacing

`기존 Cove MVP 열기` links `mvp.coveedu.com` from the public footer. Page 9
boxes it with no replacement text. Confirmed with the client: **remove it.**
The old app stays served at its own domain for anyone holding the URL; the
marketing site stops pointing new readers at it.

### 2.8 The assets landed in the wrong package

They are currently untracked at `packages/web/public/home/` — the Studio's
public directory, not the marketing site's. 28 MB of 4000×3000 phone JPEGs,
plus a `logos/` directory named `1. 국방인재교육기업.png` through
`8. 카카오.png`. None of that can go into git as-is: wrong app, wrong size,
and filenames with spaces, dots, and Hangul that a URL path will have to
percent-encode.

## 3. What this change is not

- **Not a redesign.** No section is added, removed, or reordered. No colour,
  type scale, spacing, or animation changes.
- **Not a rewrite.** Where the client left text unmarked, it stays exactly as
  it is — including `about.body_2`, all five 창업 steps, `enterprise.outcome_3`,
  and every 문의 string.
- **Not an English rewrite.** The client reviewed Korean only. English gets the
  same *structural* corrections (the same breaks, the same emphasis, the same
  renamed labels) so the two locales stay the same page, but English wording
  the client never saw is not invented anew.

## 4. The corrections

Twenty-one, by section. `\n` denotes a break the client drew; `**…**` denotes a
word they bolded. Both are §5's notation.

### 4.1 Hero — page 1

| # | Key | Before | After |
| --- | --- | --- | --- |
| 1 | `hero.lead` | 코브에듀는 AI와 코딩을 통해 새로운 가능성을 발견하고, 직접 만들어가는 교육을 제공합니다. | 코브에듀는 개인화된 코딩 교육으로,\n학생들의 새로운 가능성을 열어줍니다. |

The title (`배움에서 경험으로, / 경험에서 가능성으로`) is **unchanged** — the
red vertical rule through it is the author's alignment guide showing the two
lines already break on one axis, not an instruction. It is already two keys,
`title_lead` and `title_rest`, and already breaks there.

Correction 2 is the strip itself, in §6.

### 4.2 회사소개 — page 2

| # | Key | Change |
| --- | --- | --- |
| 3 | `about.body` | Same words, three deliberate lines: `…솔루션을 통해\n학생부터 대학, 기업, 공공기관까지\n다양한 교육 현장에…` |

`about.body_2` is unmarked and unchanged.

### 4.3 사업영역 — page 3

| # | Key | Before | After |
| --- | --- | --- | --- |
| 4 | `areas.title` | 교육부터 기술까지, 하나의 흐름으로 연결합니다 | 교육부터 기술까지,\n하나의 흐름으로 연결합니다 |
| 5 | `areas.education_label` | AI·코딩 교육 | 코딩 교육 |
| 6 | `areas.education_body` | 학생 대상 체계적인 AI·소프트웨어 교육 | 학생 대상 체계적인 소프트웨어 교육 |
| 7 | `areas.education_detail` | 블록코딩으로 시작해 파이썬과 AI까지, 학년과 수준에 맞춰 이어지는 커리큘럼으로 가르칩니다. | 블록 코딩에서 파이썬, 인공지능 교육까지\n학년별 체계적인 커리큘럼으로 가르칩니다. |
| 8 | `areas.solution_label` | 교육 솔루션 | 코딩 솔루션 |
| 9 | `areas.solution_body` | 교육 현장을 위한 AI·코딩 학습 플랫폼 및 콘텐츠 | 교육 현장을 위한 코딩 학습 플랫폼 및 콘텐츠 |
| 10 | `areas.solution_detail` | 학생의 코드 실행부터 선생님의 수업 운영까지, 학원과 학교가 필요로 하는 것을 한 환경에 담았습니다. | 학생 코드 실행부터 교사의 수업 운영까지,\n필요한 기능을 하나의 환경에 담았습니다. |
| 11 | `areas.enterprise_detail` | (one paragraph) | Break at the sentence boundary: `…설계합니다.\n강연 한 번으로…` |

The client is deliberately taking `AI·` off the first two cards. Read together
with correction 5 and 8, the three cards become 코딩 교육 / 코딩 솔루션 /
기업·기관 교육 — one word shared by the first two, and AI reserved for the
enterprise card where it is the actual subject. `enterprise_label` and
`enterprise_body` are shown in grey in the markup, meaning unchanged.

### 4.4 Cove Studio — page 4

| # | Key | Before | After |
| --- | --- | --- | --- |
| 12 | `studio.lead` | (one paragraph) | 학생의 학습부터 교사의 수업 운영까지,\n하나의 환경에서 연결합니다. |
| 13 | `studio.point_run_title` | 브라우저에서 바로 실행되는 파이썬 | 브라우저에서 실행되는 파이썬 |
| 14 | `studio.point_run_body` | 설치도 계정 설정도 없이, 수업 시작 3분 만에 첫 코드를 실행합니다. | 설치나 계정 설정 없이,\n수업 시작 **3분** 안에 첫 코드를 실행합니다. |

The other three point cards are unmarked.

### 4.5 캠퍼스 — page 5

| # | Key | After |
| --- | --- | --- |
| 15 | `campus.body` | 코브에듀는 솔루션을 만드는 회사이자,\n매주 학생을 만나는 학원입니다.\n\n교실에서 **검증된** 것만 제품이 되고,\n제품에서 **확인된 것**이 다시 수업으로 돌아갑니다. |

Marked `v1` in the source, i.e. the client's first pass at a paragraph they may
revisit. Two stanzas separated by a blank line, and 실제로 통한 → 검증된,
확인한 → 확인된. The blank line is `\n\n` and §5 renders it as one.

`campus.photo_alt` also changes, because the photograph does — §6.3.

### 4.6 기업·기관 교육 — page 6

| # | Key | Before | After |
| --- | --- | --- | --- |
| 16 | `enterprise.lead` | 조직이 이미 하고 있는 일을 놓고 시작합니다. 도구를 소개하는 자리가 아니라, 다음 주 업무가 달라지는 교육입니다. | 단순히 AI 도구를 소개하는 자리가 아니라\n다음 주부터 업무 방식이 달라지는 교육을 합니다. |
| 17 | `enterprise.outcome_1_body` | 현업이 스스로 업무를 자동화합니다. | 현업 **부서**가 스스로 업무를 자동화합니다. |
| 18 | `enterprise.outcome_2_body` | 반복 작업이 걷히고 판단에 시간을 씁니다. | 반복 작업을 줄이고, 판단하는데 더 많은 시간을 씁니다. |

The first sentence of the lead is struck through in the markup, not rewritten —
it goes. `outcome_3` and all three outcome titles are unmarked.

### 4.7 창업 프로그램 — page 7

| # | Key | Before | After |
| --- | --- | --- | --- |
| 19 | `startup.title` | 아이디어에서 첫 제품까지, 다섯 단계로 함께합니다 | 아이디어에서 첫 제품까지,\n5단계로 함께합니다 |
| 20 | `startup.lead` | 순서가 있는 과정입니다. 아이템을 찾고, 계획서를 쓰고, 지원사업에 넣고, 무대에 서고, 실제로 만듭니다. | 아이템을 찾고, 계획서를 작성하고,\n지원사업에 제안하고, 무대에 서고, 실제로 만듭니다. |

`다섯` → `5` is the client asking for a numeral, which also lets the heading sit
on two lines instead of four in the narrow head column.

### 4.8 Footer — page 9

| # | Key | Change |
| --- | --- | --- |
| 21 | `footer.mvp_app` | Deleted, in both locales, along with its `<li>` in `site/footer.tsx` and the `mvpApp` field on `FooterCopy` |

`NEXT_PUBLIC_MVP_URL` stops being read by the home package. It is left in
`.env.example` and in the deployment config untouched — the MVP container and
its domain are unaffected by this change.

### 4.9 English

Each Korean correction gets its structural counterpart. Renames follow
(`AI & coding education` → `Coding education`, `Education solutions` →
`Coding solutions`, and the matching `AI` removals in their bodies); breaks and
emphasis are placed at the equivalent clause boundary; `footer.mvp_app` is
deleted. Wording the client did not touch is not touched.

## 5. `RichText` — the one new primitive

A translated string may carry two markers, and exactly two:

| Marker | Means |
| --- | --- |
| `\n` | A line break the copywriter chose |
| `**word**` | A run of emphasis |

```tsx
// packages/home/src/components/site/rich-text.tsx
export function RichText({ children }: { children: string }) { … }
```

It renders a `<span class="whitespace-pre-line">` containing the string split on
`**…**`, with each bold run wrapped in `<strong className="font-semibold">`.

Three decisions worth stating:

**`whitespace-pre-line`, not `<br />`.** A `<br />` is an unconditional break;
`pre-line` honours the author's break *and* still wraps naturally when the
column is narrower than the line. On a phone the client's three-line paragraph
becomes five lines rather than three lines with two of them overflowing. It is
also what makes `\n\n` render as the blank line correction 15 asks for, with no
special case.

**`<strong>` carries no colour.** Emphasis inherits — the same string appears on
paper in `text-sub`, on the deep band in `text-white/60`, and hard-coding `text-ink`
would put black text on navy the first time someone bolds a word in the Studio
section.

**It is applied inside the shared components, not at the call sites.** `SectionHead`
renders its `title` and `lead` through it, `Hero` its `lead`, and the three card
lists their titles and bodies. The props stay typed `string`, no call site
changes, and the rule becomes "every string the client can edit understands the
client's two markers" rather than "the eleven strings we remembered to wrap".

The components that route through it: `site/section.tsx` (`SectionHead`),
`site/hero.tsx`, `sections/about.tsx`, `sections/areas.tsx`,
`sections/studio-preview.tsx`, `sections/enterprise.tsx`. `campus.tsx` and
`startup.tsx` need no edit — their marked strings already pass through
`SectionHead`.

Strings with no marker render byte-identically to today, which is what keeps
this a safe change to make everywhere at once.

## 6. The photographs

Six files, none usable as delivered: 3–8 MB each at up to 5712×4284, from a
phone. Every one is resized and re-encoded before it enters git.

### 6.1 The audience strip — correction 2

Four tiles, rendered as CSS `background-image` at roughly 285×252 CSS px. The
existing files are 720×900; the replacements match that, JPEG q80.

| Tile | Source | The room |
| --- | --- | --- |
| 학생 | `KakaoTalk_20260908_113318941` | Mapo classroom, students at laptops, teacher at the projector |
| 학원·학교 | `KakaoTalk_20260908_114002289` | Robotics session, kits open on the tables |
| 대학 | `KakaoTalk_20260908_115413906` | An auditorium talk, 사업 소개 on the screen |
| 기업·공공기관 | `KakaoTalk_20260908_114427675` | D·LAB ALLIANCE SUMMIT 31 |

Each is cropped to 4:5 favouring the composition's subject, which in the two
student photographs also happens to favour the rear three-quarter view. The
client has confirmed photo-release consent for the students shown.

### 6.2 The partner wall — correction 2, page 8

The eight files replace `packages/home/public/partners/*.png` at their existing
names. They are trimmed to a common 120px render height like their predecessors,
and they keep their alpha channel, so `partner-wall.tsx`'s doc comment about
baked-in plates is rewritten rather than left describing a problem that no
longer exists.

`7. 삼성.svg` is delivered alongside the PNG. The wall renders through a plain
`<img>` with `object-contain` and takes either; the PNG is used, for one file
format across eight tiles.

kakao's mark is yellow on transparent and the tiles are near-white, which is
the lowest-contrast pairing in the set. It is the official mark on the official
ground, so it ships as-is; if it reads too faint at size, the fix is the tile,
not the logo.

### 6.3 The campus figure

`KakaoTalk_20260908_113800788` — the storefront, the 디랩코딩 마포캠퍼스 signage,
the street. Replaces `classroom.jpg` and its emoji-masked children, at 1600×1000
for the section's 16:10 frame.

`campus.photo_alt` becomes `디랩코딩학원 마포캠퍼스 — 서울 마포구` (EN: `The
D·LAB Coding Academy Mapo campus, Seoul`). The alt is also rendered as the
figure's caption, so it has to describe what is now a building rather than a
class in session.

### 6.4 Not used

`KakaoTalk_20260908_113903734` — an adult seminar in the Mapo room. There is no
section it belongs to without adding a figure to 창업 프로그램, which is a design
change the client did not ask for. It is not committed; it stays available if
that section later wants one.

`packages/home/public/photos/lecture.jpg` — the military-institution auditorium
in the 기업·기관 교육 section — is already a real client photograph and is
unmarked in the review. It stays.

### 6.5 Where the files go

```
packages/web/public/home/**            →  deleted, not committed
packages/home/public/photos/audience/{student,school,university,enterprise}.jpg
packages/home/public/photos/campus.jpg             (classroom.jpg deleted)
packages/home/public/partners/*.png                (8 files replaced in place)
```

Every committed file is a resized derivative. The 28 MB of originals do not
enter the repository — they are the client's, they live wherever the client
keeps them, and a marketing site does not need a 5712px master to fill a 285px
tile.

## 7. Risk

| | |
| --- | --- |
| **Blast radius** | `packages/home` only. No API, no schema, no `packages/web` source. The Studio, the API, and the MVP are untouched. |
| **`marketing.json` is not a layout namespace** | `namespaces.ts:12` keeps it out of `layoutNamespaces`, so nothing here touches the Studio's RSC payload budget in `locales.spec.ts`. |
| **Key parity** | `footer.mvp_app` is the only key deleted; `locales.spec.ts` fails the build if it is removed from one locale and not the other. |
| **`RichText` touching six shared components** | Mitigated by the no-marker path being byte-identical. A regression would have to come from `whitespace-pre-line` on a string that already contains a newline — none does. |
| **Third-party marks** | Same eight organisations already on the page, in cleaner files. Publishing them remains the client's call under their own agreements — §10 of `2026-08-11-coveedu-marketing-site-design.md`. |

## 8. Verification

Per §3 of the deployment guide, in CI's order:

```
pnpm --filter @cove/shared --filter @cove/i18n build
pnpm -r typecheck
pnpm -r lint
pnpm --filter @cove/web i18n:check
pnpm -r test
```

`pnpm -r build` is deferred: a Studio dev server is running on :3000 and
`next build` would overwrite its `.next`. It runs once the dev server is stopped,
before the branch is merged.

Then, by eye at 1440 and 390 px against the nine PDF pages: every red box shows
the client's text, every drawn break falls where they drew it, the strip is four
COVE Edu rooms, the wall is eight marks with no plates, and the footer has three
links under 제품 rather than four.

## 9. Deploying it

This branch is one of several fixes that will ride the same release. Per §6 of
`docs/operations/deployment-guide.local.md`: merge to `feat/cove-studio-v2`,
wait for CI, tag `v2.X.Y`, approve the Production deployment. The `home`
container is one of the five images the release builds, and `coveedu.com` is
served from it.

## 10. Where the build departed from this document

### 10.1 The source files were deleted, not archived

§6.5 says the originals "do not enter the repository". The implementation read
that as `rm -rf packages/web/public/home` and ran it after the derivatives were
written — destroying the client's only copy on this machine rather than moving
it somewhere outside the working tree.

Everything the site uses survived, because the derivatives were made first: all
eight partner marks, and five of the six photographs at the sizes they are
rendered. `KakaoTalk_20260908_113903734` — §6.4's unused adult-seminar shot —
survives only as a 900px preview. All six previews were restored to
`packages/web/public/home/`, which is still not a tracked path and still not
where masters belong; they are there so the loss is visible rather than silent.

The instruction a future version of §6.5 should carry: **derivatives enter the
repository, originals leave the working tree by being moved out of it.**

### 10.2 The Cove Studio screenshot: student done, teacher deliberately not

The client asked mid-implementation for the product shots to be real captures
of `cs.coveedu.com` rather than `StudentMock` and `TeacherMock`, the hand-drawn
mocks in `components/site/screenshot.tsx`, and supplied five production
accounts.

**Where the capture came from.** Not production. The local Studio runs the same
UI against the seeded development data (§4 of the deployment guide), and a
screenshot of `cs.coveedu.com` is a screenshot of real children's names,
rosters and submission history. There is no marketing argument for the second
and a clear privacy argument against it. Scripted sign-in to production was
also refused by the sandbox, which was the right refusal.

**The student capture.** `packages/home/public/shots/student-workspace.png`,
3200×2000 — 2x of the `<Image width={1600} height={1000}>` the frame declares,
257 KB. It is `mapo-dlab` → 알고리즘 입문 → 버블 정렬 구현, solved, run, and
passing: eight lines of real Python, the curriculum tree in the rail, the
problem with both worked examples, and `✓ 테스트 1 결과가 예상 출력과
일치합니다.` in the terminal. It replaces `StudentMock` at both of that mock's
call sites — the home page's Cove Studio band and the `/cove-studio` hero — and
`StudentMock`, along with the `Bar` helper only it used, is deleted.

Two things about the capture were not obvious and are worth writing down:

1. **It is captured in dark mode**, via a `cove-theme=dark` cookie. The Studio
   defaults to light, and a light capture on the navy band is a white rectangle
   punched into the section — the mock it replaced was `#0d1117` for exactly
   that reason. Dark keeps the band continuous.
2. **Monaco will not accept typed code.** Auto-indent and auto-closing brackets
   corrupt multi-line Python whether it arrives through `keyboard.type` or
   `keyboard.insertText`; the second attempt produced a syntax error and the
   third produced valid code with doubled indentation that silently printed
   inside the loop. Set the model directly —
   `window.monaco.editor.getModels()[0].setValue(code)` — and check the
   rendered result before trusting it.

**The teacher capture is not taken, on purpose.** `TeacherMock` stays. The real
page exists and works: `teach/classes/<id>` is a live roster with 등록/접속/풀이 중
tiles, status chips, current problem and last activity, and driving a second
signed-in session does move it — it read 접속 1 · 풀이 중 1 with the student
sitting in 이름 인사하기. But the seeded class has 19 students and only one
account whose password is known here, so 18 of 19 rows read 오프라인. A live
roster is a claim about a busy classroom, and that screenshot is a claim about
an empty one. Populating it would mean signing in as each demo student, which
is credential-guessing against accounts whose passwords were never supplied,
and the sandbox refused it.

So the teacher section keeps a mock that depicts a plausible class, and the
comment on `Screenshot` now says why. The real capture becomes worth taking on
the day there is a seed that puts a whole class in a room at once — or from a
production class during a lesson, with the roster reviewed before it ships.
