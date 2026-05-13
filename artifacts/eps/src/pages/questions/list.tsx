import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuestions,
  useListCourses,
  useArchiveQuestion,
  getListQuestionsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "_all";

export default function QuestionsList() {
  const [courseId, setCourseId] = useState<string>(ALL);
  const [difficulty, setDifficulty] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [q, setQ] = useState("");

  const params = {
    ...(courseId !== ALL ? { courseId: parseInt(courseId, 10) } : {}),
    ...(difficulty !== ALL
      ? { difficulty: difficulty as "Easy" | "Medium" | "Hard" }
      : {}),
    ...(status !== ALL
      ? { status: status as "draft" | "approved" | "archived" }
      : {}),
    ...(q ? { q } : {}),
  };

  const { data: courses } = useListCourses();
  const { data: questions, isLoading } = useListQuestions(params);
  const archive = useArchiveQuestion();
  const queryClient = useQueryClient();

  const handleArchive = (id: number) => {
    archive.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListQuestionsQueryKey(params),
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Question Bank</h1>
          <p className="text-muted-foreground mt-1">
            Manage all approved, draft, and archived questions
          </p>
        </div>
        <Link href="/lecturer/questions/new">
          <Button data-testid="btn-new-question">New Question</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            placeholder="Search title or text..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="input-search-questions"
          />
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger data-testid="select-filter-course">
              <SelectValue placeholder="Course" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All courses</SelectItem>
              {courses?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.courseCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger data-testid="select-filter-difficulty">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All difficulties</SelectItem>
              <SelectItem value="Easy">Easy</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading && <p>Loading...</p>}

      <div className="space-y-3">
        {questions?.map((q) => (
          <Card key={q.id} data-testid={`card-question-${q.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{q.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {q.courseName ?? `Course ${q.courseId}`}
                    {q.topicName ? ` · ${q.topicName}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Badge variant="outline">{q.difficultyLevel}</Badge>
                  <Badge
                    variant={
                      q.status === "approved"
                        ? "default"
                        : q.status === "archived"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {q.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                {q.questionText}
              </p>
              <div className="flex gap-2">
                <Link href={`/lecturer/questions/${q.id}/edit`}>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`btn-edit-${q.id}`}
                  >
                    Edit
                  </Button>
                </Link>
                {q.status !== "archived" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleArchive(q.id)}
                    disabled={archive.isPending}
                    data-testid={`btn-archive-${q.id}`}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && questions?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No questions match these filters.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
