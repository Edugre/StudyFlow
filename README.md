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

## Architecture and scaffold status

One TypeScript application: React/Vite frontend, Express API, SQLite persistence.
This provides simple feature boundaries and one dependency installation for the
six-person team. See [architecture decision](docs/architecture.md) for rationale,
provisional choices and limitations.

| Path                   | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `src/web`              | App shell, routing and styles; course UI boundary in `features/courses`         |
| `src/server`           | API startup and health route; course repository interface in `features/courses` |
| `src/server/db`        | Transactional version-1 database initialization                                 |
| `src/shared/course.ts` | Course and meeting types shared across UI/API                                   |
| `tests`                | API and persistence scaffold checks                                             |
| `docs`                 | Architecture, task dependencies and team questions                              |

The app has `/` and `/courses`, plus `/api/health`. Students can register,
sign in/out, add a named course with optional code, instructor and semester, filter saved courses by semester, reopen one, and edit its code, instructor, semester or meeting schedule. Records
are private to the signed-in student and persist in SQLite. This implements
CM-01's minimal list/reopen behavior and CM-02–05's individual fields. The current-semester view and full course details remain CM-08/09 work. General editing and deletion are not implemented.

See [authentication and CM-01](docs/authentication.md) for API details, security
choices, migration behavior and limits.

## Local development

Use Node **22.16 or later** and npm. With nvm, `nvm install && nvm use` selects
the tested version. From the repository root:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The API listens on http://127.0.0.1:3001; Vite proxies
`/api` there. Stop both processes with Ctrl+C. Dependencies are locked in
`package-lock.json`. Node 22 prints an experimental warning for built-in SQLite.

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
npm start
```

After building, `npm start` serves the compiled API and frontend together at
http://127.0.0.1:3001, including direct navigation to `/courses`. This is a local
production smoke setup; hosting and production authentication are still open.
`npm run format` applies Prettier. Feature tests should live beside other tests
in `tests/*.test.ts`; the current checks cover scaffolding only.

## Environment

No environment variables or secrets are required for this scaffold. Optionally
copy `.env.example` to `.env`; Node loads it for API dev/start commands.

| Variable        | Default                   | Purpose                                  |
| --------------- | ------------------------- | ---------------------------------------- |
| `HOST`          | `127.0.0.1`               | API bind address                         |
| `PORT`          | `3001`                    | API port                                 |
| `DATABASE_PATH` | `./data/studyflow.sqlite` | SQLite file, relative to repository root |

The Vite proxy currently targets port 3001; update `vite.config.ts` if changing
the API address. Local database files, `.env`, build output and dependencies are
ignored. Never put secrets in frontend code. Set `NODE_ENV=production` when serving over HTTPS to enable Secure session cookies.
Local HTTP development leaves this unset.

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

Before feature implementation, discuss the scaffold stack, auth design review,
CM-10 scheduling, semester representation, timezone handling and course deletion
with linked records. This session assumes SQLite for local development and text
semester identifiers; those choices remain subject to team review.
