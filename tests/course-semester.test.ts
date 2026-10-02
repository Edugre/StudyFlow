import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testProject } from './support/project.js';

test('CM-05: semester assignment persists and filtering returns only owned matching courses', async () => {
  const project = await testProject();
  const { request, account } = project;
  try {
    const cookie = await account('terms@example.com');
    const other = await account('other@example.com');
    const create = async (semester: string, session = cookie) =>
      (
        await (
          await request('/courses', session, {
            name: 'Engineering',
            code: 'CEN4010',
            instructor: 'Dr. A',
            semester,
            meetings: [{ day: 'mon', startTime: '09:00', endTime: '10:00' }],
          })
        ).json()
      ).course;
    const fall = await create('Fall 2026');
    const spring = await create('Spring 2027');
    await create('Fall 2026', other);
    const filter = async (semester: string) =>
      (
        await (
          await request(
            '/courses?semester=' + encodeURIComponent(semester),
            cookie,
          )
        ).json()
      ).courses;
    assert.deepEqual(
      (await filter('Fall 2026')).map((course: { id: string }) => course.id),
      [fall.id],
    );
    assert.deepEqual(
      (await filter('Spring 2027')).map((course: { id: string }) => course.id),
      [spring.id],
    );
    assert.deepEqual(await filter('Unknown semester'), []);
    const route = `/courses/${fall.id}/semester`;
    assert.equal(
      (await request(route, cookie, { semester: 'Spring 2027' })).status,
      200,
    );
    assert.deepEqual(await filter('Fall 2026'), []);
    assert.equal((await filter('Spring 2027')).length, 2);
    assert.equal(
      (await request(route, other, { semester: 'Attacker' })).status,
      404,
    );
    assert.equal(
      (await request(route, '', { semester: 'Attacker' })).status,
      401,
    );
    assert.equal(
      (await request(route, cookie, { semester: 2026 })).status,
      400,
    );
    assert.equal(
      (await request(route, cookie, { semester: 'x'.repeat(101) })).status,
      400,
    );
    assert.equal(
      (await request('/courses?semester=Fall&semester=Spring', cookie)).status,
      400,
    );
    await project.restart();
    const saved = (await (await request(`/courses/${fall.id}`, cookie)).json())
      .course;
    assert.equal(saved.semester, 'Spring 2027');
    assert.equal(saved.code, 'CEN4010');
    assert.equal(saved.instructor, 'Dr. A');
    assert.equal(saved.meetings.length, 1);
    assert.equal((await request(route, cookie, { semester: ' ' })).status, 200);
    assert.equal(
      (await (await request(`/courses/${fall.id}`, cookie)).json()).course
        .semester,
      null,
    );
    assert.equal((await filter('Spring 2027')).length, 1);
  } finally {
    await project.dispose();
  }
});
