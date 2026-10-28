import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAssignment,
  findAssignment,
  listAssignments,
} from '../src/web/features/assignments/assignment-api.js';
import { account, stack } from './support/supabase.js';

test(
  'AT-01: a saved task appears once in the task list and reopens',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();
    const task = await createAssignment(student, { title: '  Read ch. 4  ' });

    assert.deepEqual(
      (await listAssignments(student)).map((saved) => saved.id),
      [task.id],
    );
    assert.deepEqual(await findAssignment(student, task.id), {
      id: task.id,
      title: 'Read ch. 4',
      courseId: null,
    });
    assert.equal(await findAssignment(other, task.id), null);
  },
);

test(
  'AT-01: blank titles are rejected and create nothing',
  { skip: stack },
  async () => {
    const student = await account();
    await assert.rejects(createAssignment(student, { title: '' }), /title/);
    await assert.rejects(createAssignment(student, { title: '   ' }), /title/);
    assert.deepEqual(await listAssignments(student), []);
  },
);
