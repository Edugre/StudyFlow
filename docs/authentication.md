# Authentication and course management

Implemented 2026-10-02 following authorization to implement authentication and
CM-01. Google Drive and Trello were synchronized on 2026-10-02: CM-01 and SYS-01 are in Review. This is the team's initial local
implementation choice, not a newly documented team decision in Drive.

Students register with an email and password, sign in/out, create a course with
its name, and reopen their saved courses. Name whitespace is trimmed; blank names
are rejected. Each submission creates one record; intentionally repeated
submissions can create separate courses because duplicate-course policy is open.
The submit button is disabled while saving. Course codes, instructors, meetings,
semesters, editing, deletion and cross-feature links remain separate stories.

## Supabase Auth and data contract (since 2026-10-28)

Authentication uses Supabase Auth email/password (`signUp`,
`signInWithPassword`, `signOut`). Passwords must be 12–128 characters
(enforced in the form and by the project's minimum length setting). Emails are
trimmed and lowercased before submission. Error messages stay generic
("Email or password is incorrect.", "Unable to create account with these
details."). Production requires email confirmation; after sign-up the UI asks
the student to confirm, then sign in. Supabase Auth handles password hashing,
session refresh and rate limiting.

Course data is accessed only through `src/web/features/courses/course-api.ts`:

| Function            | Database operation                                     |
| ------------------- | ------------------------------------------------------ |
| `listCourses`       | `select` on `courses` (+ meetings), optional semester  |
| `findCourse`        | `select` one course; missing/other-owner/bad id → null |
| `createCourse`      | RPC `create_course` (course + meetings, atomic)        |
| `updateCourseField` | `update` code, instructor or semester only             |
| `replaceMeetings`   | RPC `replace_course_meetings` (atomic, ≤100 rows)      |
| `updateCourse`      | RPC `update_course` (CM-06, all fields + meetings)     |
| `deleteCourse`      | `delete`; meetings cascade                             |

Security properties (verified by pgTAP and integration tests):

- RLS on `courses` and `course_meetings` limits every operation to
  `auth.uid()`'s rows; other students' courses behave as not found.
- `anon` has no table or function privileges.
- `owner_id` defaults to `auth.uid()` and has no insert/update privilege for
  clients, so ownership cannot be spoofed or transferred.
- Names are trimmed (1–200 chars); blank semesters become null (≤100 chars);
  codes and instructors are stored exactly; meetings are weekday + `time`
  with end after start.

Behavior differences from the Express version: the custom
`X-StudyFlow-Request` header is gone (requests carry a bearer token, not a
cookie, so cross-site form posts cannot act as the student); sessions are kept
in `localStorage` (see [architecture](architecture.md) for the XSS trade-off);
and the CM-06 "Edit course information" form no longer clears code, instructor
and semester when saving name/location/notes.

## History: Express + SQLite implementation (2026-10-02)

The original implementation used scrypt password hashes, SQLite sessions and
an HttpOnly cookie behind an Express API. It was removed in the Supabase
migration; see git history before branch `supabase-vercel-migration`. The
per-story notes below describe product behavior, which is unchanged; references
to POST routes and SQLite describe the old transport.

## Tracking

- [CM-01](https://trello.com/c/bUUOIhsS/1-cm-01-add-a-course): implementation ready for team Review.
- [SYS-01](https://trello.com/c/iDS4ur3t/51-sys-01-student-authentication-and-account-isolation): authentication prerequisite added and ready for Review.
- Google Doc Overview now records implementation status, account storage, validation and remaining decisions.

## CM-02 — Course code

Implemented course-code entry during creation and code-only editing after reopening.
The existing SQLite `code` column stores the exact string without trimming or
case conversion. No course-code uniqueness rule is imposed. Codes are optional;
legacy and omitted codes remain null, and clearing a code saves an empty string.
Non-text values are rejected. General course editing remains CM-06 work.

POST `/api/courses` accepts optional `code`; POST `/api/courses/:id/code` updates
only that owned course's code. List and reopen responses include the saved code.
The detail view offers Save code and Cancel; cancel resets the unsaved input.
No database migration or dependencies are needed. Tests verify exact strings,
independent courses, edits, clearing, invalid input, cross-account write denial,
and persistence after closing/reopening the database.

## CM-03 — Instructor

Instructor entry during creation and instructor-only editing with Save/Cancel
are implemented. POST `/api/courses/:id/instructor` updates only that owned
course's instructor. Optional/cleared text is supported; non-text values are
rejected. Tests verify persistence across API/database restart, unrelated-field
and other-course preservation, invalid input and cross-account write denial.
General editing remains CM-06. CM-02 and CM-03 are ready for team Review.

## CM-04 — Course meetings

Students can add/remove weekday and start/end-time entries in the selected
course's meeting editor, save the whole schedule, or cancel unsaved edits. Every
saved meeting is displayed after reopening. Empty schedules are supported.
POST `/api/courses` accepts optional `meetings`; POST
`/api/courses/:id/meetings` replaces an owned course's schedule transactionally.
Invalid updates preserve all saved meetings; invalid creation adds no course.

Times use local HH:MM and must end later on the same day, matching the documented
criterion. Timezones and overnight meetings are not inferred. The initial limit
is 100 meeting rows per course for bounded requests. No overlap or deduplication
rule is invented. Existing schema supports this without migration. All detail
and update responses retain meetings so editing other fields preserves schedule
display. Eight tests pass, including multiple days, invalid days/times, equal or
earlier end times, atomic rejection, account isolation and restart persistence.
Build/type checking, lint and formatting pass. Team UI review is pending.

## CM-05 — Semester assignment and filtering

Students can assign an optional semester during creation, edit or clear it with
Save/Cancel, and filter saved courses by semester. Saved labels are suggested in
the editor. POST `/api/courses/:id/semester` changes only the owned course's
semester; GET `/api/courses?semester=Fall%202026` filters within that account.
Semester labels are trimmed, limited to 100 characters, and stored as null when
blank. Non-text values and repeated semester query parameters are rejected.

The team has not defined a term vocabulary or current-semester rule, so labels
are student-entered and no current semester is inferred. CM-08 instead lets
each student choose their current semester (see below).
Existing schema supports semester storage without migration. Tests cover
creation, moving courses between semesters, filtering, clearing, account
isolation, preservation of other fields and restart persistence. CM-01–05 and
SYS-01 are ready for Review; team UI review remains pending.

## Current semester (CM-08)

`student_settings` holds one row per student (`owner_id` defaults to
`auth.uid()` and is not writable), with an optional `current_semester` label
that is trimmed and stored as null when blank, like course semesters.
`setCurrentSemester` upserts it and `getCurrentSemester` returns null when
none is chosen. The course list opens filtered to the current semester, shows
"No courses in your current semester." when it is empty, and keeps "All
semesters" available. Nothing is inferred from dates.
