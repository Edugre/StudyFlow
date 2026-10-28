# Scaffold validation

Validated on 2026-10-01 with Node 22.16.0 and npm 10.9.2.

- Dependency installation succeeded; `package-lock.json` records resolved versions.
- `npm run build` passed, including shared/frontend/server TypeScript checking,
  Vite production bundling, and compiled API output.
- `npm run lint` passed after replacing npm's flagged unsupported ESLint 9 with
  ESLint 10.
- `npm run format:check` passed.
- `npm test` passed both infrastructure tests: API health/absent course routes,
  and database persistence/reinitialization/constraints/foreign-key behavior.
- `npm start` launched the compiled API and frontend; direct `/courses` navigation
  rendered the course preparation page in the browser.
- `npm run dev` launched both processes; the homepage rendered in the browser and
  `http://127.0.0.1:5173/api/health` returned the expected health JSON through Vite.

Initial sandbox attempts blocked npm DNS access, test-runner IPC, and a localhost
curl request. Approved reruns succeeded. Node's built-in SQLite prints an
experimental warning on the tested Node version; it did not fail validation.
Temporary servers were stopped after verification.

These checks establish the scaffold only. No authentication, course story,
cross-account data access, or feature UI acceptance test is implemented yet.

## Authentication and CM-01 — 2026-10-02

Build/type checking, lint and formatting pass. Five tests pass, including the
new authentication/isolation flow, rate limiting, and version-1 migration with
account/session persistence. The updated sign-in page renders in the existing
local development browser. Starting an additional dev instance encountered
ports 5173/3001 already in use; the existing process was left untouched.
See `authentication.md` for feature coverage and remaining limits.

## CM-02 — 2026-10-02

Six tests pass, including course-code creation, code-only editing, preservation
of exact values, independent course codes, clearing/omitted values, invalid input,
account isolation, and persistence after database reopen. Build/type checking,
lint and formatting pass after fixing the edit handler's component scope.

## CM-03 — 2026-10-02

Seven tests pass; instructor edits persist across API/database restart, preserve
other fields/courses, and reject invalid input and other-account writes. Build,
type checking, lint and formatting pass. Team UI review remains pending.

## CM-04 — 2026-10-02

Eight tests pass including multiple meeting rows, invalid schedules preserving
saved values, other-account denial, clearing and API/database restart. Build,
type checking, lint and formatting pass.

## CM-05 — 2026-10-02

Nine tests pass, including semester creation/editing, filtered lists after moving
a course, empty filters, clearing, invalid labels/query parameters, account
isolation and API/database restart. Other course fields and meetings are
preserved. Build/type checking, lint and formatting pass. Team UI review remains
pending for CM-02–05.

## Vercel + Supabase migration — 2026-10-28

- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run build`
  pass.
- `npm test`: 2 offline tests pass (meeting and course-input validation). The 5
  Supabase integration tests were **skipped**: Docker Desktop failed to start on
  the development machine, so the local Supabase stack could not run.
- The migration was executed in PGlite (Postgres 17 in WASM) with stubbed
  `auth.users`, `auth.uid()` and the `anon`/`authenticated` roles. Checks passed
  for trimming, constraints, the 100-meeting limit, atomic failed writes, RLS
  isolation for select/update/delete/RPC, owner spoofing and transfer denial,
  anonymous denial, full update and cascade delete.
- Still to run with a working stack: `npm run db:test` (pgTAP), `npm test`
  (integration), and a browser pass of sign-up/sign-in and course flows.

### Hosted project — 2026-10-28

- `supabase db push` applied `20261028000000_courses` to project
  `jzruyssywoevtrjoumkr`; it is recorded in the migration history.
- Verified catalog state: RLS on both tables, two owner policies,
  `authenticated` has only SELECT on `id`/`owner_id`, `anon` has no table or
  RPC privileges.
- Ran the RLS, constraint, atomicity, owner-transfer, anonymous-access and
  cascade checks as two simulated students inside a rolled-back block; all
  passed and no rows remained.
- Supabase security advisor: no findings. Performance advisor: only
  "unused index" notices, expected on an empty database.
- Integration tests now skip unless `VITE_SUPABASE_URL` is a local stack, so
  `npm test` never creates accounts in the hosted project.
