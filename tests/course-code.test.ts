import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/server/app.js';
import { openDatabase } from '../src/server/db/database.js';
import { courseStore } from '../src/server/features/courses/store.js';

test('CM-02: exact course codes persist independently through creation, editing and database reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'studyflow-codes-'));
  const path = join(directory, 'test.sqlite');
  let db = openDatabase(path);
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const request = (route: string, cookie = '', body?: unknown) =>
    fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-StudyFlow-Request': '1',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    const account = await request('/auth/register', '', {
      email: 'codes@example.com',
      password: 'test-password-long-enough',
    });
    const user = (await account.json()).user;
    const cookie = account.headers.get('set-cookie')!.split(';')[0]!;
    const exact = '  cen-4010 / A  ';
    const first = (
      await (
        await request('/courses', cookie, { name: 'Engineering', code: exact })
      ).json()
    ).course;
    const second = (
      await (
        await request('/courses', cookie, { name: 'Math', code: 'MAC2311' })
      ).json()
    ).course;
    assert.equal(first.code, exact);
    assert.equal(
      (await (await request(`/courses/${first.id}`, cookie)).json()).course
        .code,
      exact,
    );
    const updated = 'CEN 4010-b';
    assert.equal(
      (await request(`/courses/${first.id}/code`, cookie, { code: updated }))
        .status,
      200,
    );
    assert.equal(
      (await (await request(`/courses/${first.id}`, cookie)).json()).course
        .code,
      updated,
    );
    assert.equal(
      (await (await request(`/courses/${second.id}`, cookie)).json()).course
        .code,
      'MAC2311',
    );
    assert.equal(
      (await request(`/courses/${first.id}/code`, cookie, { code: 123 }))
        .status,
      400,
    );
    assert.equal(
      (await request('/courses', cookie, { name: 'Invalid', code: {} })).status,
      400,
    );
    assert.equal(
      (await request(`/courses/${first.id}/code`, '', { code: 'spoofed' }))
        .status,
      401,
    );
    const otherAccount = await request('/auth/register', '', {
      email: 'other@example.com',
      password: 'test-password-long-enough',
    });
    const other = otherAccount.headers.get('set-cookie')!.split(';')[0]!;
    assert.equal(
      (await request(`/courses/${first.id}/code`, other, { code: 'spoofed' }))
        .status,
      404,
    );
    assert.equal(
      (await (await request(`/courses/${first.id}`, cookie)).json()).course
        .code,
      updated,
    );
    assert.equal(
      (await request(`/courses/${second.id}/code`, cookie, { code: '' }))
        .status,
      200,
    );
    assert.equal(
      (await (await request(`/courses/${second.id}`, cookie)).json()).course
        .code,
      '',
    );
    const optional = (
      await (await request('/courses', cookie, { name: 'No code' })).json()
    ).course;
    assert.equal(optional.code, null);
    const list = (await (await request('/courses', cookie)).json()).courses;
    assert.equal(
      list.find((course: { id: string }) => course.id === first.id).code,
      updated,
    );
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    db = openDatabase(path);
    assert.equal(courseStore(db).find(user.id, first.id)?.code, updated);
    assert.equal(courseStore(db).find(user.id, second.id)?.code, '');
    assert.equal(courseStore(db).find(user.id, optional.id)?.code, null);
  } finally {
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    rmSync(directory, { recursive: true });
  }
});
