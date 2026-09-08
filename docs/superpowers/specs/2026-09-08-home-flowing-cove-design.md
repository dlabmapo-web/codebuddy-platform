# Flowing Cove home design

Approved in conversation on 2026-09-08. Implemented in `packages/home`.

## Direction

Use the Cove logo wave as the hero signature. Keep real photography and the
approved Korean and English copy. Retain the existing navigation and section
order. Pair Pretendard body and Korean display text with the existing Space
Grotesk utility type.

Palette: Studio blue #1B64DA, deep blue #0749AB, teal #58D5C3,
coral #F56B61, yellow #FAC517, and white #FFFFFF. Use darker teal for
text and button gradients; reserve the brighter hues for decorative surfaces.

## Implementation

- Expand the existing SVG wave behind the hero with slow transform animation.
- Give the headline more horizontal space and a blue-to-dark-teal second line.
- Use taller rounded photo panels, staggered vertically on desktop and aligned
  in two columns on mobile, retaining the existing photo hover treatment.
- Give the Studio section a blue gradient, orbital outline, and lit screenshot.
- Strengthen cool, warm, and teal section backgrounds and button contrast.
- Keep scroll-reveal content visible before JavaScript enhancement. Only hide
  below-fold elements after the observer is ready. Honor reduced motion.

## Verification

Run home typecheck, lint, and production build. Inspect desktop and mobile
rendering in the browser, check horizontal overflow and mobile navigation,
and verify that the Studio preview remains readable.

## Follow-up: cards, navigation, and motion

The user requested a stronger card style and more animation across the
marketing pages. Both `/` and `/cove-studio` now share rounded, hue-tinted
cards with hover and keyboard focus treatment. Business cards are real links
to the campus, product, and enterprise sections. Startup steps have separate
panels; student and teacher features use a responsive two-column grid.

The Studio header links to its own students, teachers, flow, and details
sections. Its hero has a moving wave and translucent screenshot frame.
Mobile menus animate on entry and scroll within the available viewport.
A CSS scroll timeline draws reading progress where supported. Reduced-motion
preferences disable the added ambient and entrance animations.

Validation: home typecheck, lint, and production build pass. Browser checks
covered product section navigation, business-card navigation, desktop card
rendering, and both pages at 390px without horizontal overflow.

## Reference refinement: Crabit

Reference reviewed: https://www.crabit.co.kr/ on 2026-09-08. Adapted its
centered introductions, large product stage, and image-led feature cards.
Cove keeps its own palette, translations, photos, logos, and product content;
no reference-site text or assets were imported.

Studio's product hero now centers the existing headline and actions above
a full-width screenshot stage. The home Studio preview uses a rounded inset
blue panel and larger screenshot. Business cards lead with the existing
classroom, workspace, and enterprise imagery. Business and partner headings
use the optional centered SectionHead layout. Media hover motion respects
reduced-motion settings.

Validation: typecheck, lint, production build, desktop product hero inspection,
and 390px mobile checks for both routes passed. Translation and public asset
files have no changes.
