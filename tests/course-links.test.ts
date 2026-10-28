import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCourse,
  deleteCourse,
} from '../src/web/features/courses/course-api.js';
import {
  createAssignment,
  findAssignment,
  listAssignments,
  setAssignmentCourse,
} from '../src/web/features/assignments/assignment-api.js';
import {
  createStudySession,
  findStudySession,
  listStudySessions,
  setStudySessionCourse,
} from '../src/web/features/study-sessions/session-api.js';
import { account, stack } from './support/supabase.js';

const schedule = {
  date: '2026-11-02',
  startTime: '18:00',
  durationMinutes: 90,
};

test(
  'CM-10: coursework keeps its course and lists only under that course',
  { skip: stack },
  async () => {
    const student = await account();
    const math = await createCourse(student, { name: 'Math' });
    const physics = await createCourse(student, { name: 'Physics' });

    const essay = await createAssignment(student, {
      title: '  Proof set  ',
      courseId: math.id,
    });
    const lab = await createAssignment(student, {
      title: 'Lab report',
      courseId: physics.id,
    });
    const review = await createStudySession(student, {
      ...schedule,
      courseId: math.id,
    });
    await createStudySession(student, { ...schedule, courseId: physics.id });

    assert.deepEqual(await findAssignment(student, essay.id), {
      id: essay.id,
      title: 'Proof set',
      courseId: math.id,
      kind: 'assignment',
      priority: 'medium',
      dueDate: null,
      dueTime: null,
    });
    assert.deepEqual(await findStudySession(student, review.id), {
      id: review.id,
      courseId: math.id,
      ...schedule,
    });
    assert.deepEqual(
      (await listAssignments(student, math.id)).map((a) => a.id),
      [essay.id],
    );
    assert.deepEqual(
      (await listStudySessions(student, math.id)).map((s) => s.id),
      [review.id],
    );

    // Reassigning moves the record without duplicating it.
    await setAssignmentCourse(student, essay.id, physics.id);
    await setStudySessionCourse(student, review.id, physics.id);
    assert.deepEqual(await listAssignments(student, math.id), []);
    assert.deepEqual(await listStudySessions(student, math.id), []);
    assert.deepEqual(
      (await listAssignments(student, physics.id)).map((a) => a.id),
      [essay.id, lab.id],
    );
    assert.equal((await listAssignments(student)).length, 2);
    assert.equal((await listStudySessions(student)).length, 2);

    // Deleting a course keeps its coursework, unlinked.
    assert(await deleteCourse(student, physics.id));
    assert.equal((await findAssignment(student, essay.id))?.courseId, null);
    assert.equal((await findStudySession(student, review.id))?.courseId, null);
    assert.equal((await listAssignments(student)).length, 2);
  },
);

test(
  'CM-10: coursework cannot link to or be read by another student',
  { skip: stack },
  async () => {
    const owner = await account();
    const other = await account();
    const course = await createCourse(owner, { name: 'Math' });
    const theirs = await createCourse(other, { name: 'History' });
    const essay = await createAssignment(owner, {
      title: 'Essay',
      courseId: course.id,
    });

    await assert.rejects(
      createAssignment(owner, { title: 'Sneaky', courseId: theirs.id }),
      /Course not found/,
    );
    await assert.rejects(
      createStudySession(owner, { ...schedule, courseId: theirs.id }),
      /Course not found/,
    );
    await assert.rejects(
      setAssignmentCourse(owner, essay.id, theirs.id),
      /Course not found/,
    );
    await assert.rejects(
      setAssignmentCourse(other, essay.id, null),
      /Assignment not found/,
    );
    assert.equal(await findAssignment(other, essay.id), null);
    assert.deepEqual(await listAssignments(other, course.id), []);
    assert.equal((await listAssignments(owner)).length, 1);
    assert.equal((await listStudySessions(owner)).length, 0);
  },
);
