import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCourse,
  findCourse,
  listCourses,
  updateCourseField,
} from '../src/web/features/courses/course-api.js';
import { account, stack } from './support/supabase.js';

const meetings = [
  { day: 'tue' as const, startTime: '13:00', endTime: '14:15' },
];

test(
  'CM-02/03: exact codes and instructors persist, edit and clear independently',
  { skip: stack },
  async () => {
    const student = await account();
    const exact = '  cen-4010 / A  ';
    const first = await createCourse(student, {
      name: 'Engineering',
      code: exact,
      instructor: 'Dr. A',
      meetings,
    });
    const second = await createCourse(student, {
      name: 'Math',
      code: 'MAC2311',
    });
    assert.equal(first.code, exact);
    assert.equal((await createCourse(student, { name: 'None' })).code, null);

    await updateCourseField(student, first.id, 'code', 'CEN 4010-b');
    const edited = await updateCourseField(
      student,
      first.id,
      'instructor',
      'Professor Revised',
    );
    assert.equal(edited.code, 'CEN 4010-b');
    assert.equal(edited.instructor, 'Professor Revised');
    assert.equal(edited.name, 'Engineering');
    assert.deepEqual(edited.meetings, meetings);
    assert.equal((await findCourse(student, second.id))?.code, 'MAC2311');

    assert.equal(
      (await updateCourseField(student, second.id, 'code', '')).code,
      '',
    );
    assert.equal(
      (await updateCourseField(student, second.id, 'instructor', null))
        .instructor,
      null,
    );
  },
);

test(
  'CM-05: semesters are trimmed, filtered per account and clearable',
  { skip: stack },
  async () => {
    const student = await account();
    const fall = await createCourse(student, {
      name: 'Engineering',
      code: 'CEN4010',
      semester: ' Fall 2026 ',
      meetings,
    });
    await createCourse(student, { name: 'Math', semester: 'Spring 2027' });
    await createCourse(student, { name: 'Unassigned', semester: '  ' });
    const names = async (semester: string) =>
      (await listCourses(student, semester)).map((course) => course.name);

    assert.equal(fall.semester, 'Fall 2026');
    assert.deepEqual(await names('Fall 2026'), ['Engineering']);
    assert.deepEqual(await names('Unknown'), []);
    assert.deepEqual(await listCourses(await account(), 'Fall 2026'), []);

    const moved = await updateCourseField(
      student,
      fall.id,
      'semester',
      'Spring 2027',
    );
    assert.equal(moved.code, 'CEN4010');
    assert.equal(moved.meetings.length, 1);
    assert.deepEqual(await names('Fall 2026'), []);
    assert.equal((await names('Spring 2027')).length, 2);

    assert.equal(
      (await updateCourseField(student, fall.id, 'semester', ' ')).semester,
      null,
    );
    assert.equal((await names('Spring 2027')).length, 1);
  },
);
