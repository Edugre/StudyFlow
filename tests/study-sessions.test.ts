import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bySchedule,
  durationText,
  plannedMinutes,
  type StudySession,
} from '../src/shared/study-session.js';
import { createCourse } from '../src/web/features/courses/course-api.js';
import {
  createStudySession,
  findStudySession,
  listStudySessions,
  setStudySessionCourse,
  setStudySessionDuration,
  setStudySessionObjective,
  setStudySessionSchedule,
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
  objective: null,
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
      objective: null,
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

const slot = { date: '2026-11-12', startTime: '18:00', durationMinutes: 60 };

test(
  'SP-02: a session keeps its course after reopening',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const saved = await createStudySession(student, {
      ...slot,
      courseId: math.id,
    });
    assert.equal(saved.courseId, math.id);
    assert.equal(
      (await findStudySession(student, saved.id))?.courseId,
      math.id,
    );
  },
);

test(
  'SP-02: reassigning a session updates it without a duplicate',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const physics = await createCourse(student, { name: 'Physics' });
    const saved = await createStudySession(student, {
      ...slot,
      courseId: math.id,
    });

    const moved = await setStudySessionCourse(student, saved.id, physics.id);
    assert.deepEqual(moved, { ...saved, courseId: physics.id });
    assert.deepEqual(await listStudySessions(student), [moved]);
    assert.deepEqual(await findStudySession(student, saved.id), moved);

    // Choosing "No course" unlinks it, still without a duplicate.
    await setStudySessionCourse(student, saved.id, '');
    assert.deepEqual(await listStudySessions(student), [
      { ...saved, courseId: null },
    ]);
  },
);

test(
  "SP-02: a session cannot be moved to another student's course",
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const math = await createCourse(owner, { name: 'Math' });
    const theirs = await createCourse(other, { name: 'History' });
    const saved = await createStudySession(owner, {
      ...slot,
      courseId: math.id,
    });

    await assert.rejects(
      setStudySessionCourse(owner, saved.id, theirs.id),
      /Course not found/,
    );
    await assert.rejects(
      setStudySessionCourse(other, saved.id, theirs.id),
      /Study session not found/,
    );
    assert.equal((await findStudySession(owner, saved.id))?.courseId, math.id);
  },
);

test(
  'SP-04: a rescheduled session appears only at its new time',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const early = await createStudySession(student, {
      date: '2026-11-12',
      startTime: '08:00',
      durationMinutes: 45,
    });
    const moving = await createStudySession(student, {
      ...slot,
      courseId: math.id,
    });

    const moved = await setStudySessionSchedule(student, moving.id, {
      date: '2026-11-11',
      startTime: '07:30',
    });
    // Duration and course stay as saved.
    assert.deepEqual(moved, {
      ...moving,
      date: '2026-11-11',
      startTime: '07:30',
    });
    assert.deepEqual(await findStudySession(student, moving.id), moved);
    // The schedule has no copy at the old time and lists the new time first.
    assert.deepEqual(await listStudySessions(student), [moved, early]);
  },
);

test(
  'SP-04: an invalid new time keeps the saved schedule',
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const saved = await createStudySession(owner, slot);
    for (const invalid of [
      {},
      { date: '2026-11-12' },
      { startTime: '09:00' },
      { date: '2026-02-30', startTime: '09:00' },
      { date: '2026-11-12', startTime: '25:00' },
    ])
      await assert.rejects(
        setStudySessionSchedule(owner, saved.id, invalid),
        /valid date and a start time/,
        JSON.stringify(invalid),
      );
    await assert.rejects(
      setStudySessionSchedule(other, saved.id, {
        date: '2026-11-13',
        startTime: '09:00',
      }),
      /Study session not found/,
    );
    assert.deepEqual(await listStudySessions(owner), [saved]);
  },
);

test('SP-05: planned study time adds up saved durations', () => {
  const sessions = [
    { ...session('a', '2026-11-12', '09:00'), durationMinutes: 60 },
    { ...session('b', '2026-11-12', '18:00'), durationMinutes: 30 },
    { ...session('c', '2026-11-13', '18:00'), durationMinutes: 105 },
  ];
  assert.equal(plannedMinutes(sessions), 195);
  assert.equal(plannedMinutes([]), 0);
  assert.equal(durationText(195), '3 h 15 min');
  assert.equal(durationText(60), '1 h');
  assert.equal(durationText(45), '45 min');
  assert.equal(durationText(0), '0 min');
});

test(
  'SP-05: a new duration is saved without changing the schedule',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const saved = await createStudySession(student, {
      ...slot,
      courseId: math.id,
    });

    const longer = await setStudySessionDuration(student, saved.id, 120);
    assert.deepEqual(longer, { ...saved, durationMinutes: 120 });
    assert.deepEqual(await findStudySession(student, saved.id), longer);
    assert.equal(plannedMinutes(await listStudySessions(student)), 120);
  },
);

test(
  'SP-05: an invalid duration is rejected and the saved one stays',
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const saved = await createStudySession(owner, slot);
    for (const invalid of [0, -30, 1.5, NaN, '90', 'abc', null, 1441])
      await assert.rejects(
        setStudySessionDuration(owner, saved.id, invalid),
        /duration of 1–1440 whole minutes/,
        String(invalid),
      );
    await assert.rejects(
      setStudySessionDuration(other, saved.id, 90),
      /Study session not found/,
    );
    assert.deepEqual(await findStudySession(owner, saved.id), saved);
  },
);

test(
  'SP-06: a session shows its objective after reopening',
  { skip: stack },
  async () => {
    const student = await account();
    const saved = await createStudySession(student, {
      ...slot,
      objective: '  Review chapter 3  ',
    });
    assert.equal(saved.objective, 'Review chapter 3');
    assert.equal(
      (await findStudySession(student, saved.id))?.objective,
      'Review chapter 3',
    );
  },
);

test(
  'SP-06: editing the objective replaces it without changing the schedule',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const saved = await createStudySession(student, {
      ...slot,
      courseId: math.id,
      objective: 'Review chapter 3',
    });

    const edited = await setStudySessionObjective(
      student,
      saved.id,
      'Finish problem set 4',
    );
    assert.deepEqual(edited, { ...saved, objective: 'Finish problem set 4' });
    assert.deepEqual(await findStudySession(student, saved.id), edited);
    assert.deepEqual(await listStudySessions(student), [edited]);

    // A blank objective clears it.
    const cleared = await setStudySessionObjective(student, saved.id, '   ');
    assert.deepEqual(cleared, { ...saved, objective: null });
  },
);

test(
  'SP-06: a too-long objective is rejected and the saved one stays',
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const saved = await createStudySession(owner, {
      ...slot,
      objective: 'Flashcards',
    });
    await assert.rejects(
      setStudySessionObjective(owner, saved.id, 'x'.repeat(501)),
      /500 characters or fewer/,
    );
    await assert.rejects(
      setStudySessionObjective(other, saved.id, 'Sneaky'),
      /Study session not found/,
    );
    assert.equal(
      (await findStudySession(owner, saved.id))?.objective,
      'Flashcards',
    );
  },
);
