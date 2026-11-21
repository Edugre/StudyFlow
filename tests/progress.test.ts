import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Assignment } from '../src/shared/assignment.js';
import { taskProgress } from '../src/shared/progress.js';
import {
  completeAssignment,
  createAssignment,
} from '../src/web/features/assignments/assignment-api.js';
import { loadProgress } from '../src/web/features/progress/progress-api.js';
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
