# Implementation plan

1. Implement standard script execution and genuine successful SystemExit handling; update resource fixtures and add adversarial regressions.
2. Separate execution-budget exhaustion from infrastructure deadlines in the shared evaluator, official grading and samples; update lifecycle tests.
3. Remove literal comparisons from regex workers, warm and synchronously invoke the Python comparator, and bound dispatch separately.
4. Fail closed on invalid initial memory measurements; add regressions and run an isolated Linux sandbox smoke.
5. Run scoped tests/typechecks and update the comparison report with results and remaining deployment limitations.
