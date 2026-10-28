import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAssignment,
  findAssignment,
  listAssignments,
  setAssignmentCourse,
  setAssignmentDue,
  setAssignmentKind,
  setAssignmentPriority,
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
      kind: 'assignment',
      priority: 'medium',
      dueDate: null,
      dueTime: null,
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

test(
  'AT-04: a task keeps its type, and changing it keeps everything else',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();
    const math = await createCourse(student, { name: 'Math' });

    for (const kind of ['assignment', 'exam', 'quiz', 'project'] as const) {
      const task = await createAssignment(student, { title: kind, kind });
      assert.equal((await findAssignment(student, task.id))?.kind, kind);
    }
    const untyped = await createAssignment(student, { title: 'Reading' });
    assert.equal(untyped.kind, 'assignment');

    const midterm = await createAssignment(student, {
      title: 'Midterm',
      courseId: math.id,
      kind: 'quiz',
    });
    await setAssignmentKind(student, midterm.id, 'exam');
    assert.deepEqual(await findAssignment(student, midterm.id), {
      id: midterm.id,
      title: 'Midterm',
      courseId: math.id,
      kind: 'exam',
      priority: 'medium',
      dueDate: null,
      dueTime: null,
    });

    await assert.rejects(
      setAssignmentKind(other, midterm.id, 'project'),
      /Assignment not found/,
    );
    assert.equal((await findAssignment(student, midterm.id))?.kind, 'exam');
  },
);

test(
  'AT-05: a task keeps its priority, and changing it affects only that task',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();

    for (const priority of ['low', 'medium', 'high'] as const) {
      const task = await createAssignment(student, {
        title: priority,
        priority,
      });
      assert.equal(
        (await findAssignment(student, task.id))?.priority,
        priority,
      );
    }

    const essay = await createAssignment(student, { title: 'Essay' });
    const lab = await createAssignment(student, { title: 'Lab' });
    assert.equal(essay.priority, 'medium');

    await setAssignmentPriority(student, essay.id, 'high');
    await setAssignmentPriority(student, essay.id, 'low');
    assert.equal((await findAssignment(student, essay.id))?.priority, 'low');
    assert.equal((await findAssignment(student, lab.id))?.priority, 'medium');

    await assert.rejects(
      setAssignmentPriority(other, essay.id, 'high'),
      /Assignment not found/,
    );
    assert.equal((await findAssignment(student, essay.id))?.priority, 'low');
  },
);

test(
  'AT-03: a task keeps its deadline, and invalid deadlines keep the saved one',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();

    const essay = await createAssignment(student, {
      title: 'Essay',
      dueDate: '2026-11-02',
      dueTime: '18:00',
    });
    const reading = await createAssignment(student, {
      title: 'Reading',
      dueDate: '2026-11-03',
    });
    const saved = await findAssignment(student, essay.id);
    assert.equal(saved?.dueDate, '2026-11-02');
    assert.equal(saved?.dueTime, '18:00');
    const dateOnly = await findAssignment(student, reading.id);
    assert.equal(dateOnly?.dueDate, '2026-11-03');
    assert.equal(dateOnly?.dueTime, null);

    await setAssignmentDue(student, essay.id, {
      dueDate: '2026-12-01',
      dueTime: '09:30',
    });
    for (const invalid of [
      { dueDate: '2026-02-30' },
      { dueDate: '2026-12-01', dueTime: '24:00' },
      { dueTime: '10:00' },
    ])
      await assert.rejects(
        setAssignmentDue(student, essay.id, invalid),
        /valid due date/,
      );
    const kept = await findAssignment(student, essay.id);
    assert.equal(kept?.dueDate, '2026-12-01');
    assert.equal(kept?.dueTime, '09:30');
    assert.equal(kept?.title, 'Essay');

    await setAssignmentDue(student, essay.id, { dueDate: '', dueTime: '' });
    const cleared = await findAssignment(student, essay.id);
    assert.equal(cleared?.dueDate, null);
    assert.equal(cleared?.dueTime, null);

    await assert.rejects(
      setAssignmentDue(other, reading.id, { dueDate: '2027-01-01' }),
      /Assignment not found/,
    );
    assert.equal(
      (await findAssignment(student, reading.id))?.dueDate,
      '2026-11-03',
    );
  },
);
