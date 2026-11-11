# Explanation material implementation plan

Approved spec: [design](../specs/2026-11-10-explanation-materials-design.md).

1. Add independent shared contracts, Prisma subtype and migration; preserve existing material contracts.
2. Implement authorization, atomic authoring and batched private image delivery. Reuse curriculum/access readers; prove statement counts with disposable PostgreSQL.
3. Build a Cove document authoring surface with title, rich editor, student preview, visibility and recoverable errors. Build a focused learner reading page with server-read data.
4. Integrate mixed navigation, course counts, copying/library import and monitoring without introducing assessment records.
5. Verify shared/API/web types, focused behavior tests, SQL counts and local browser UI; document actual results and limitations.

Visual direction: existing Cove canvas/card/ink/sub/brand tokens (brand blue #1B64DA, ink #16181D, muted #5A6270, white #FFFFFF, light canvas #F3F4F6), existing sans typography and monospace code. A centered reading sheet with a strong title and quiet lecture context is the signature. Author edit/preview tabs share the same sheet and keep save controls in a persistent footer. No extra display font or decorative hero competes with authored teaching content.
