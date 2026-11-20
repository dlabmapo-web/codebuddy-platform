# QA-003 — Explanation-only material (keep GIFs moving)

> **Status: fixed in v2.0.59.** Verify on production and close.

Registered 2026-11-04 · Jay · P1

## Request

"New material" offered only coding-practice types. Teachers turned GIF lessons into PDFs, and a GIF inside a PDF does not move. QA asked for a material that is only an explanation, with GIFs kept.

## What exists now

- **Explanation** material type: `3c5424fb` *feat: add explanation-only lecture materials* and `80841ea0` *author explanations on a dedicated page with code examples* (2026-11-10), shipped in v2.0.59.
- The "New material" dialog on localhost lists **Explanation — "Teach a topic with text, images, and examples"** next to Coding practice, PDF + coding practice, PDF document, Turtle, Multiple choice, Short answer and Video lesson.
- Picture upload from the author's computer was fixed in v2.0.53 (`f4d2ed1d`). GIFs are stored as GIFs (GIF over 5 MiB is refused with a message, not redrawn), so they keep animating.
- Elice's equivalent is the **Text Editor** material type.

## Remaining actions

1. On production, create an Explanation with a GIF, open it as a student, and check that the GIF moves.
2. Tell QA it is fixed.
