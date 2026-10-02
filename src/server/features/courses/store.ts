import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export function courseStore(db: DatabaseSync) {
  return {
    create(ownerId: string, name: string) {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO courses(id, owner_id, name) VALUES (?, ?, ?)',
      ).run(id, ownerId, name);
      return { id, name, meetings: [] };
    },
    list(ownerId: string) {
      return db
        .prepare(
          'SELECT id, name FROM courses WHERE owner_id = ? ORDER BY rowid',
        )
        .all(ownerId);
    },
    find(ownerId: string, id: string) {
      return db
        .prepare('SELECT id, name FROM courses WHERE owner_id = ? AND id = ?')
        .get(ownerId, id);
    },
  };
}
