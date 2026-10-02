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
