import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createGoal,
  deleteGoal,
  findGoal,
  listGoals,
  progressError,
  setGoalCourse,
  setGoalProgress,
  setGoalTargetDate,
  targetDateError,
} from '../src/web/features/goals/goal-api.js';
import {
  createCourse,
  deleteCourse,
} from '../src/web/features/courses/course-api.js';
import { account, stack } from './support/supabase.js';

// Invalid input must be rejected before any request is made.
const offline = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error('Unexpected network access');
  },
});

const goal = { title: 'Pass calculus', message: 'Score a B or better' };

test('GP-01: a blank description is rejected before saving', async () => {
  for (const message of ['', '   ', undefined, 7, 'x'.repeat(501)])
    await assert.rejects(
      createGoal(offline, { ...goal, message }),
      /goal message/,
      JSON.stringify(message),
    );
  for (const title of ['', '   ', undefined, 'x'.repeat(121)])
    await assert.rejects(
      createGoal(offline, { ...goal, title }),
      /goal title/,
      JSON.stringify(title),
    );
});

test(
  'GP-01: a saved goal appears once and can be reopened',
  { skip: stack },
  async () => {
    const student = await account();
    const saved = await createGoal(student, {
      title: '  Pass calculus ',
      message: ' Score a B or better ',
    });
    assert.equal(saved.title, 'Pass calculus');
    assert.equal(saved.message, 'Score a B or better');
    assert.deepEqual(await listGoals(student), [saved]);
    assert.deepEqual(await findGoal(student, saved.id), saved);
  },
);

test(
  'GP-01: a blank description creates no goal',
  { skip: stack },
  async () => {
    const student = await account();
    await assert.rejects(
      createGoal(student, { ...goal, message: '  ' }),
      /goal message/,
    );
    assert.deepEqual(await listGoals(student), []);
  },
);

test(
  'GP-01: another student cannot see or delete the goal',
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const saved = await createGoal(owner, goal);
    assert.deepEqual(await listGoals(other), []);
    assert.equal(await findGoal(other, saved.id), null);
    assert.equal(await deleteGoal(other, saved.id), false);
    assert.deepEqual(await listGoals(owner), [saved]);
    assert.equal(await deleteGoal(owner, saved.id), true);
    assert.deepEqual(await listGoals(owner), []);
  },
);

test('GP-02: an invalid target date is rejected before saving', async () => {
  const id = '00000000-0000-4000-8000-000000000000';
  for (const value of ['2026-02-30', '12/15/2026', 'soon', 20261215]) {
    await assert.rejects(
      setGoalTargetDate(offline, id, value),
      { message: targetDateError },
      JSON.stringify(value),
    );
    await assert.rejects(
      createGoal(offline, { ...goal, targetDate: value }),
      { message: targetDateError },
      JSON.stringify(value),
    );
  }
});

test(
  'GP-02: a saved target date appears after reopening',
  { skip: stack },
  async () => {
    const student = await account();
    const saved = await createGoal(student, goal);
    assert.equal(saved.targetDate, null);
    const dated = await setGoalTargetDate(student, saved.id, '2026-12-15');
    assert.equal(dated.targetDate, '2026-12-15');
    assert.equal((await findGoal(student, saved.id))?.targetDate, '2026-12-15');
    const created = await createGoal(student, {
      ...goal,
      targetDate: '2027-01-10',
    });
    assert.equal(
      (await findGoal(student, created.id))?.targetDate,
      '2027-01-10',
    );
  },
);

test(
  'GP-02: an invalid target date keeps the saved one',
  { skip: stack },
  async () => {
    const student = await account();
    const saved = await createGoal(student, {
      ...goal,
      targetDate: '2026-12-15',
    });
    await assert.rejects(setGoalTargetDate(student, saved.id, '2026-02-30'));
    assert.equal((await findGoal(student, saved.id))?.targetDate, '2026-12-15');
    const cleared = await setGoalTargetDate(student, saved.id, '');
    assert.equal(cleared.targetDate, null);
    assert.equal((await listGoals(student)).length, 1);
  },
);

test(
  "GP-02: another student cannot change a goal's target date",
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const saved = await createGoal(owner, goal);
    await assert.rejects(
      setGoalTargetDate(other, saved.id, '2030-01-01'),
      /Goal not found/,
    );
    assert.equal((await findGoal(owner, saved.id))?.targetDate, null);
  },
);

test(
  'GP-03: a goal displays its course after reopening',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const biology = await createCourse(student, { name: 'Biology' });
    const saved = await createGoal(student, { ...goal, courseId: math.id });
    assert.equal(saved.courseId, math.id);
    assert.equal((await findGoal(student, saved.id))?.courseId, math.id);
    await setGoalCourse(student, saved.id, biology.id);
    assert.equal((await findGoal(student, saved.id))?.courseId, biology.id);
    await setGoalCourse(student, saved.id, '');
    assert.equal((await findGoal(student, saved.id))?.courseId, null);
    assert.equal((await listGoals(student)).length, 1);
  },
);

test(
  "GP-03: a course's goals list shows only goals linked to it",
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const biology = await createCourse(student, { name: 'Biology' });
    const calculus = await createGoal(student, {
      ...goal,
      courseId: math.id,
    });
    const cells = await createGoal(student, {
      title: 'Learn cells',
      message: 'Know the organelles',
      courseId: biology.id,
    });
    await createGoal(student, { title: 'Read', message: 'Two books' });
    assert.deepEqual(await listGoals(student, math.id), [calculus]);
    assert.deepEqual(await listGoals(student, biology.id), [cells]);
    assert.equal((await listGoals(student)).length, 3);
  },
);

test(
  "GP-03: goals cannot link to another student's course",
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const theirs = await createCourse(other, { name: 'Theirs' });
    await assert.rejects(
      createGoal(owner, { ...goal, courseId: theirs.id }),
      /Course not found/,
    );
    const saved = await createGoal(owner, goal);
    await assert.rejects(
      setGoalCourse(owner, saved.id, theirs.id),
      /Course not found/,
    );
    await assert.rejects(
      setGoalCourse(owner, saved.id, 'not-an-id'),
      /Course not found/,
    );
    assert.equal((await findGoal(owner, saved.id))?.courseId, null);
  },
);

test(
  'GP-03: deleting a course keeps its goals, unlinked',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const saved = await createGoal(student, { ...goal, courseId: math.id });
    await deleteCourse(student, math.id);
    assert.equal((await findGoal(student, saved.id))?.courseId, null);
  },
);

test('GP-04: invalid progress is rejected before saving', async () => {
  const id = '00000000-0000-4000-8000-000000000000';
  for (const value of [-1, 101, 12.5, NaN, '50', null, undefined])
    await assert.rejects(
      setGoalProgress(offline, id, value),
      { message: progressError },
      String(value),
    );
});

test(
  'GP-04: saved progress appears after reopening',
  { skip: stack },
  async () => {
    const student = await account();
    const saved = await createGoal(student, goal);
    assert.equal(saved.progress, 0);
    for (const progress of [40, 0, 100]) {
      await setGoalProgress(student, saved.id, progress);
      assert.equal((await findGoal(student, saved.id))?.progress, progress);
    }
  },
);

test(
  'GP-04: invalid progress keeps the previous percentage',
  { skip: stack },
  async () => {
    const student = await account();
    const saved = await createGoal(student, goal);
    await setGoalProgress(student, saved.id, 40);
    await assert.rejects(setGoalProgress(student, saved.id, 150));
    await assert.rejects(setGoalProgress(student, saved.id, 'lots'));
    assert.equal((await findGoal(student, saved.id))?.progress, 40);
  },
);

test(
  "GP-04: another student cannot change a goal's progress",
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const saved = await createGoal(owner, goal);
    await assert.rejects(
      setGoalProgress(other, saved.id, 90),
      /Goal not found/,
    );
    assert.equal((await findGoal(owner, saved.id))?.progress, 0);
  },
);
