import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testProject } from './support/project.js';

test('CM-04: every meeting persists and invalid schedules do not replace saved values', async () => {
  const project = await testProject();
  const { request, account } = project;
  try {
    const cookie = await account('schedule@example.com');
    const other = await account('other@example.com');
    const meetings = [
      { day: 'mon', startTime: '09:00', endTime: '10:15' },
      { day: 'wed', startTime: '13:00', endTime: '14:00' },
    ];
    const first = (
      await (
        await request('/courses', cookie, {
          name: 'Engineering',
          code: 'CEN4010',
          instructor: 'Dr. A',
          meetings,
        })
      ).json()
    ).course;
    assert.deepEqual(first.meetings, meetings);
    const second = (
      await (await request('/courses', cookie, { name: 'Math' })).json()
    ).course;
    const route = `/courses/${first.id}/meetings`;
    const revised = [
      ...meetings,
      { day: 'fri', startTime: '08:00', endTime: '09:00' },
    ];
    assert.equal(
      (await request(route, cookie, { meetings: revised })).status,
      200,
    );
    for (const invalid of [
      [{ day: 'mon', startTime: '10:00', endTime: '10:00' }],
      [{ day: 'mon', startTime: '11:00', endTime: '10:00' }],
      [{ day: 'bad', startTime: '09:00', endTime: '10:00' }],
      [{ day: 'mon', startTime: '24:00', endTime: '25:00' }],
      [{ day: 'mon', startTime: '9:00', endTime: '10:00' }],
      [{ day: 'mon', startTime: '', endTime: '10:00' }],
      null,
      [null],
      {},
    ]) {
      assert.equal(
        (await request(route, cookie, { meetings: invalid })).status,
        400,
      );
      assert.deepEqual(
        (await (await request(`/courses/${first.id}`, cookie)).json()).course
          .meetings,
        revised,
      );
    }
    assert.equal((await request(route, other, { meetings: [] })).status, 404);
    assert.equal((await request(route, '', { meetings: [] })).status, 401);
    const before = (await (await request('/courses', cookie)).json()).courses
      .length;
    assert.equal(
      (
        await request('/courses', cookie, {
          name: 'Invalid',
          meetings: [{ day: 'mon', startTime: '10:00', endTime: '09:00' }],
        })
      ).status,
      400,
    );
    assert.equal(
      (await (await request('/courses', cookie)).json()).courses.length,
      before,
    );
    await request(`/courses/${first.id}/code`, cookie, { code: 'Updated' });
    await request(`/courses/${first.id}/instructor`, cookie, {
      instructor: 'Dr. Revised',
    });
    await project.restart();
    const saved = (await (await request(`/courses/${first.id}`, cookie)).json())
      .course;
    assert.deepEqual(saved.meetings, revised);
    assert.equal(saved.code, 'Updated');
    assert.equal(saved.instructor, 'Dr. Revised');
    assert.deepEqual(
      (await (await request(`/courses/${second.id}`, cookie)).json()).course
        .meetings,
      [],
    );
    assert.equal((await request(route, cookie, { meetings: [] })).status, 200);
    assert.deepEqual(
      (await (await request(`/courses/${first.id}`, cookie)).json()).course
        .meetings,
      [],
    );
  } finally {
    await project.dispose();
  }
});
