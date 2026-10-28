import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createCourse,
  replaceMeetings,
  updateCourse,
  updateCourseField,
} from '../src/web/features/courses/course-api.js';
import { createAssignment } from '../src/web/features/assignments/assignment-api.js';
import {
  createStudySession,
  setStudySessionCourse,
} from '../src/web/features/study-sessions/session-api.js';
import { setCurrentSemester } from '../src/web/features/courses/settings-api.js';
import { validMeetings } from '../src/shared/meetings.js';

// Invalid input must be rejected before any request is made.
const offline = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error('Unexpected network access');
  },
});

test('meeting validation matches the documented CM-04 rules', () => {
  assert(validMeetings([]));
  assert(validMeetings([{ day: 'mon', startTime: '09:00', endTime: '10:15' }]));
  for (const invalid of [
    null,
    {},
    [{ day: 'xyz', startTime: '09:00', endTime: '10:00' }],
    [{ day: 'mon', startTime: '10:00', endTime: '10:00' }],
    [{ day: 'mon', startTime: '10:00', endTime: '09:00' }],
    [{ day: 'mon', startTime: '24:00', endTime: '25:00' }],
    [{ day: 'mon', startTime: '9:00', endTime: '10:00' }],
    Array(101).fill({ day: 'mon', startTime: '09:00', endTime: '10:00' }),
  ])
    assert(!validMeetings(invalid), JSON.stringify(invalid)?.slice(0, 60));
});

test('course input is validated before reaching Supabase', async () => {
  await assert.rejects(createCourse(offline, { name: '  ' }), /course name/);
  await assert.rejects(
    createCourse(offline, { name: 'x'.repeat(201) }),
    /course name/,
  );
  await assert.rejects(
    createCourse(offline, { name: 'Math', code: {} }),
    /Course code must be text/,
  );
  await assert.rejects(
    createCourse(offline, { name: 'Math', semester: 'x'.repeat(101) }),
    /at most 100/,
  );
  await assert.rejects(
    updateCourseField(offline, 'id', 'instructor', 42),
    /Instructor must be text/,
  );
  await assert.rejects(
    replaceMeetings(offline, 'id', [
      { day: 'mon', startTime: '10:00', endTime: '09:00' },
    ]),
    /End time must be after start time/,
  );
  await assert.rejects(
    updateCourse(offline, 'id', { name: 'Math', notes: 1 }),
    /Notes must be text/,
  );
});

test('current semester input is validated before reaching Supabase', async () => {
  await assert.rejects(
    setCurrentSemester(offline, 'x'.repeat(101)),
    /at most 100 characters/,
  );
  await assert.rejects(setCurrentSemester(offline, 42), /must be text/);
});

test('coursework input is validated before reaching Supabase', async () => {
  await assert.rejects(createAssignment(offline, { title: ' ' }), /title/);
  await assert.rejects(
    createAssignment(offline, { title: 'x'.repeat(201) }),
    /title/,
  );
  await assert.rejects(
    createAssignment(offline, { title: 'Essay', courseId: 'not-a-uuid' }),
    /Course not found/,
  );
  const valid = { date: '2026-11-02', startTime: '18:00', durationMinutes: 60 };
  for (const invalid of [
    {},
    { ...valid, date: undefined },
    { ...valid, date: '2026-02-30' },
    { ...valid, date: '2026-13-01' },
    { ...valid, date: '11/02/2026' },
    { ...valid, startTime: '24:00' },
    { ...valid, startTime: '9:00' },
    { ...valid, durationMinutes: 0 },
    { ...valid, durationMinutes: -15 },
    { ...valid, durationMinutes: 1.5 },
    { ...valid, durationMinutes: 1441 },
    { ...valid, durationMinutes: '60' },
  ])
    await assert.rejects(
      createStudySession(offline, invalid),
      /valid date/,
      JSON.stringify(invalid),
    );
  await assert.rejects(
    setStudySessionCourse(offline, 'not-a-uuid', null),
    /Study session not found/,
  );
});
