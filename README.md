# StudyFlow

StudyFlow is a CEN4010 student productivity project for organizing courses,
assignments/exams, study sessions, reminders, academic goals, and progress in one
place. Student accounts and private, persistent academic records are in scope.
LMS integration, AI study plans, student messaging, and file sharing are outside
the initial scope.

## Sources of truth

- [Google Drive project document](https://docs.google.com/document/d/1Tx3lBkLjGSYN-VnvPeMMfVFc1V822272vlOOV-8J23U/edit): requirements, scope, acceptance criteria, design and team decisions.
- [StudyFlow — CEN4010 Trello board](https://trello.com/b/YVbkRD7D/studyflow-cen4010): implementation tasks, dependencies, priorities and status.

Both were read on 2026-10-01; implementation status was synchronized on 2026-10-02. Treat the local plan as a snapshot;
check these sources before feature work. No team-approved stack was found.

## Architecture

A React/Vite single-page app hosted on **Vercel**, talking directly to
**Supabase** (Postgres + Auth) through `@supabase/supabase-js`. There is no
custom API server: row level security (RLS) in Postgres enforces that students
only ever see and change their own records. See
[architecture decision](docs/architecture.md) for rationale and trade-offs.

| Path                                     | Purpose                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `src/web`                                | App shell, routing, styles; course UI in `features/courses`         |
| `src/web/lib/supabase.ts`                | Supabase client (publishable key only)                              |
| `src/web/features/courses/course-api.ts` | Course data access: validation, RPC calls, row mapping              |
| `src/shared`                             | Course types and meeting validation shared by UI and tests          |
| `supabase/migrations`                    | Schema, RLS policies and RPC functions (source of truth for the DB) |
| `supabase/tests`                         | pgTAP tests for constraints, RLS and privileges                     |
| `tests`                                  | Node tests: offline validation + integration against local Supabase |
| `docs`                                   | Architecture, authentication, task dependencies                     |

The app has `/` and `/courses`. Students can register, sign in/out, add a named
course with optional code, instructor, semester and meetings, filter by
semester, reopen to view full details (CM-09), edit (CM-02–06) and delete
(CM-07) courses, and choose a current semester that the course list opens
on (CM-08).

See [authentication and course management](docs/authentication.md) for auth,
security choices and the database contract.

## Local development

Requires Node **22.16+**, npm and the
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
(for migrations). Docker is only needed for the optional local Supabase stack.

```sh
npm ci
cp .env.example .env.local  # fill in the project URL and publishable key
npm run dev                 # http://127.0.0.1:5173
```

By default `.env.local` points at the hosted Supabase project. To work against
a disposable local database instead (requires Docker), run `npm run db:start`
and use the URL and key from `npx supabase status`.

Local auth does not require email confirmation; confirmation emails (if
enabled) are viewable in Mailpit at http://127.0.0.1:54324.

```sh
npm run typecheck
npm run lint
npm test             # integration tests: run only against a local stack, never the hosted project
npm run db:test      # pgTAP tests (supabase test db)
npm run db:reset     # rebuild the local DB from migrations
npm run format:check
npm run build        # outputs dist/
```

### Database changes

Never edit an applied migration. Create a new one with
`npx supabase migration new <name>`, apply locally with `npm run db:reset`, add
pgTAP coverage for any new table's RLS, and regenerate types if you add them
(`npx supabase gen types typescript --local`). Every new table must enable RLS
with owner-scoped policies.

## Environment

| Variable                        | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase project API URL                    |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key; safe in the browser |

`VITE_` variables are embedded in the built JavaScript. Never put the
service-role key or any other secret in them. `.env.local` is gitignored.

## Deployment (Vercel + Supabase)

One Supabase project (`jzruyssywoevtrjoumkr`) serves both Vercel Production and
Preview deployments and local development. There is no separate staging
database, so anything created while developing locally is real data in that
project. One-time setup:

1. In the Supabase dashboard: Authentication → Sign In / Providers → Email:
   minimum password length 12, **Confirm email** on. Authentication → URL
   Configuration: Site URL = the Vercel production domain; add
   `http://127.0.0.1:5173` and the Vercel preview pattern
   (`https://*-<team>.vercel.app/**`) to the redirect URLs.
2. Apply migrations: `supabase link --project-ref jzruyssywoevtrjoumkr` then
   `supabase db push` (no Docker needed).
3. Import the GitHub repo into Vercel (framework preset: Vite; `vercel.json`
   sets build/output and the SPA rewrite). Set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` for all environments.
4. After each migration, check Supabase Advisors (security + performance).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, pgTAP and integration
tests against a local Supabase stack, then builds.

## Current implementation plan

CM-01–CM-05 and [SYS-01 authentication](https://trello.com/c/iDS4ur3t/51-sys-01-student-authentication-and-account-isolation) are in **Review**. Trello's **This Week** list now contains CM-06–CM-10. The course task map is:

| Code  | Task                               | Trello dependencies                                           |
| ----- | ---------------------------------- | ------------------------------------------------------------- |
| CM-01 | Add course                         | None listed; authenticated ownership is a system prerequisite |
| CM-02 | Course code                        | CM-01                                                         |
| CM-03 | Instructor                         | CM-01                                                         |
| CM-04 | Meeting days/times                 | CM-01                                                         |
| CM-05 | Semester                           | CM-01                                                         |
| CM-06 | Edit course                        | CM-01                                                         |
| CM-07 | Delete course                      | CM-01                                                         |
| CM-08 | Current courses                    | CM-01, CM-05                                                  |
| CM-09 | Course details                     | CM-01                                                         |
| CM-10 | Course-linked assignments/sessions | CM-01, AT-01, SP-01                                           |

Suggested order: resolve authentication/ownership and course design choices;
CM-01; independent field cards CM-02–05; CM-09 and CM-08 after their dependencies;
CM-06/07; CM-10 after assignment/session creation. Preserve separate card reviews.
AT/SP/RN/GP stories remain in Product Backlog; Done remains empty.

See [implementation map and handoff](docs/implementation-plan.md) for card links,
all dependencies, future module mapping, acceptance-test guidance, and gaps.
The Google Doc's five-sprint plan is proposed, not a dated delivery commitment.

Before feature implementation, discuss CM-10 scheduling, semester
representation, timezone handling and course deletion with linked records.
Semesters remain free-text labels pending team review.
