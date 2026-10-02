import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export function courseStore(db: DatabaseSync) {
  return {
    create(ownerId: string, name: string, code: string | null = null) {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO courses(id, owner_id, name, code) VALUES (?, ?, ?, ?)',
      ).run(id, ownerId, name, code);
      return { id, name, code, meetings: [] };
    },
    updateCode(ownerId: string, id: string, code: string | null) {
      return db
        .prepare(
          'UPDATE courses SET code = ? WHERE owner_id = ? AND id = ? RETURNING id, name, code',
        )
        .get(code, ownerId, id);
    },
    list(ownerId: string) {
      return db
        .prepare(
          'SELECT id, name, code FROM courses WHERE owner_id = ? ORDER BY rowid',
        )
        .all(ownerId);
    },
    find(ownerId: string, id: string) {
      return db
        .prepare(
          'SELECT id, name, code FROM courses WHERE owner_id = ? AND id = ?',
        )
        .get(ownerId, id);
    },
  };
}
