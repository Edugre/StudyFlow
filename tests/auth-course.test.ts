import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/server/app.js';
import { openDatabase } from '../src/server/db/database.js';
import { digest } from '../src/server/features/auth/auth.js';

test('CM-01: authentication, validation, reopening, isolation and session revocation', async () => {
  const db = openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api`;
  const request = (
    path: string,
    cookie = '',
    body?: unknown,
    protectedRequest = true,
  ) =>
    fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...(protectedRequest ? { 'X-StudyFlow-Request': '1' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const password = 'a-long-test-password';
  try {
    assert.equal((await request('/courses', '', { name: 'Math' })).status, 401);
    assert.equal(
      (await request('/auth/register', '', { email: 'bad', password })).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/auth/register',
          '',
          { email: 'a@example.com', password },
          false,
        )
      ).status,
      403,
    );
    const first = await request('/auth/register', '', {
      email: ' A@example.com ',
      password,
    });
    assert.equal(first.status, 201);
    const cookie = first.headers.get('set-cookie')!.split(';')[0]!;
    assert.match(first.headers.get('set-cookie')!, /HttpOnly/);
    assert.match(first.headers.get('set-cookie')!, /SameSite=Strict/i);
    assert.equal(
      (
        await request('/auth/register', '', {
          email: 'a@example.com',
          password,
        })
      ).status,
      409,
    );
    const hash = String(
      db.prepare('SELECT password_hash FROM users').get()?.password_hash,
    );
    assert(!hash.includes(password));
    assert.equal(
      (
        await request('/auth/login', '', {
          email: 'a@example.com',
          password: 'incorrect-password',
        })
      ).status,
      401,
    );
    assert.equal(
      (await request('/courses', cookie, { name: '  ' })).status,
      400,
    );
    const created = await request('/courses', cookie, {
      name: 'Software Engineering',
      owner_id: 'attacker',
    });
    assert.equal(created.status, 201);
    const { course } = await created.json();
    assert.equal(
      (await (await request('/courses', cookie)).json()).courses.length,
      1,
    );
    assert.equal(
      (await (await request(`/courses/${course.id}`, cookie)).json()).course
        .name,
      'Software Engineering',
    );
    const second = await request('/auth/register', '', {
      email: 'b@example.com',
      password,
    });
    const other = second.headers.get('set-cookie')!.split(';')[0]!;
    assert.equal((await request(`/courses/${course.id}`, other)).status, 404);
    assert.deepEqual(
      (await (await request('/courses', other)).json()).courses,
      [],
    );
    assert.equal((await request('/auth/logout', cookie, {})).status, 200);
    assert.equal((await request('/courses', cookie)).status, 401);
    const login = await request('/auth/login', '', {
      email: 'a@example.com',
      password,
    });
    assert.equal(login.status, 200);
    const fresh = login.headers.get('set-cookie')!.split(';')[0]!;
    assert.notEqual(fresh, cookie);
    assert.equal(
      (await (await request('/courses', fresh)).json()).courses.length,
      1,
    );
    db.prepare('UPDATE sessions SET expires_at = 0 WHERE token_hash = ?').run(
      digest(fresh.split('=')[1]!),
    );
    assert.equal((await request('/courses', fresh)).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});

test('authentication attempts are limited without preventing sign-out', async () => {
  const db = openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/auth`;
  const post = (path: string) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-StudyFlow-Request': '1',
      },
      body: '{}',
    });
  try {
    for (let i = 0; i < 30; i++)
      assert.equal((await post('/login')).status, 400);
    assert.equal((await post('/login')).status, 429);
    assert.equal((await post('/logout')).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
