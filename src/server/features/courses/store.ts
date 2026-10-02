import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CourseMeeting } from '../../../shared/course.js';

type Row = {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
};
export function courseStore(db: DatabaseSync) {
  const find = (ownerId: string, id: string) => {
    const row = db
      .prepare(
        'SELECT id, name, code, instructor FROM courses WHERE owner_id = ? AND id = ?',
      )
      .get(ownerId, id) as Row | undefined;
    if (!row) return undefined;
    const meetings = db
      .prepare(
        'SELECT day, start_time AS startTime, end_time AS endTime FROM course_meetings WHERE course_id = ? ORDER BY id',
      )
      .all(id) as unknown as CourseMeeting[];
    return { ...row, meetings };
  };
  const replaceMeetings = (id: string, meetings: CourseMeeting[]) => {
    db.prepare('DELETE FROM course_meetings WHERE course_id = ?').run(id);
    const insert = db.prepare(
      'INSERT INTO course_meetings(course_id, day, start_time, end_time) VALUES (?, ?, ?, ?)',
    );
    for (const meeting of meetings)
      insert.run(id, meeting.day, meeting.startTime, meeting.endTime);
  };
  return {
    create(
      ownerId: string,
      name: string,
      code: string | null = null,
      instructor: string | null = null,
      meetings: CourseMeeting[] = [],
    ) {
      const id = randomUUID();
      db.exec('BEGIN');
      try {
        db.prepare(
          'INSERT INTO courses(id, owner_id, name, code, instructor) VALUES (?, ?, ?, ?, ?)',
        ).run(id, ownerId, name, code, instructor);
        replaceMeetings(id, meetings);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return find(ownerId, id)!;
    },
    updateCode(ownerId: string, id: string, code: string | null) {
      db.prepare(
        'UPDATE courses SET code = ? WHERE owner_id = ? AND id = ?',
      ).run(code, ownerId, id);
      return find(ownerId, id);
    },
    updateInstructor(ownerId: string, id: string, instructor: string | null) {
      db.prepare(
        'UPDATE courses SET instructor = ? WHERE owner_id = ? AND id = ?',
      ).run(instructor, ownerId, id);
      return find(ownerId, id);
    },
    updateMeetings(ownerId: string, id: string, meetings: CourseMeeting[]) {
      if (!find(ownerId, id)) return undefined;
      db.exec('BEGIN');
      try {
        replaceMeetings(id, meetings);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return find(ownerId, id);
    },
    list(ownerId: string) {
      return db
        .prepare(
          'SELECT id, name, code, instructor FROM courses WHERE owner_id = ? ORDER BY rowid',
        )
        .all(ownerId);
    },
    find,
  };
}
