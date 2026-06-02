// Shared grading utilities for Practice Mode (Sprint 3).
//
// Practice scoring is intentionally simpler than mock exams: each question is
// worth its raw difficulty weight (Easy = 1, Medium = 2, Hard = 3 points), not
// scaled so the session totals 100. Multi-select questions use proportional
// partial credit and never deduct points for wrong selections.

export const PRACTICE_DIFFICULTY_POINTS: Record<
  "Easy" | "Medium" | "Hard",
  number
> = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
};

export function pointsForDifficulty(d: string | null | undefined): number {
  if (d === "Easy" || d === "Medium" || d === "Hard") {
    return PRACTICE_DIFFICULTY_POINTS[d];
  }
  return PRACTICE_DIFFICULTY_POINTS.Medium;
}

export function parseOptionIds(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface GradeInput {
  /** All answer-option ids that belong to the question. */
  optionIds: number[];
  /** The subset of option ids that are correct. */
  correctIds: number[];
  /** The option ids the student submitted. */
  submittedIds: number[];
  /** Max points the question is worth. */
  maxScore: number;
}

export interface GradeResult {
  /** Submitted ids restricted to valid options, deduped. */
  validSubmitted: number[];
  /** Points earned (0..maxScore), rounded to 2 dp. */
  earnedScore: number;
  /**
   * True only if the student selected every correct option and no incorrect
   * ones. A fully-correct answer earns the full maxScore.
   */
  fullyCorrect: boolean;
  totalCorrect: number;
  correctSelected: number;
  incorrectSelected: number;
}

/**
 * Grade a single multiple/single-choice answer with proportional partial
 * credit. Mirrors the mock-exam grading rule: each correctly selected option
 * earns a share of maxScore, incorrect selections do not deduct, and only a
 * complete-and-clean selection counts as fully correct.
 */
export function gradeAnswer({
  optionIds,
  correctIds,
  submittedIds,
  maxScore,
}: GradeInput): GradeResult {
  const optionSet = new Set(optionIds);
  const correctSet = new Set(correctIds);
  const validSubmitted = Array.from(
    new Set(submittedIds.filter((id) => optionSet.has(id))),
  );
  const correctSelected = validSubmitted.filter((id) =>
    correctSet.has(id),
  ).length;
  const incorrectSelected = validSubmitted.length - correctSelected;
  const totalCorrect = correctSet.size;

  const rawEarned =
    totalCorrect > 0 ? (correctSelected / totalCorrect) * maxScore : 0;
  const earnedScore = Math.min(
    maxScore,
    Math.max(0, Math.round(rawEarned * 100) / 100),
  );
  const fullyCorrect =
    totalCorrect > 0 &&
    correctSelected === totalCorrect &&
    incorrectSelected === 0;

  return {
    validSubmitted,
    earnedScore,
    fullyCorrect,
    totalCorrect,
    correctSelected,
    incorrectSelected,
  };
}
