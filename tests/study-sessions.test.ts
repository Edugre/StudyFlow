import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bySchedule, type StudySession } from '../src/shared/study-session.js';
import {
  createStudySession,
  findStudySession,
  listStudySessions,
} from '../src/web/features/study-sessions/session-api.js';
import { account, stack } from './support/supabase.js';

const session = (
  id: string,
  date: string,
  startTime: string,
): StudySession => ({
  id,
  courseId: null,
  date,
  startTime,
  durationMinutes: 60,
});

test('SP-01: the schedule lists sessions earliest first', () => {
  const sessions = [
    session('next week', '2026-11-09', '08:00'),
    session('tonight', '2026-11-02', '18:00'),
    session('this morning', '2026-11-02', '09:00'),
    session('also tonight', '2026-11-02', '18:00'),
  ];
  assert.deepEqual(
    bySchedule(sessions).map((s) => s.id),
    ['this morning', 'tonight', 'also tonight', 'next week'],
  );
});

test(
  'SP-01: a saved session appears once in the schedule',
  { skip: stack },
  async () => {
    const student = await account();
    const saved = await createStudySession(student, {
      date: '2026-11-12',
      startTime: '18:30',
      durationMinutes: 90,
    });
    assert.deepEqual(saved, {
      id: saved.id,
      courseId: null,
      date: '2026-11-12',
      startTime: '18:30',
      durationMinutes: 90,
    });
    const schedule = await listStudySessions(student);
    assert.deepEqual(schedule, [saved]);
    assert.deepEqual(await findStudySession(student, saved.id), saved);
  },
);

test(
  'SP-01: invalid scheduling information creates no session',
  { skip: stack },
  async () => {
    const student = await account();
    for (const invalid of [
      { startTime: '18:00', durationMinutes: 60 },
      { date: '2026-11-12', durationMinutes: 60 },
      { date: '2026-11-12', startTime: '18:00' },
      { date: '2026-11-12', startTime: '18:00', durationMinutes: 0 },
      { date: '2026-11-12', startTime: '18:00', durationMinutes: NaN },
    ])
      await assert.rejects(
        createStudySession(student, invalid),
        /valid date/,
        JSON.stringify(invalid),
      );
    assert.deepEqual(await listStudySessions(student), []);
  },
);

test(
  'SP-01: another student cannot see the session',
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const saved = await createStudySession(owner, {
      date: '2026-11-12',
      startTime: '18:00',
      durationMinutes: 60,
    });
    assert.equal(await findStudySession(other, saved.id), null);
    assert.deepEqual(await listStudySessions(other), []);
  },
);
