import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createCourse,
  replaceMeetings,
  updateCourse,
  updateCourseField,
} from '../src/web/features/courses/course-api.js';
import {
  createAssignment,
  editAssignment,
  recordGrade,
  setAssignmentDue,
  setAssignmentKind,
  setAssignmentPriority,
  setAssignmentReminders,
} from '../src/web/features/assignments/assignment-api.js';
import {
  cancelStudySession,
  completeStudySession,
  createStudySession,
  editStudySession,
  setStudySessionCourse,
  setStudySessionDuration,
  setStudySessionObjective,
  setStudySessionSchedule,
  setStudySessionTask,
} from '../src/web/features/study-sessions/session-api.js';
import {
  saveReminderSettings,
  setCurrentSemester,
  type ReminderSettings,
} from '../src/web/features/courses/settings-api.js';
import { markNotificationRead } from '../src/web/features/notifications/notification-api.js';
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

test('RN-04: reminder settings are validated before reaching Supabase', async () => {
  const valid: ReminderSettings = {
    assignment_reminders_enabled: true,
    exam_reminders_enabled: true,
    study_session_reminders_enabled: true,
    overdue_notifications_enabled: true,
    reminder_lead_minutes: 60,
    time_zone: 'UTC',
  };
  for (const reminder_lead_minutes of [0, 4, 10081, 30.5, Number.NaN])
    await assert.rejects(
      saveReminderSettings(offline, { ...valid, reminder_lead_minutes }),
      /between 5 and 10080 minutes/,
      String(reminder_lead_minutes),
    );
  await assert.rejects(
    saveReminderSettings(offline, { ...valid, time_zone: 'Mars/Olympus' }),
    /time-zone/,
  );
});

test('RN-08: notification ids are validated before reaching Supabase', async () => {
  for (const id of ['not-a-uuid', '', 42, null])
    await assert.rejects(
      markNotificationRead(offline, id),
      /Invalid notification identifier/,
    );
});

test('RN-06: task reminder settings are validated before reaching Supabase', async () => {
  for (const value of ['on', 1, null, undefined])
    await assert.rejects(
      setAssignmentReminders(offline, crypto.randomUUID(), value),
      /whether this task sends reminders/,
    );
});

test('RN-07: notification categories are validated before reaching Supabase', async () => {
  const valid: ReminderSettings = {
    assignment_reminders_enabled: true,
    exam_reminders_enabled: true,
    study_session_reminders_enabled: true,
    overdue_notifications_enabled: true,
    reminder_lead_minutes: 60,
    time_zone: 'UTC',
  };
  for (const category of [
    'assignment_reminders_enabled',
    'exam_reminders_enabled',
    'study_session_reminders_enabled',
    'overdue_notifications_enabled',
  ] as const)
    await assert.rejects(
      saveReminderSettings(offline, {
        ...valid,
        [category]: 'yes' as unknown as boolean,
      }),
      /enabled or disabled/,
      category,
    );
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
  await assert.rejects(
    createAssignment(offline, { title: 'Essay', kind: 'homework' }),
    /Choose assignment, exam, quiz, or project/,
  );
  await assert.rejects(
    setAssignmentKind(offline, crypto.randomUUID(), 'homework'),
    /Choose assignment, exam, quiz, or project/,
  );
  await assert.rejects(
    createAssignment(offline, { title: 'Essay', priority: 'urgent' }),
    /Choose Low, Medium, or High priority/,
  );
  await assert.rejects(
    setAssignmentPriority(offline, crypto.randomUUID(), 'urgent'),
    /Choose Low, Medium, or High priority/,
  );
  for (const due of [
    { dueDate: '2026-02-30' },
    { dueDate: '11/02/2026' },
    { dueDate: '2026-11-02', dueTime: '25:00' },
    { dueDate: '2026-11-02', dueTime: '6pm' },
    { dueTime: '18:00' },
  ]) {
    await assert.rejects(
      createAssignment(offline, { title: 'Essay', ...due }),
      /valid due date/,
    );
    await assert.rejects(
      setAssignmentDue(offline, crypto.randomUUID(), due),
      /valid due date/,
    );
  }
  const edit = {
    title: 'Essay',
    kind: 'exam',
    priority: 'high',
    dueDate: '2026-11-02',
  };
  for (const [invalid, message] of [
    [{ title: ' ' }, /title/],
    [{ kind: 'homework' }, /Choose assignment/],
    [{ priority: 'urgent' }, /Choose Low/],
    [{ dueDate: '2026-02-30' }, /valid due date/],
    [{ courseId: 'not-a-uuid' }, /Course not found/],
  ] as const)
    await assert.rejects(
      editAssignment(offline, crypto.randomUUID(), { ...edit, ...invalid }),
      message,
    );
  for (const invalid of [
    'abc',
    '',
    ' ',
    '-1',
    '100.01',
    '101',
    '1e2',
    '92.555',
    -5,
    null,
  ])
    await assert.rejects(
      recordGrade(offline, crypto.randomUUID(), invalid),
      /Enter a grade from 0 to 100/,
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
    { ...valid, durationMinutes: NaN },
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
  for (const invalid of [
    {},
    { date: '2026-11-12' },
    { date: '2026-02-30', startTime: '09:00' },
    { date: '2026-11-12', startTime: '9:00' },
  ])
    await assert.rejects(
      setStudySessionSchedule(offline, crypto.randomUUID(), invalid),
      /valid date and a start time/,
      JSON.stringify(invalid),
    );
  await assert.rejects(
    setStudySessionSchedule(offline, 'not-a-uuid', {
      date: '2026-11-12',
      startTime: '09:00',
    }),
    /Study session not found/,
  );
  for (const invalid of [0, -1, 2.5, NaN, '60', undefined, 1441])
    await assert.rejects(
      setStudySessionDuration(offline, crypto.randomUUID(), invalid),
      /duration of 1–1440 whole minutes/,
      String(invalid),
    );
  for (const invalid of ['x'.repeat(501), 42, { text: 'Read' }])
    await assert.rejects(
      setStudySessionObjective(offline, crypto.randomUUID(), invalid),
      /500 characters or fewer/,
      String(invalid),
    );
  await assert.rejects(
    createStudySession(offline, { ...valid, objective: 'x'.repeat(501) }),
    /500 characters or fewer/,
  );
  await assert.rejects(
    createStudySession(offline, { ...valid, assignmentId: 'not-a-uuid' }),
    /Task not found/,
  );
  await assert.rejects(
    setStudySessionTask(offline, crypto.randomUUID(), 42),
    /Task not found/,
  );
  for (const invalid of [
    {},
    { ...valid, durationMinutes: 0 },
    { ...valid, objective: 'x'.repeat(501) },
    { ...valid, courseId: 'not-a-uuid' },
    { ...valid, assignmentId: 'not-a-uuid' },
  ])
    await assert.rejects(
      editStudySession(offline, crypto.randomUUID(), invalid),
      /valid date|500 characters|not found/,
      JSON.stringify(invalid),
    );
  for (const status of [cancelStudySession, completeStudySession])
    await assert.rejects(
      status(offline, 'not-a-uuid'),
      /Study session not found/,
    );
});
