import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createGoal,
  deleteGoal,
  findGoal,
  listGoals,
} from '../src/web/features/goals/goal-api.js';
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
