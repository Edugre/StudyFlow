# Architecture decision history

# Vercel + Supabase

Recorded 2026-10-28. Status: implemented on branch `supabase-vercel-migration`,
pending team review.

The SQLite file and long-running Express server could not be hosted on Vercel
(ephemeral filesystem, serverless functions). The app is now a static Vite SPA
on Vercel that uses `supabase-js` directly against Supabase Postgres and Auth.

- **No API server.** Ownership is enforced in Postgres by row level security
  (`owner_id = auth.uid()`), not by hand-written `WHERE owner_id = ?` clauses.
  `owner_id` defaults to `auth.uid()` and is not insertable or updatable by
  clients (column privileges), so it cannot be spoofed.
- **Validation in two layers.** `course-api.ts` validates for friendly
  messages; CHECK constraints and RPC functions are the actual enforcement.
- **Multi-row writes are RPCs.** `create_course`, `update_course` and
  `replace_course_meetings` are `security invoker` plpgsql functions, so they
  run under the caller's RLS and are atomic.
- **Rejected alternative:** Express as a Vercel Function over Supabase
  Postgres. It would duplicate auth, need connection pooling, and keep
  ownership checks in application SQL that RLS already provides.
- **Trade-off:** `supabase-js` stores the session in `localStorage`, not an
  HttpOnly cookie, so XSS could steal a session. Keep rendering through React
  (no `dangerouslySetInnerHTML`) and consider a CSP. `@supabase/ssr` with cookie
  storage is the escape hatch if this becomes unacceptable.
- **Environments:** a single Supabase project serves production, Vercel
  previews and local development; a staging database is not warranted for a
  course project. CI uses a throwaway local stack via the Supabase CLI.
- **Data:** the old SQLite data was local-only and its scrypt hashes cannot be
  imported into Supabase Auth; nothing was migrated.
- **Future work:** reminders (RN) can use `pg_cron` + Edge Functions or Vercel
  Cron; new feature tables follow the same RLS pattern; CM-10 needs an explicit
  `on delete` policy for links to courses.

# Current semester is student-chosen (CM-08)

Recorded 2026-10-29. Status: implemented, pending team review.

Semesters remain free-text labels, so the app cannot infer the current one
from today's date. Each student picks their current semester from their own
labels; it is stored in `student_settings` under the same RLS pattern.
Rejected: parsing "Term YYYY" labels by month (forces a label format) and
semester start/end dates (a larger schema change the team has not asked for).

# Previous: authentication on Express + SQLite (2026-10-02)

Superseded by the decision above; see git history for `src/server`.

# Initial architecture decision

Recorded 2026-10-01. Status: scaffold choice, pending team review.

The repository contained only `README.md` and one initial commit. All nine tabs
of the StudyFlow Google Doc and all 50 open Trello cards were inspected. Neither
source specifies a language, framework, database, or deployment platform.

Use one npm project with React and TypeScript (Vite) in `src/web`, an Express
API in `src/server`, shared course contracts in `src/shared`, and SQLite for
local persistence. This keeps one language across a six-person team, separates
UI from data access, and avoids an external database service during setup.
Node's built-in SQLite avoids a separate native dependency. Node 22.16+ is
required; SQLite emits an experimental warning on Node 22.

Only the application shell, health endpoint, database initializer, course
contracts, and owner-scoped repository interface exist. No course CRUD,
authentication, notifications, assignments, sessions, or dashboard is implemented.
Future API handlers call a feature service, which calls the course repository;
add the service and repository adapter when CM-01 needs them, rather than empty
classes now. The frontend must never import server modules.

The database baseline stores courses and meeting rows. Nonblank course names
and valid time ranges reflect CM-01 and CM-04. Optional fields remain nullable.
Text semester identifiers and weekday/HH:MM meetings are provisional storage
choices, not approved product rules. `owner_id` is required, but there is no user
table or fake account. Authentication must supply trusted identity before any
academic data endpoint is exposed. Every repository operation requires owner ID;
its future SQL implementation must scope every query by owner, including deletes.
Never accept owner identity from a submitted course or URL parameter.

Course meeting rows cascade when their course is deleted. No deletion policy for
assignments, study sessions, or goals has been selected. Those tables are deferred
until the team defines the cross-feature behavior. Schema version 1 is applied
transactionally at startup; future changes need numbered migrations, not edits to
an already applied version.

Vite proxies `/api` in development. Express serves the built frontend for local
production smoke checks. The API binds to loopback by default. Hosting, auth
provider, session management, backups, timezone behavior, and SQLite suitability
for the eventual hosting environment remain team decisions.

References: [Vite guide](https://vite.dev/guide/),
[Express installation](https://expressjs.com/en/starter/installing/),
[Node SQLite](https://nodejs.org/api/sqlite.html).
