import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateQuestion,
  getListQuestionsQueryKey,
} from "@workspace/api-client-react";
import { QuestionForm } from "./form";

export default function QuestionNew() {
  const [, setLocation] = useLocation();
  const create = useCreateQuestion();
  const queryClient = useQueryClient();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">New Question</h1>
      <QuestionForm
        submitting={create.isPending}
        submitLabel="Create question"
        onCancel={() => setLocation("/lecturer/questions")}
        onSubmit={(values) =>
          create.mutate(
            { data: values },
            {
              onSuccess: () => {
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
