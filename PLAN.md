# Implementation Plan — UI restructure + features

Trigger: user said "תתחיל לעדכן שינויים". Implementing all agreed changes.

## Decisions (confirmed)
- Student course "Most failed questions" = **student-scoped** (questions the student personally failed).
- Student course "Milestones" = **course-scoped** (add `courseId` to `student_milestones`); global milestones (streak) stay only on dashboard.
- Recommendation lifecycle: "Practice now" only navigates (prefilled) and does NOT change status. A recommendation auto-completes when the student practices that topic/subtopic **twice with ≥80%**. "Dismiss" = manual give-up (delete).

## Page structures
- **Student dashboard:** Weak Areas / Recommendations / Milestones / Streak · Current courses / Topic performance · Recent exams / Unfinished exams / Recent practice / Unfinished practice
- **Course — student:** Avg Score Exam / Avg Score Practice / Readiness / Milestones · Topics / Topic performance / Progress over time / Most failed questions · Recent exams / Unfinished exams / Recent practice / Unfinished practice
- **Course — lecturer:** Students / Class average / Questions bank / Problematic questions · Topics / Topic performance / Most failed questions · Students in this course / Content gaps
- **Practice Mode:** New practice session / Practice in progress / Completed practice

## Task checklist

### Self-contained (no codegen)
- [x] H. AbortError fix — `custom-fetch.ts` + `main.tsx` global swallow
- [x] G1. Reusable `PasswordInput` (eye toggle)
- [x] G2. Account: fix swapped email labels (show new email as text) + eye toggles
- [x] G3. Login + Register: password eye toggle
- [x] F1. Recommendations: replace ✓/✗ with single Dismiss button; Practice now → navigate prefilled
- [x] F2. Weak Areas: Practice now → navigate prefilled
- [x] F3. Practice index: read courseId/topicId/subtopicId from URL → prefill
- [x] B. Student dashboard restructure (+ Recent practice panel)

> Checkpoint: entire self-contained batch (H, G1-3, F1-3, B) typechecks clean.

### Schema + backend + codegen
- [x] S1. Schema: `questions.questionImageUrl`, `questions.explanationImageUrl`
- [x] S2. Schema: `student_milestones.courseId`
- [x] S3. `db push` (applied via push-force; verified no data loss)
- [x] BE1. Student per-course analytics endpoint (avg exam, avg practice, readiness, topic perf, progress trend, most-failed-questions student-scoped, course milestones). Recent/unfinished exams+practice filtered client-side.
- [x] BE2. Lecturer course analytics: add questionBankCount
- [x] BE3. Recommendation auto-complete rule (2× ≥80% practice) in analytics.ts
- [x] BE4. Milestone courseId population — new course-scoped milestones in engagement.ts (checkCourseMilestones)
- [x] BE5. Question create/update accept + validate image data URLs
- [x] SPEC. openapi.yaml updated + codegen run (NOTE: node_modules orval is 8.17 but lockfile pins 8.5.3 — regen done via `pnpm dlx orval@8.5.3`; the plain `codegen` script breaks until node_modules is pinned to 8.5.3)

### Frontend depending on backend
- [x] C. Course detail — student analytics rows (typecheck green)
- [x] D. Course detail — lecturer restructure (Questions bank tile + row order)
- [x] E. Practice index — In progress + Completed practice sections
- [x] Q. Question form — image upload (body + explanation) + display in exam take/review + practice session

### Verify
- [x] typecheck passes (full monorepo, green)
- [x] Adversarial multi-agent review of the diff (5 dimensions, findings verified)
- [ ] manual smoke (run app)

### Adversarial review findings — all fixed
1. [medium] analytics.ts mastery rule: a subtopic-only practice session wrongly credited its parent topic, auto-completing the topic-level rec. Fixed: subtopic sessions credit only the subtopic; topic-level sessions credit the topic.
2. [low] analytics.ts: subtopic recs now also clear when the parent topic is mastered via topic-level practice.
3. [medium] engagement.ts: global `milestonesCount`/`getMilestones` were inflated by the new per-course milestone rows. Fixed: scoped to `courseId IS NULL` (course rows surface only on the course page).
4. [low] account.tsx: "New email" field was prefilled with the current email. Fixed: starts empty with a placeholder.
