import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCourse,
  findCourse,
  updateCourse,
} from '../src/web/features/courses/course-api.js';
import { account, stack } from './support/supabase.js';

test(
  'CM-09: details show each recorded field and leave unset fields empty',
  { skip: stack },
  async () => {
    const student = await account();
    const meetings = [
      { day: 'thu' as const, startTime: '11:00', endTime: '12:15' },
    ];
    const full = await createCourse(student, {
      name: 'Software Engineering',
      code: 'CEN4010',
      instructor: 'Dr. Lee',
      semester: 'Fall 2026',
      meetings,
    });
    await updateCourse(student, full.id, {
      ...full,
      location: 'EE 96',
      notes: 'Bring laptop\nTeam project',
    });
    const empty = await createCourse(student, { name: 'Elective' });

    assert.deepEqual(await findCourse(student, full.id), {
      id: full.id,
      name: 'Software Engineering',
      code: 'CEN4010',
      instructor: 'Dr. Lee',
      semester: 'Fall 2026',
      location: 'EE 96',
      notes: 'Bring laptop\nTeam project',
      meetings,
    });
    // Unset fields stay empty instead of borrowing another course's values.
    assert.deepEqual(await findCourse(student, empty.id), {
      id: empty.id,
      name: 'Elective',
      code: null,
      instructor: null,
      semester: null,
      location: null,
      notes: null,
      meetings: [],
    });
    assert.equal(await findCourse(await account(), full.id), null);
  },
);
