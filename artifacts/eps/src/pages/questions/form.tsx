import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useListCourses,
  useListCourseTopics,
  getListCourseTopicsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

export type QuestionFormValues = {
  courseId: number;
  topicId: number | null;
  title: string;
  questionText: string;
  questionType: "single_choice" | "multiple_choice";
  difficultyLevel: "Easy" | "Medium" | "Hard";
  explanationText: string | null;
  sourceReference: string | null;
  status: "draft" | "approved" | "archived";
  options: { answerText: string; isCorrect: boolean }[];
};

const empty: QuestionFormValues = {
  courseId: 0,
  topicId: null,
  title: "",
  questionText: "",
  questionType: "single_choice",
  difficultyLevel: "Medium",
  explanationText: null,
  sourceReference: null,
  status: "approved",
  options: [
    { answerText: "", isCorrect: true },
    { answerText: "", isCorrect: false },
    { answerText: "", isCorrect: false },
    { answerText: "", isCorrect: false },
  ],
};

const NONE = "_none";

export function QuestionForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: Partial<QuestionFormValues>;
  submitting: boolean;
  onSubmit: (values: QuestionFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [, setLocation] = useLocation();
  const [values, setValues] = useState<QuestionFormValues>({
    ...empty,
    ...initial,
    options: initial?.options?.length ? initial.options : empty.options,
  });
  const [error, setError] = useState<string | null>(null);
  const { data: courses } = useListCourses();
  const { data: topics } = useListCourseTopics(values.courseId, {
    query: { enabled: !!values.courseId, queryKey: getListCourseTopicsQueryKey(values.courseId) },
  });

  useEffect(() => {
    if (initial?.courseId) {
      setValues((v) => ({ ...v, ...initial, options: v.options }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.courseId]);

  const setOpt = (idx: number, patch: Partial<{ answerText: string; isCorrect: boolean }>) => {
    setValues((v) => ({
      ...v,
      options: v.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    }));
  };

  const setSingleCorrect = (idx: number) => {
    setValues((v) => ({
      ...v,
      options: v.options.map((o, i) => ({ ...o, isCorrect: i === idx })),
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.courseId) {
      setError("Please choose a course");
      return;
    }
    if (!values.title.trim() || !values.questionText.trim()) {
      setError("Title and question text are required");
      return;
    }
    const filledOpts = values.options.filter((o) => o.answerText.trim());
    if (filledOpts.length < 2) {
      setError("At least two options are required");
      return;
    }
    if (!filledOpts.some((o) => o.isCorrect)) {
      setError("Mark at least one option as correct");
      return;
    }
    onSubmit({ ...values, options: filledOpts });
    void setLocation;
  };

  return (
    <form onSubmit={submit} className="space-y-6 max-w-3xl" data-testid="form-question">
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Course</Label>
              <Select
                value={values.courseId ? values.courseId.toString() : ""}
                onValueChange={(v) =>
                  setValues((s) => ({ ...s, courseId: parseInt(v, 10), topicId: null }))
                }
              >
                <SelectTrigger data-testid="select-q-course">
                  <SelectValue placeholder="Choose a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.courseCode} — {c.courseName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Topic (optional)</Label>
              <Select
                value={values.topicId ? values.topicId.toString() : NONE}
                onValueChange={(v) =>
                  setValues((s) => ({
                    ...s,
                    topicId: v === NONE ? null : parseInt(v, 10),
                  }))
                }
              >
                <SelectTrigger data-testid="select-q-topic">
                  <SelectValue placeholder="No topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No topic</SelectItem>
                  {topics?.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.topicName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={values.title}
              onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
              data-testid="input-q-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qtext">Question text</Label>
            <Textarea
              id="qtext"
              rows={4}
              value={values.questionText}
              onChange={(e) =>
                setValues((s) => ({ ...s, questionText: e.target.value }))
              }
              data-testid="input-q-text"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={values.questionType}
                onValueChange={(v) =>
                  setValues((s) => ({
                    ...s,
                    questionType: v as "single_choice" | "multiple_choice",
                  }))
                }
              >
                <SelectTrigger data-testid="select-q-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single_choice">Single choice</SelectItem>
                  <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select
                value={values.difficultyLevel}
                onValueChange={(v) =>
                  setValues((s) => ({
                    ...s,
                    difficultyLevel: v as "Easy" | "Medium" | "Hard",
                  }))
                }
              >
                <SelectTrigger data-testid="select-q-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={values.status}
                onValueChange={(v) =>
                  setValues((s) => ({
                    ...s,
                    status: v as "draft" | "approved" | "archived",
                  }))
                }
              >
                <SelectTrigger data-testid="select-q-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Options</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mark the correct answer(s). Empty rows are ignored.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {values.options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-3">
              {values.questionType === "single_choice" ? (
                <input
                  type="radio"
                  name="correct"
                  checked={opt.isCorrect}
                  onChange={() => setSingleCorrect(idx)}
                  className="h-4 w-4"
                  data-testid={`radio-correct-${idx}`}
                />
              ) : (
                <Checkbox
                  checked={opt.isCorrect}
                  onCheckedChange={(v) => setOpt(idx, { isCorrect: v === true })}
                  data-testid={`checkbox-correct-${idx}`}
                />
              )}
              <Input
                value={opt.answerText}
                onChange={(e) => setOpt(idx, { answerText: e.target.value })}
                placeholder={`Option ${idx + 1}`}
                data-testid={`input-option-${idx}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setValues((s) => ({
                    ...s,
                    options: s.options.filter((_, i) => i !== idx),
                  }))
                }
                data-testid={`btn-remove-option-${idx}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setValues((s) => ({
                ...s,
                options: [...s.options, { answerText: "", isCorrect: false }],
              }))
            }
            data-testid="btn-add-option"
          >
            <Plus className="w-4 h-4 mr-1" /> Add option
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="explain">Explanation (shown in review)</Label>
            <Textarea
              id="explain"
              rows={3}
              value={values.explanationText ?? ""}
              onChange={(e) =>
                setValues((s) => ({ ...s, explanationText: e.target.value || null }))
              }
              data-testid="input-q-explanation"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="src">Source reference</Label>
            <Input
              id="src"
              value={values.sourceReference ?? ""}
              onChange={(e) =>
                setValues((s) => ({ ...s, sourceReference: e.target.value || null }))
              }
              data-testid="input-q-source"
            />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          data-testid="btn-cancel-question"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} data-testid="btn-submit-question">
          {submitting ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
