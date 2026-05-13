import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetQuestion,
  useUpdateQuestion,
  getGetQuestionQueryKey,
  getListQuestionsQueryKey,
} from "@workspace/api-client-react";
import { QuestionForm } from "./form";

export default function QuestionEdit({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { data: question, isLoading } = useGetQuestion(id);
  const update = useUpdateQuestion();
  const queryClient = useQueryClient();

  if (isLoading || !question) return <p>Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Edit Question</h1>
      <QuestionForm
        submitting={update.isPending}
        submitLabel="Save changes"
        onCancel={() => setLocation("/lecturer/questions")}
        initial={{
          courseId: question.courseId,
          topicId: question.topicId ?? null,
          title: question.title,
          questionText: question.questionText,
          questionType: question.questionType,
          difficultyLevel: question.difficultyLevel,
          explanationText: question.explanationText ?? null,
          sourceReference: question.sourceReference ?? null,
          status: question.status,
          options: question.options.map((o) => ({
            answerText: o.answerText,
            isCorrect: o.isCorrect,
          })),
        }}
        onSubmit={(values) =>
          update.mutate(
            { id, data: values },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({
                  queryKey: getGetQuestionQueryKey(id),
                });
                queryClient.invalidateQueries({
                  queryKey: getListQuestionsQueryKey(),
                });
                setLocation("/lecturer/questions");
              },
            },
          )
        }
      />
    </div>
  );
}
