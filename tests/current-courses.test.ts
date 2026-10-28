import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCourse,
  listCourses,
} from '../src/web/features/courses/course-api.js';
import {
  getCurrentSemester,
  setCurrentSemester,
} from '../src/web/features/courses/settings-api.js';
import { account, stack } from './support/supabase.js';

test(
  'CM-08: the chosen current semester lists its courses once each',
  { skip: stack },
  async () => {
    const student = await account();
    assert.equal(await getCurrentSemester(student), null);
    await createCourse(student, { name: 'Engineering', semester: 'Fall 2026' });
    await createCourse(student, { name: 'Physics', semester: 'Fall 2026' });
    await createCourse(student, { name: 'Math', semester: 'Spring 2027' });

    assert.equal(await setCurrentSemester(student, ' Fall 2026 '), 'Fall 2026');
    const current = await getCurrentSemester(student);
    assert.equal(current, 'Fall 2026');
    const names = (await listCourses(student, current!)).map((c) => c.name);
    assert.deepEqual(names, ['Engineering', 'Physics']);

    // Changing it replaces the single saved choice.
    assert.equal(
      await setCurrentSemester(student, 'Summer 2027'),
      'Summer 2027',
    );
    assert.deepEqual(await listCourses(student, 'Summer 2027'), []);
    assert.equal(await setCurrentSemester(student, '  '), null);
    assert.equal(await getCurrentSemester(student), null);
  },
);

test(
  'CM-08: current semesters are private to each student',
  { skip: stack },
  async () => {
    const first = await account();
    const second = await account();
    await setCurrentSemester(first, 'Fall 2026');
    await createCourse(first, { name: 'Engineering', semester: 'Fall 2026' });

    assert.equal(await getCurrentSemester(second), null);
    await setCurrentSemester(second, 'Spring 2027');
    assert.equal(await getCurrentSemester(first), 'Fall 2026');
    assert.deepEqual(await listCourses(second, 'Fall 2026'), []);
    await assert.rejects(
      setCurrentSemester(first, 'x'.repeat(101)),
      /at most 100 characters/,
    );
  },
);
