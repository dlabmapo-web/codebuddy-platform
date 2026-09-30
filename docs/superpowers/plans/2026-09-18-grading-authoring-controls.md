# Grading authoring controls implementation

1. Add reusable choice and number controls using the existing Radix menus and theme tokens. Separate number parsing and stepping for precision tests.
2. Integrate problem and answer settings; add English/Korean descriptions, units, and validation text. Use shared schema validation to block saving invalid input.
3. Test numeric precision, bounds, clearing, and schema rejection; run web typecheck, targeted tests, lint and translation checks. Inspect the live manager UI when available.
4. Document actual results and limitations. Do not deploy or build over the running development server.
