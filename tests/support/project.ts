import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app.js';
import { openDatabase } from '../../src/server/db/database.js';

export async function testProject() {
  const directory = mkdtempSync(join(tmpdir(), 'studyflow-feature-'));
  const path = join(directory, 'test.sqlite');
  let db = openDatabase(path);
  let server = createApp(db).listen(0, '127.0.0.1');
  let base = '';
  async function ready() {
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}/api`;
  }
  await ready();
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
  const account = async (email: string) => {
    const response = await request('/auth/register', '', {
      email,
      password: 'a-fixture-password-long-enough',
    });
    assert.equal(response.status, 201);
    return response.headers.get('set-cookie')!.split(';')[0]!;
  };
  const close = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
  return {
    request,
    account,
    async restart() {
      await close();
      db.close();
      db = openDatabase(path);
      server = createApp(db).listen(0, '127.0.0.1');
      await ready();
    },
    async dispose() {
      await close();
      db.close();
      rmSync(directory, { recursive: true });
    },
  };
}
