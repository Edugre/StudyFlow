import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Assignment } from '../src/shared/assignment.js';
import {
  completedSessions,
  periodError,
  studyTime,
  taskProgress,
} from '../src/shared/progress.js';
import type { StudySession } from '../src/shared/study-session.js';
import {
  completeAssignment,
  createAssignment,
} from '../src/web/features/assignments/assignment-api.js';
import {
  cancelStudySession,
  completeStudySession,
  createStudySession,
} from '../src/web/features/study-sessions/session-api.js';
import { createCourse } from '../src/web/features/courses/course-api.js';
import {
  completeGoal,
  createGoal,
} from '../src/web/features/goals/goal-api.js';
import { loadProgress } from '../src/web/features/progress/progress-api.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { account, stack } from './support/supabase.js';

const task = (id: string, completedAt: string | null): Assignment => ({
  id,
  title: id,
  courseId: null,
  kind: 'assignment',
  priority: 'medium',
  dueDate: null,
  dueTime: null,
  completedAt,
  grade: null,
  remindersEnabled: true,
});
const done = '2026-11-20T12:00:00Z';

test('GP-06: tasks are counted as completed or incomplete', () => {
  const tasks = [
    task('a', done),
    task('b', done),
    task('c', done),
    task('d', null),
    task('e', null),
  ];
  assert.deepEqual(taskProgress(tasks), { completed: 3, incomplete: 2 });
  assert.deepEqual(taskProgress([]), { completed: 0, incomplete: 0 });
});

test(
  'GP-06: assignment progress follows completed tasks',
  { skip: stack },
  async () => {
    const student = await account();
    assert.deepEqual((await loadProgress(student)).tasks, {
      completed: 0,
      incomplete: 0,
    });
    const tasks = [];
    for (const title of ['Essay', 'Lab', 'Quiz', 'Exam', 'Project'])
      tasks.push(await createAssignment(student, { title }));
    for (const saved of tasks.slice(0, 3))
      await completeAssignment(student, saved.id);
    assert.deepEqual((await loadProgress(student)).tasks, {
      completed: 3,
      incomplete: 2,
    });
    await completeAssignment(student, tasks[3]!.id);
    assert.deepEqual((await loadProgress(student)).tasks, {
      completed: 4,
      incomplete: 1,
    });
    const other = await account();
    assert.deepEqual((await loadProgress(other)).tasks, {
      completed: 0,
      incomplete: 0,
    });
  },
);

const session = (
  id: string,
  completedAt: string | null,
  canceledAt: string | null = null,
): StudySession => ({
  id,
  courseId: null,
  date: '2026-11-12',
  startTime: '18:00',
  durationMinutes: 60,
  objective: null,
  assignmentId: null,
  completedAt,
  canceledAt,
});

test('GP-07: only completed sessions count, never canceled ones', () => {
  const sessions = [
    session('a', done),
    session('b', done),
    session('c', done),
    session('d', null),
    session('e', null),
    session('canceled', null, done),
  ];
  assert.equal(completedSessions(sessions), 3);
  assert.equal(completedSessions([]), 0);
});

const slot = { date: '2026-11-12', startTime: '18:00', durationMinutes: 60 };

test(
  'GP-07: the completed-session count follows completions',
  { skip: stack },
  async () => {
    const student = await account();
    assert.equal((await loadProgress(student)).completedSessions, 0);
    const sessions = [];
    for (let i = 0; i < 5; i++)
      sessions.push(await createStudySession(student, slot));
    for (const saved of sessions.slice(0, 3))
      await completeStudySession(student, saved.id);
    assert.equal((await loadProgress(student)).completedSessions, 3);
    await completeStudySession(student, sessions[3]!.id);
    assert.equal((await loadProgress(student)).completedSessions, 4);
    await cancelStudySession(student, sessions[4]!.id);
    assert.equal((await loadProgress(student)).completedSessions, 4);
  },
);

test('GP-08: planned and completed study time in a period', () => {
  const at = (
    id: string,
    date: string,
    durationMinutes: number,
    completedAt: string | null,
    canceledAt: string | null = null,
  ) => ({ ...session(id, completedAt, canceledAt), date, durationMinutes });
  const sessions = [
    at('done', '2026-11-10', 60, done),
    at('planned', '2026-11-12', 30, null),
    at('canceled', '2026-11-11', 120, null, done),
    at('earlier', '2026-10-01', 45, done),
  ];
  assert.deepEqual(
    studyTime(sessions, { from: '2026-11-09', to: '2026-11-15' }),
    { plannedMinutes: 90, completedMinutes: 60 },
  );
  assert.deepEqual(studyTime(sessions), {
    plannedMinutes: 135,
    completedMinutes: 105,
  });
  assert.deepEqual(studyTime(sessions, { to: '2026-10-31' }), {
    plannedMinutes: 45,
    completedMinutes: 45,
  });
  assert.deepEqual(studyTime(sessions, { from: '2026-12-01' }), {
    plannedMinutes: 0,
    completedMinutes: 0,
  });
  assert.deepEqual(studyTime([]), { plannedMinutes: 0, completedMinutes: 0 });
});

test('GP-08: an invalid period is rejected before loading', async () => {
  const offline = new Proxy({} as SupabaseClient, {
    get() {
      throw new Error('Unexpected network access');
    },
  });
  for (const period of [
    { from: '2026-02-30' },
    { to: 'next week' },
    { from: '2026-11-15', to: '2026-11-09' },
  ])
    await assert.rejects(
      loadProgress(offline, period),
      { message: periodError },
      JSON.stringify(period),
    );
});

test(
  'GP-08: study time compares planned with completed durations',
  { skip: stack },
  async () => {
    const student = await account();
    const week = { from: '2026-11-09', to: '2026-11-15' };
    assert.deepEqual((await loadProgress(student, week)).studyTime, {
      plannedMinutes: 0,
      completedMinutes: 0,
    });
    const hour = await createStudySession(student, {
      date: '2026-11-10',
      startTime: '18:00',
      durationMinutes: 60,
    });
    await createStudySession(student, {
      date: '2026-11-12',
      startTime: '09:00',
      durationMinutes: 30,
    });
    const canceled = await createStudySession(student, {
      date: '2026-11-11',
      startTime: '09:00',
      durationMinutes: 120,
    });
    await createStudySession(student, {
      date: '2026-11-20',
      startTime: '09:00',
      durationMinutes: 45,
    });
    await completeStudySession(student, hour.id);
    await cancelStudySession(student, canceled.id);
    assert.deepEqual((await loadProgress(student, week)).studyTime, {
      plannedMinutes: 90,
      completedMinutes: 60,
    });
    assert.deepEqual((await loadProgress(student)).studyTime, {
      plannedMinutes: 135,
      completedMinutes: 60,
    });
  },
);

test(
  "GP-09: a course's progress counts only that course's records",
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const biology = await createCourse(student, { name: 'Biology' });
    const essay = await createAssignment(student, {
      title: 'Proofs',
      courseId: math.id,
    });
    await createAssignment(student, { title: 'Limits', courseId: math.id });
    await completeAssignment(
      student,
      (
        await createAssignment(student, {
          title: 'Cells',
          courseId: biology.id,
        })
      ).id,
    );
    await createAssignment(student, { title: 'Unlinked' });
    await completeAssignment(student, essay.id);
    const mathSession = await createStudySession(student, {
      ...slot,
      courseId: math.id,
    });
    await completeStudySession(student, mathSession.id);
    await completeStudySession(
      student,
      (await createStudySession(student, { ...slot, courseId: biology.id })).id,
    );
    const calculus = await createGoal(student, {
      title: 'Pass calculus',
      message: 'Score a B',
      courseId: math.id,
    });
    await createGoal(student, {
      title: 'Learn cells',
      message: 'Know the organelles',
      courseId: biology.id,
    });

    const progress = await loadProgress(student, { courseId: math.id });
    assert.deepEqual(progress.tasks, { completed: 1, incomplete: 1 });
    assert.equal(progress.completedSessions, 1);
    assert.deepEqual(progress.studyTime, {
      plannedMinutes: 60,
      completedMinutes: 60,
    });
    assert.deepEqual(progress.goals, [calculus]);

    await completeGoal(student, calculus.id);
    const all = await loadProgress(student);
    assert.deepEqual(all.tasks, { completed: 2, incomplete: 2 });
    assert.equal(all.completedSessions, 2);
    assert.equal(all.goals.length, 2);
  },
);

test(
  'GP-09: a course without records shows zeros and no goals',
  { skip: stack },
  async () => {
    const student = await account();
    const empty = await createCourse(student, { name: 'Empty' });
    await createAssignment(student, { title: 'Elsewhere' });
    await createGoal(student, { title: 'Unlinked', message: 'Goal' });
    assert.deepEqual(await loadProgress(student, { courseId: empty.id }), {
      tasks: { completed: 0, incomplete: 0 },
      completedSessions: 0,
      studyTime: { plannedMinutes: 0, completedMinutes: 0 },
      goals: [],
    });
    await assert.rejects(
      loadProgress(student, { courseId: 'not-an-id' }),
      /Course not found/,
    );
  },
);
