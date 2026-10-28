import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAssignment,
  findAssignment,
  listAssignments,
  setAssignmentCourse,
} from '../src/web/features/assignments/assignment-api.js';
import { createCourse } from '../src/web/features/courses/course-api.js';
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

test(
  'AT-02: a task keeps its course and moves to only the new course',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();
    const math = await createCourse(student, { name: 'Math' });
    const physics = await createCourse(student, { name: 'Physics' });
    const theirs = await createCourse(other, { name: 'History' });
    const task = await createAssignment(student, {
      title: 'Problem set',
      courseId: math.id,
    });

    assert.equal((await findAssignment(student, task.id))?.courseId, math.id);

    await setAssignmentCourse(student, task.id, physics.id);
    assert.equal(
      (await findAssignment(student, task.id))?.courseId,
      physics.id,
    );
    assert.deepEqual(await listAssignments(student, math.id), []);
    assert.deepEqual(
      (await listAssignments(student, physics.id)).map((saved) => saved.id),
      [task.id],
    );
    assert.equal((await listAssignments(student)).length, 1);

    await setAssignmentCourse(student, task.id, null);
    assert.equal((await findAssignment(student, task.id))?.courseId, null);
    assert.deepEqual(await listAssignments(student, physics.id), []);

    await assert.rejects(
      setAssignmentCourse(student, task.id, theirs.id),
      /Course not found/,
    );
    assert.equal((await findAssignment(student, task.id))?.courseId, null);
  },
);
