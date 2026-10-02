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
