import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  completeAssignment,
  createAssignment,
  deleteAssignment,
  editAssignment,
  findAssignment,
  listAssignments,
  recordGrade,
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
      completedAt: null,
      grade: null,
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
      completedAt: null,
      grade: null,
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

test(
  'AT-06: a completed task stays completed and is counted once',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();
    const essay = await createAssignment(student, { title: 'Essay' });
    const lab = await createAssignment(student, { title: 'Lab' });
    assert.equal(essay.completedAt, null);

    const done = await completeAssignment(student, essay.id);
    assert.notEqual(done.completedAt, null);
    assert.equal(
      (await findAssignment(student, essay.id))?.completedAt,
      done.completedAt,
    );

    // Completing again keeps the first completion and adds no task.
    const again = await completeAssignment(student, essay.id);
    assert.equal(again.completedAt, done.completedAt);
    const tasks = await listAssignments(student);
    assert.equal(tasks.length, 2);
    assert.deepEqual(
      tasks.filter((task) => task.completedAt).map((task) => task.id),
      [essay.id],
    );
    assert.equal((await findAssignment(student, lab.id))?.completedAt, null);

    await assert.rejects(
      completeAssignment(other, lab.id),
      /Assignment not found/,
    );
    assert.equal((await findAssignment(student, lab.id))?.completedAt, null);
  },
);

test(
  'AT-07: editing saves every detail at once, or nothing if any is invalid',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();
    const math = await createCourse(student, { name: 'Math' });
    const physics = await createCourse(student, { name: 'Physics' });
    const essay = await createAssignment(student, {
      title: 'Essay',
      courseId: math.id,
      dueDate: '2026-11-02',
    });
    const lab = await createAssignment(student, { title: 'Lab' });
    const labBefore = await findAssignment(student, lab.id);

    const changes = {
      title: '  Final essay  ',
      courseId: physics.id,
      kind: 'project',
      priority: 'high',
      dueDate: '2026-12-01',
      dueTime: '23:59',
    };
    await editAssignment(student, essay.id, changes);
    const edited = {
      id: essay.id,
      title: 'Final essay',
      courseId: physics.id,
      kind: 'project',
      priority: 'high',
      dueDate: '2026-12-01',
      dueTime: '23:59',
      completedAt: null,
      grade: null,
    };
    assert.deepEqual(await findAssignment(student, essay.id), edited);
    assert.deepEqual(await findAssignment(student, lab.id), labBefore);

    // One invalid field rejects the whole edit, valid fields included.
    await assert.rejects(
      editAssignment(student, essay.id, {
        ...changes,
        title: 'Renamed',
        dueTime: '25:00',
      }),
      /valid due date/,
    );
    assert.deepEqual(await findAssignment(student, essay.id), edited);

    // Editing a completed task keeps its completion.
    const done = await completeAssignment(student, essay.id);
    await editAssignment(student, essay.id, { ...changes, title: 'Essay v2' });
    const kept = await findAssignment(student, essay.id);
    assert.equal(kept?.title, 'Essay v2');
    assert.equal(kept?.completedAt, done.completedAt);

    await assert.rejects(
      editAssignment(other, lab.id, { title: 'Hijacked' }),
      /Assignment not found/,
    );
    assert.deepEqual(await findAssignment(student, lab.id), labBefore);
  },
);

test(
  'AT-08: a deleted task leaves the task list and its course',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();
    const math = await createCourse(student, { name: 'Math' });
    const essay = await createAssignment(student, {
      title: 'Essay',
      courseId: math.id,
    });
    const lab = await createAssignment(student, {
      title: 'Lab',
      courseId: math.id,
    });

    // Another student's delete removes nothing.
    assert.equal(await deleteAssignment(other, essay.id), false);
    assert.equal((await findAssignment(student, essay.id))?.title, 'Essay');

    assert.equal(await deleteAssignment(student, essay.id), true);
    assert.equal(await findAssignment(student, essay.id), null);
    assert.deepEqual(
      (await listAssignments(student)).map((task) => task.id),
      [lab.id],
    );
    assert.deepEqual(
      (await listAssignments(student, math.id)).map((task) => task.id),
      [lab.id],
    );

    // Deleting again, or an unknown id, finds nothing.
    assert.equal(await deleteAssignment(student, essay.id), false);
    assert.equal(await deleteAssignment(student, 'not-a-uuid'), false);
  },
);

test(
  'AT-10: a completed task keeps a valid grade, and invalid grades change nothing',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();
    const essay = await createAssignment(student, { title: 'Essay' });

    await assert.rejects(
      recordGrade(student, essay.id, 90),
      /Mark the task completed before recording a grade/,
    );
    assert.equal((await findAssignment(student, essay.id))?.grade, null);

    await completeAssignment(student, essay.id);
    await recordGrade(student, essay.id, '92.5');
    assert.equal((await findAssignment(student, essay.id))?.grade, 92.5);

    for (const invalid of ['abc', '', '-1', '100.01'])
      await assert.rejects(
        recordGrade(student, essay.id, invalid),
        /Enter a grade from 0 to 100/,
      );
    assert.equal((await findAssignment(student, essay.id))?.grade, 92.5);

    for (const edge of [0, 100])
      assert.equal((await recordGrade(student, essay.id, edge)).grade, edge);

    await assert.rejects(
      recordGrade(other, essay.id, 50),
      /Assignment not found/,
    );
    assert.equal((await findAssignment(student, essay.id))?.grade, 100);
  },
);
