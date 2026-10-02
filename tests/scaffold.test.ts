import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/server/app.js';
import { openDatabase } from '../src/server/db/database.js';

test('API health is available and course routes are not exposed before auth', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), {
      status: 'ok',
      service: 'studyflow',
    });
    assert.equal((await fetch(`${base}/api/courses`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('baseline persists across reopen; invalid names, owners, meetings and dangling links are rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'studyflow-'));
  const path = join(directory, 'test.sqlite');
  let db = openDatabase(path);
  try {
    const insert = db.prepare(
      'INSERT INTO courses(id, owner_id, name) VALUES (?, ?, ?)',
    );
    assert.throws(() => insert.run('bad', 'owner', ' '));
    assert.throws(() => insert.run('bad', '', 'Course'));
    insert.run('course', 'owner', 'Software Engineering');
    const meeting = db.prepare(
      'INSERT INTO course_meetings(course_id, day, start_time, end_time) VALUES (?, ?, ?, ?)',
    );
    assert.throws(() => meeting.run('missing', 'mon', '09:00', '10:00'));
    assert.throws(() => meeting.run('course', 'mon', '10:00', '09:00'));
    assert.throws(() => meeting.run('course', 'mon', '09:00', '09:00'));
    assert.throws(() => meeting.run('course', 'mon', '24:00', '25:00'));
    meeting.run('course', 'mon', '09:00', '10:00');
    db.close();
    db = openDatabase(path);
    assert.equal(
      db.prepare('SELECT name FROM courses WHERE id = ?').get('course')?.name,
      'Software Engineering',
    );
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM course_meetings').get()?.count,
      1,
    );
    db.prepare('DELETE FROM courses WHERE id = ?').run('course');
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM course_meetings').get()?.count,
      0,
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});
