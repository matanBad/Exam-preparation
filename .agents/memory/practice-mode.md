---
name: Practice Mode (Sprint 3 Module 1)
description: Durable rules for the EPS practice/targeted-learning feature — grading, feedback reveal, access control.
---

# Practice Mode invariants

- **Points are RAW difficulty weights** (Easy=1, Medium=2, Hard=3), NOT scaled to 100 like mock exams. `totalMaxScore` = sum of per-question weights.
- **Multi-select = proportional partial credit, no negative.** Selecting some-but-not-all correct options earns a fraction (e.g. 1 of 3 correct → 0.33 of the weight). Grading lives in `lib/grading.ts`.
- **Empty submission must be rejected (400)**, never recorded as answered. Recording an empty answer would leak correct answers + explanation and pollute persisted analytics with phantom answered=incorrect rows.

  **Why:** answers/explanations are only revealed for questions whose status is `answered`; marking a no-selection submit as answered defeats that gate.

  **How to apply:** in the answer route, after normalizing `selectedAnswerOptionIds`/`selectedAnswerOptionId`, bail with 400 if the effective list is empty.
- **Denormalized session totals** (`answeredCount`, `correctCount`, `earnedScore`) are recomputed from the question rows after every answer/finish, so re-answering a question stays consistent. Don't increment in place.
- **Access control (Strategy A, same as exams):** student-only; course must be offered in the student's program AND have an active enrollment; only `status='approved'` questions; students see only their OWN sessions (enforce `session.userId === req.auth.userId` on every read/write).
- **Finish is idempotent** — completes the session if active, always returns the current summary. The summary page calls it on mount safely.
- Practice data is persisted for FUTURE weak-area/recommendation engines; those engines are intentionally NOT built (dashboard/practice pages show a disabled "Weak areas — available after more practice data" placeholder — do not fake analytics).
