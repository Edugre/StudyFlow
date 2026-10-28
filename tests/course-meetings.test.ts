import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCourse,
  deleteCourse,
  findCourse,
  replaceMeetings,
  updateCourse,
} from '../src/web/features/courses/course-api.js';
import { account, stack } from './support/supabase.js';

const meetings = [
  { day: 'mon' as const, startTime: '09:00', endTime: '10:15' },
  { day: 'wed' as const, startTime: '09:00', endTime: '10:15' },
];

test(
  'CM-04: schedules are replaced atomically and only by their owner',
  { skip: stack },
  async () => {
    const student = await account();
    const course = await createCourse(student, { name: 'Physics', meetings });
    assert.deepEqual(course.meetings, meetings);

    const revised = [
      { day: 'fri' as const, startTime: '14:00', endTime: '15:30' },
    ];
    assert.deepEqual(
      (await replaceMeetings(student, course.id, revised)).meetings,
      revised,
    );
    // The database rejects a bad row even if client validation is bypassed.
    const bypass = await student.rpc('replace_course_meetings', {
      p_course_id: course.id,
      p_meetings: [
        ...meetings,
        { day: 'tue', startTime: '11:00', endTime: '10:00' },
      ],
    });
    assert(bypass.error);
    assert.deepEqual((await findCourse(student, course.id))?.meetings, revised);

    const other = await account();
    await assert.rejects(
      replaceMeetings(other, course.id, []),
      /Course not found/,
    );
    assert.deepEqual(
      (await replaceMeetings(student, course.id, [])).meetings,
      [],
    );
  },
);

test(
  'CM-06/07: full edits keep ownership; deletes cascade to meetings',
  { skip: stack },
  async () => {
    const student = await account();
    const course = await createCourse(student, {
      name: 'Chemistry',
      code: 'CHM1045',
      semester: 'Fall 2026',
      meetings,
    });
    const edited = await updateCourse(student, course.id, {
      name: ' Organic Chemistry ',
      code: 'CHM2210',
      instructor: 'Dr. B',
      semester: 'Spring 2027',
      location: 'Room 101',
      notes: 'Bring goggles',
      meetings: meetings.slice(0, 1),
    });
    assert.deepEqual(
      [
        edited.name,
        edited.code,
        edited.instructor,
        edited.semester,
        edited.location,
        edited.notes,
        edited.meetings.length,
      ],
      [
        'Organic Chemistry',
        'CHM2210',
        'Dr. B',
        'Spring 2027',
        'Room 101',
        'Bring goggles',
        1,
      ],
    );

    const other = await account();
    await assert.rejects(
      updateCourse(other, course.id, { name: 'Hijacked' }),
      /Course not found/,
    );
    assert.equal(await deleteCourse(other, course.id), false);

    assert.equal(await deleteCourse(student, course.id), true);
    assert.equal(await findCourse(student, course.id), null);
    assert.equal(await deleteCourse(student, course.id), false);
    const orphans = await student
      .from('course_meetings')
      .select('id')
      .eq('course_id', course.id);
    assert.deepEqual(orphans.data, []);
  },
);
