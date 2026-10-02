import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const schema = `
CREATE TABLE courses (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL CHECK(length(trim(owner_id)) > 0),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  code TEXT,
  instructor TEXT,
  semester TEXT,
  location TEXT,
  notes TEXT
) STRICT;
CREATE INDEX courses_owner_semester ON courses(owner_id, semester);
CREATE TABLE course_meetings (
  id INTEGER PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day TEXT NOT NULL CHECK(day IN ('mon','tue','wed','thu','fri','sat','sun')),
  start_time TEXT NOT NULL CHECK(start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND start_time < '24:00'),
  end_time TEXT NOT NULL CHECK(end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND end_time < '24:00'),
  CHECK(end_time > start_time)
) STRICT;
PRAGMA user_version = 1;
`;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = db.prepare('PRAGMA user_version').get()?.user_version;
    if (version === 0) {
      db.exec('BEGIN');
      try {
        db.exec(schema);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } else if (version !== 1) {
      throw new Error('Unsupported database schema version');
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
