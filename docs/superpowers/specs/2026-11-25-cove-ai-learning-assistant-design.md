# Cove AI learning assistant

**Implementation proposal · November 25, 2026.** Start here for the student experience. Developers can then follow the [data and model design](2026-11-25-cove-ai-learning-assistant-data.md), [implementation order](../plans/2026-11-25-cove-ai-learning-assistant.md) and [pilot checks](../../qa/2026-11-25-cove-ai-learning-assistant.md).

## From publishing a problem to helping the next student

| Step | What happens on “Print Hello” |
| --- | --- |
| 1. The teacher publishes | The teacher writes “Print the word `Hello`”, sets the expected public output to `Hello`, and switches on AI feedback. Both banks can start empty. |
| 2. A student gets stuck | They select **Get a hint**. Cove gives one small step, such as “Look carefully at the first letter in the example.” If they ask again, Cove can give a more specific hint. |
| 3. The student submits | They write `print("hello")`. The existing grader marks the public case wrong. Cove saves the failed attempt even if the student closes the page immediately. |
| 4. They ask for an explanation | **Explain my result** says “You printed `hello`. The example starts with an uppercase `H`. Compare the first letters, then run your code again.” Cove can make this comparison directly from the two public outputs. |
| 5. They try again | They submit `print('Hello')` and pass. Cove links this next attempt to the earlier one. Both quote styles are valid. A later pass is a useful observation, but it cannot tell us by itself whether a hint caused the improvement. |
| 6. Another student has the same problem | Cove recognizes the same verified difference and reuses the note in that student's language. It can do this even if the first student never opened their explanation. A teacher can correct a misleading note once for future students. |

The **hint bank** answers “What could I try next?” It contains general hints for the problem and more specific hints that need evidence from this student's work. The **feedback library** answers “What happened in my attempt, and what can I check?” A student who writes `print(Hello)` may have used an undefined name. That calls for a different explanation. Only describe an undefined name when the student's code and available public evidence support it.

## What Cove keeps

Every completed, eligible failed student submission gets its own private record. Keep the observed failures even when there are several in one submission, no student requests help, the model is offline, or Cove cannot yet explain the cause. Save each delivered hint or explanation and its source so the team can reconstruct what that student saw. Multiple students can have separate records pointing to the same reusable note. A student's name, private code, and raw output have no place in another student's note.

The first release covers **enabled, automatically graded programming exercises outside exams**, starting with a Python pilot. A mistake means an observed failed submission, including logic, output, syntax, runtime or resource failures as the evidence permits. A passing alternative strategy is a success. Edits a student never runs have no observed outcome. Public sample runs are a separate later step because their results currently expire and some execute in the browser. The implementation plan specifies how to add them without changing grades or attempt counts.

## How the assistant learns

For a new student, Cove looks up what helped explain the same exercise and the same observable mistake. It gives the model the current student's permitted evidence when a new explanation is needed. This is retrieval-augmented generation (RAG). Exact problem and evidence matching in PostgreSQL is sufficient to start. An unknown failure remains available for later analysis. A common failure alone does not prove a particular cause.

Teachers can publish, teach and grade without maintaining either bank. The system can add supported notes automatically. Teachers can optionally edit or retire a note when they spot a problem. The grader owns scores and completion throughout.

**Fine-tuning is a separate future decision.** Launch with retrieval and measure the explanations first. If later evaluations reveal a recurring teaching or language problem, use vetted, de-identified examples with permission for that use, split training and evaluation by student and exercise, and compare a candidate model against the current assistant. Recording a student's attempt does not automatically authorize sending it to a provider or including it in a training export.
