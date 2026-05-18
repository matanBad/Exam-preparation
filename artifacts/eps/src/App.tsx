import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getAuthToken, clearAuth, getAuthUser } from "@/lib/auth";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Register from "@/pages/register";
import Unauthorized from "@/pages/unauthorized";
import Dashboard from "@/pages/dashboard";
import CoursesList from "@/pages/courses/list";
import CourseDetail from "@/pages/courses/detail";
import ExamsList from "@/pages/exams/list";
import ExamNew from "@/pages/exams/new";
import ExamTake from "@/pages/exams/take";
import ExamResult from "@/pages/exams/result";
import ExamReview from "@/pages/exams/review";
import QuestionsList from "@/pages/questions/list";
import QuestionNew from "@/pages/questions/new";
import QuestionEdit from "@/pages/questions/edit";
import AdminUsers from "@/pages/admin/users";
import AdminDeletionRequests from "@/pages/admin/deletion-requests";
import Account from "@/pages/account";

import { AuthLayout } from "@/components/layout";

setAuthTokenGetter(() => getAuthToken());

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: any) => {
      if (error?.status === 401) {
        clearAuth();
        window.location.href = "/login";
      }
    },
  }),
});

function ProtectedRoute({ component: Component, allowedRoles, ...rest }: any) {
  const [, setLocation] = useLocation();
  const token = getAuthToken();
  const user = getAuthUser();
  const allowed = !allowedRoles || (user && allowedRoles.includes(user.role));

  useEffect(() => {
    if (!token || !user) {
      setLocation("/login");
    } else if (!allowed) {
      setLocation("/unauthorized");
    }
  }, [token, user, allowed, setLocation]);

  if (!token || !user || !allowed) return null;

  return (
    <AuthLayout>
      <Component {...rest} />
    </AuthLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/unauthorized" component={Unauthorized} />
      
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>

      <Route path="/courses">
        <ProtectedRoute component={CoursesList} />
      </Route>
      <Route path="/courses/:id">
        {(params) => <ProtectedRoute component={CourseDetail} params={params} />}
      </Route>

      <Route path="/exams">
        <ProtectedRoute component={ExamsList} allowedRoles={['student']} />
      </Route>
      <Route path="/exams/new">
        <ProtectedRoute component={ExamNew} allowedRoles={['student']} />
      </Route>
      <Route path="/exams/:id/take">
        {(params) => <ProtectedRoute component={ExamTake} params={params} allowedRoles={['student']} />}
      </Route>
      <Route path="/exams/:id/result">
        {(params) => <ProtectedRoute component={ExamResult} params={params} allowedRoles={['student']} />}
      </Route>
      <Route path="/exams/:id/review">
        {(params) => <ProtectedRoute component={ExamReview} params={params} allowedRoles={['student']} />}
      </Route>

      <Route path="/lecturer/questions">
        <ProtectedRoute component={QuestionsList} allowedRoles={['lecturer', 'admin']} />
      </Route>
      <Route path="/lecturer/questions/new">
        <ProtectedRoute component={QuestionNew} allowedRoles={['lecturer', 'admin']} />
      </Route>
      <Route path="/lecturer/questions/:id/edit">
        {(params) => <ProtectedRoute component={QuestionEdit} params={params} allowedRoles={['lecturer', 'admin']} />}
      </Route>

      <Route path="/account">
        <ProtectedRoute component={Account} />
      </Route>

      <Route path="/admin/users">
        <ProtectedRoute component={AdminUsers} allowedRoles={['admin']} />
      </Route>
      <Route path="/admin/deletion-requests">
        <ProtectedRoute component={AdminDeletionRequests} allowedRoles={['admin']} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
