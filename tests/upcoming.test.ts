import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upcomingTasks, type Assignment } from '../src/shared/assignment.js';

const task = (
  id: string,
  dueDate: string | null,
  dueTime: string | null = null,
  completedAt: string | null = null,
): Assignment => ({
  id,
  title: id,
  courseId: null,
  kind: 'assignment',
  priority: 'medium',
  dueDate,
  dueTime,
  completedAt,
});

// Local time, like the deadlines themselves: Nov 2, 2026 at 12:00.
const now = new Date(2026, 10, 2, 12, 0);

test('AT-09: open future tasks are listed earliest deadline first', () => {
  const tasks = [
    task('next week', '2026-11-10'),
    task('thursday morning', '2026-11-05', '09:00'),
    task('today, no time', '2026-11-02'),
    task('thursday, no time', '2026-11-05'),
    task('this evening', '2026-11-02', '18:00'),
    task('right now', '2026-11-02', '12:00'),
  ];
  assert.deepEqual(
    upcomingTasks(tasks, now).map((t) => t.id),
    [
      'right now',
      'this evening',
      'today, no time',
      'thursday morning',
      'thursday, no time',
      'next week',
    ],
  );
});

test('AT-09: completed, overdue and undated tasks are excluded', () => {
  const tasks = [
    task('completed', '2026-11-03', null, '2026-11-01T10:00:00Z'),
    task('yesterday', '2026-11-01'),
    task('this morning', '2026-11-02', '08:00'),
    task('a minute ago', '2026-11-02', '11:59'),
    task('no deadline', null),
    task('tomorrow', '2026-11-03'),
  ];
  assert.deepEqual(
    upcomingTasks(tasks, now).map((t) => t.id),
    ['tomorrow'],
  );
});

test('AT-09: tasks with the same deadline keep their saved order', () => {
  const tasks = [task('first', '2026-11-04'), task('second', '2026-11-04')];
  assert.deepEqual(
    upcomingTasks(tasks, now).map((t) => t.id),
    ['first', 'second'],
  );
});

test('AT-09: the list follows the clock across midnight', () => {
  const tasks = [task('today', '2026-11-02'), task('tomorrow', '2026-11-03')];
  const lateTonight = new Date(2026, 10, 2, 23, 59);
  const afterMidnight = new Date(2026, 10, 3, 0, 1);
  assert.deepEqual(
    upcomingTasks(tasks, lateTonight).map((t) => t.id),
    ['today', 'tomorrow'],
  );
  assert.deepEqual(
    upcomingTasks(tasks, afterMidnight).map((t) => t.id),
    ['tomorrow'],
  );
});
