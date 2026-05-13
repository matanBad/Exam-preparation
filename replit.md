# Exam Preparation System (EPS) — Team 4

A full-stack exam preparation web app for students, lecturers, and admins. Students can take auto-generated mock exams from approved question banks; lecturers manage courses, topics, and questions; admins manage users and view system metrics.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/eps run dev` — run the React frontend
- `pnpm --filter @workspace/scripts run seed` — reset DB and load demo data
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Demo accounts (password: `123456`)

- `student@eps.com` — enrolled in CS101 + DB201
- `lecturer@eps.com`
- `admin@eps.com`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind + wouter + TanStack Query
- API: Express 5, JWT bearer auth (bcrypt password hashing)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Where things live

- DB schema: `lib/db/src/schema.ts`
- OpenAPI spec: `lib/api-spec/openapi.yaml` → generated zod (`lib/api-zod`) and react hooks (`lib/api-client-react`)
- API routes: `artifacts/api-server/src/routes/{auth,courses,questions,exams,users,admin}.ts`
- Auth helpers: `artifacts/api-server/src/lib/auth.ts`, `middlewares/auth.ts`
- Frontend pages: `artifacts/eps/src/pages/{login,dashboard,exams,questions,courses,admin}.tsx`
- Frontend auth + token wiring: `artifacts/eps/src/App.tsx`, `src/lib/auth.ts`
- Seed script: `scripts/src/seed.ts`

## Architecture decisions

- **Bearer JWT in localStorage** (`eps_token`, `eps_user`); `setAuthTokenGetter` injects the token into every generated react-query hook so pages don't pass it manually.
- **Server is the source of truth for authorization.** Students can only see questions/courses/topics for courses they're enrolled in (`enrollmentsTable` filter), and only `status='approved'` questions. Frontend role guards are convenience only.
- **Exam generation snapshots** the question + randomized option order into `mock_exam_questions` so grading is stable even if the question bank later changes.
- **TanStack Query 401 handler** in `App.tsx` clears auth and redirects to `/login` on any unauthorized response.

## Product

- US-01..US-29 covering auth, course/topic management, question CRUD with approval workflow, mock exam generation/taking/grading/review, user admin, and admin dashboard metrics.

## User preferences

_None recorded yet._

## Gotchas

- After editing the OpenAPI spec, run `pnpm --filter @workspace/api-spec run codegen` before typechecking.
- The seed script TRUNCATEs all domain tables with `RESTART IDENTITY CASCADE` — don't run it against any DB you care about.
- Do not call service ports directly; always go through the proxy at `localhost:80`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
