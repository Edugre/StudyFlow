# Authentication and CM-01

Implemented 2026-10-02 following authorization to implement authentication and
CM-01. Google Drive and Trello were synchronized on 2026-10-02: CM-01 and SYS-01 are in Review. This is the team's initial local
implementation choice, not a newly documented team decision in Drive.

Students register with an email and password, sign in/out, create a course with
its name, and reopen their saved courses. Name whitespace is trimmed; blank names
are rejected. Each submission creates one record; intentionally repeated
submissions can create separate courses because duplicate-course policy is open.
The submit button is disabled while saving. Course codes, instructors, meetings,
semesters, editing, deletion and cross-feature links remain separate stories.

## API

All POSTs require JSON and `X-StudyFlow-Request: 1`. No cross-origin access is
enabled. The custom header and strict same-site cookies prevent cross-site form
submissions from changing state. Frontend and API share an origin (or Vite proxy).

| Endpoint                  | Behavior                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| POST `/api/auth/register` | Normalize email, hash password, create account and session         |
| POST `/api/auth/login`    | Verify password, rotate session                                    |
| GET `/api/auth/me`        | Current user or null                                               |
| POST `/api/auth/logout`   | Revoke session and clear cookie                                    |
| GET `/api/courses`        | All courses owned by authenticated student; no semester filter yet |
| POST `/api/courses`       | Save validated name under session identity                         |
| GET `/api/courses/:id`    | Reopen owned course; other accounts receive 404                    |

Passwords use Node asynchronous scrypt with random salts (N=32768, r=8, p=3).
Session tokens contain 32 random bytes; only SHA-256 token digests are stored in
SQLite. Cookies are HttpOnly and SameSite=Strict, expire after seven days, and
use Secure when `NODE_ENV=production`. Logout revokes the stored session.
All course queries scope by trusted session identity; submitted owner IDs are
ignored. Queries use parameters. Auth responses and course responses disable
caching. Login and registration are limited to 30 attempts per IP per 15 minutes
in a single process; restart resets that limiter. Proxy deployment requires a
review of client-IP handling and distributed rate limiting.

Practical initial limits: passwords 12–128 characters, emails at most 254, course
names at most 200. These are implementation choices to review with the team.
Email verification, password reset, MFA, account deletion, and an external auth
provider are not implemented. HTTPS is required for deployment. No secrets or
sample credentials are committed.

## Persistence and migrations

Startup upgrades schema version 1 to 2 transactionally, adding users/sessions
and a trigger requiring new courses to reference an existing user. Existing
course/meeting data is preserved; legacy owner IDs are not reassigned. Future
course editing must preserve ownership and scope writes. Do not replace a
student's identity with a client-supplied field.

## Validation

`npm test` covers valid/invalid registration, duplicate normalized emails,
incorrect passwords, cookie attributes, missing session denial, cross-site
request protection, blank course rejection, single creation, list/reopening,
owner spoofing, other-account denial, logout and expired sessions. Existing
persistence tests cover reopening the SQLite file and preserving saved courses.
Build/type checking, lint and formatting are run for this change. The sign-in
interface was verified in the browser; account/course flows are covered by API
integration tests rather than automated browser interaction.

References: [Node crypto](https://nodejs.org/api/crypto.html) and
[OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Tracking

- [CM-01](https://trello.com/c/bUUOIhsS/1-cm-01-add-a-course): implementation ready for team Review.
- [SYS-01](https://trello.com/c/iDS4ur3t/51-sys-01-student-authentication-and-account-isolation): authentication prerequisite added and ready for Review.
- Google Doc Overview now records implementation status, account storage, validation and remaining decisions.
