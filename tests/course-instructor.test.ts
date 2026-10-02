import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testProject } from './support/project.js';

test('CM-03: instructor editing persists and changes only the owned selected course', async () => {
  const project = await testProject();
  const { request, account } = project;
  try {
    const cookie = await account('student@example.com');
    const other = await account('other@example.com');
    const create = async (name: string, instructor: string) =>
      (
        await (
          await request('/courses', cookie, {
            name,
            code: 'CEN4010',
            instructor,
          })
        ).json()
      ).course;
    const first = await create('Engineering', 'Dr. First');
    const second = await create('Math', 'Dr. Second');
    const route = `/courses/${first.id}/instructor`;
    assert.equal(
      (await request(route, cookie, { instructor: 'Professor Revised' }))
        .status,
      200,
    );
    assert.equal(
      (await request(route, other, { instructor: 'Attacker' })).status,
      404,
    );
    assert.equal(
      (await request(route, '', { instructor: 'Attacker' })).status,
      401,
    );
    assert.equal(
      (await request(route, cookie, { instructor: 42 })).status,
      400,
    );
    await project.restart();
    const saved = (await (await request(`/courses/${first.id}`, cookie)).json())
      .course;
    assert.equal(saved.instructor, 'Professor Revised');
    assert.equal(saved.name, 'Engineering');
    assert.equal(saved.code, 'CEN4010');
    assert.equal(
      (await (await request(`/courses/${second.id}`, cookie)).json()).course
        .instructor,
      'Dr. Second',
    );
    assert.equal(
      (await request(route, cookie, { instructor: '' })).status,
      200,
    );
    assert.equal(
      (await (await request(`/courses/${first.id}`, cookie)).json()).course
        .instructor,
      '',
    );
  } finally {
    await project.dispose();
  }
});
