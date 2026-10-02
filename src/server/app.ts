import express from 'express';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  currentUser,
  hashPassword,
  verifyPassword,
  startSession,
  clearSession,
  sessionToken,
  digest,
  randomUUID,
} from './features/auth/auth.js';
import { validMeetings, meetingError } from './features/courses/meetings.js';
import { courseStore } from './features/courses/store.js';

export function createApp(db: DatabaseSync, webDirectory?: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'studyflow' });
  });
  app.use('/api', (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      (!request.is('application/json') ||
        request.get('X-StudyFlow-Request') !== '1')
    ) {
      response.status(403).json({ error: 'Invalid request' });
      return;
    }
    next();
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use('/api/auth', (request, response, next) => {
    if (
      request.method !== 'POST' ||
      !['/login', '/register'].includes(request.path)
    ) {
      next();
      return;
    }
    const now = Date.now();
    for (const [key, entry] of attempts)
      if (entry.until <= now) attempts.delete(key);
    const key = request.ip ?? 'unknown';
    const entry = attempts.get(key) ?? {
      count: 0,
      until: now + 15 * 60 * 1000,
    };
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > 30) {
      response
        .status(429)
        .json({ error: 'Too many attempts. Try again in 15 minutes.' });
      return;
    }
    next();
  });
  app.get('/api/auth/me', (request, response) =>
    response.json({ user: currentUser(db, request) ?? null }),
  );
  for (const action of ['register', 'login']) {
    app.post(`/api/auth/${action}`, async (request, response) => {
      const { email, password } = request.body ?? {};
      if (
        typeof email !== 'string' ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' ||
        password.length < 12 ||
        password.length > 128
      ) {
        response.status(400).json({
          error: 'Enter a valid email and a password of 12–128 characters.',
        });
        return;
      }
      const normalized = email.trim().toLowerCase();
      let user = db
        .prepare('SELECT * FROM users WHERE email = ?')
        .get(normalized) as
        { id: string; email: string; password_hash: string } | undefined;
      if (action === 'register') {
        const hash = await hashPassword(password);
        const id = randomUUID();
        const result = db
          .prepare(
            'INSERT INTO users VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING',
          )
          .run(id, normalized, hash);
        if (!result.changes) {
          response
            .status(409)
            .json({ error: 'Unable to create account with these details.' });
          return;
        }
        user = { id, email: normalized, password_hash: hash };
      } else {
        const valid = await verifyPassword(
          password,
          user?.password_hash ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`,
        );
        if (!user || !valid) {
          response
            .status(401)
            .json({ error: 'Email or password is incorrect.' });
          return;
        }
      }
      startSession(db, request, response, user.id);
      response
        .status(action === 'register' ? 201 : 200)
        .json({ user: { id: user.id, email: user.email } });
    });
  }
  app.post('/api/auth/logout', (request, response) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(
      digest(sessionToken(request)),
    );
    clearSession(response);
    response.json({ user: null });
  });
  const courses = courseStore(db);
  app.use('/api/courses', (request, response, next) => {
    const user = currentUser(db, request);
    if (!user) {
      response.status(401).json({ error: 'Sign in to access courses.' });
      return;
    }
    response.locals.userId = user.id;
    next();
  });
  app.get('/api/courses', (request, response) => {
    const semester = request.query.semester;
    if (semester !== undefined && typeof semester !== 'string') {
      response.status(400).json({ error: 'Semester filter must be text.' });
      return;
    }
    response.json({ courses: courses.list(response.locals.userId, semester) });
  });
  app.get('/api/courses/:id', (request, response) => {
    const course = courses.find(
      response.locals.userId,
      String(request.params.id),
    );
    if (!course) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }
    response.json({ course });
  });
  app.post('/api/courses', (request, response) => {
    const {
      name,
      code,
      instructor,
      meetings = [],
      semester,
    } = request.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.length > 200) {
      response
        .status(400)
        .json({ error: 'Enter a course name of 1–200 characters.' });
      return;
    }
    if (code !== undefined && code !== null && typeof code !== 'string') {
      response.status(400).json({ error: 'Course code must be text.' });
      return;
    }
    if (
      instructor !== undefined &&
      instructor !== null &&
      typeof instructor !== 'string'
    ) {
      response.status(400).json({ error: 'Instructor must be text.' });
      return;
    }
    if (
      semester !== undefined &&
      semester !== null &&
      (typeof semester !== 'string' || semester.length > 100)
    ) {
      response
        .status(400)
        .json({ error: 'Semester must be text of at most 100 characters.' });
      return;
    }
    if (!validMeetings(meetings)) {
      response.status(400).json({ error: meetingError });
      return;
    }
    response.status(201).json({
      course: courses.create(
        response.locals.userId,
        name.trim(),
        code ?? null,
        instructor ?? null,
        meetings,
        typeof semester === 'string' ? semester.trim() || null : null,
      ),
    });
  });
  app.post('/api/courses/:id/code', (request, response) => {
    const { code } = request.body ?? {};
    if (code !== null && typeof code !== 'string') {
      response.status(400).json({ error: 'Course code must be text.' });
      return;
    }
    const course = courses.updateCode(
      response.locals.userId,
      String(request.params.id),
      code,
    );
    if (!course) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }
    response.json({ course });
  });
  app.post('/api/courses/:id/instructor', (request, response) => {
    const { instructor } = request.body ?? {};
    if (instructor !== null && typeof instructor !== 'string') {
      response.status(400).json({ error: 'Instructor must be text.' });
      return;
    }
    const course = courses.updateInstructor(
      response.locals.userId,
      String(request.params.id),
      instructor,
    );
    if (!course) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }
    response.json({ course });
  });
  app.post('/api/courses/:id/meetings', (request, response) => {
    const { meetings } = request.body ?? {};
    if (!validMeetings(meetings)) {
      response.status(400).json({ error: meetingError });
      return;
    }
    const course = courses.updateMeetings(
      response.locals.userId,
      String(request.params.id),
      meetings,
    );
    if (!course) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }
    response.json({ course });
  });
  app.post('/api/courses/:id/semester', (request, response) => {
    const { semester } = request.body ?? {};
    if (
      semester !== null &&
      (typeof semester !== 'string' || semester.length > 100)
    ) {
      response
        .status(400)
        .json({ error: 'Semester must be text of at most 100 characters.' });
      return;
    }
    const course = courses.updateSemester(
      response.locals.userId,
      String(request.params.id),
      typeof semester === 'string' ? semester.trim() || null : null,
    );
    if (!course) {
      response.status(404).json({ error: 'Course not found' });
      return;
    }
    response.json({ course });
  });
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found' });
  });
  if (webDirectory) {
    app.use(express.static(webDirectory));
    app.get(['/', '/courses'], (_request, response) => {
      response.sendFile(resolve(webDirectory, 'index.html'));
    });
  }
  app.use((_request, response) => {
    response.status(404).send('Not found');
  });
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      const status = error instanceof SyntaxError ? 400 : 500;
      response
        .status(status)
        .json({ error: status === 400 ? 'Invalid JSON' : 'Request failed' });
    },
  );
  return app;
}
