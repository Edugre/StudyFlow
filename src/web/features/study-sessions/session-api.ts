import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { isDate, isTime } from '../../../shared/dates.js';
import type { StudySession } from '../../../shared/study-session.js';
import { courseLink, failLinked, isId } from '../../lib/linked-course.js';

/**
 * Minimal study session data access (SP-01) with course links (CM-10, SP-02).
 * Ownership is enforced by row level security, as for courses.
 */
type Row = {
  id: string;
  course_id: string | null;
  starts_on: string;
  start_time: string;
  duration_minutes: number;
};
const columns = 'id, course_id, starts_on, start_time, duration_minutes';
const toSession = (row: Row): StudySession => ({
  id: row.id,
  courseId: row.course_id,
  date: row.starts_on,
  startTime: row.start_time.slice(0, 5),
  durationMinutes: row.duration_minutes,
});
function fail(error: PostgrestError): never {
  failLinked(error, 'study session details');
}

export const sessionError =
  'Enter a valid date, a start time (HH:MM) and a duration of 1–1440 minutes.';

function schedule(input: Record<string, unknown>) {
  const { date, startTime, durationMinutes } = input;
  if (
    !isDate(date) ||
    !isTime(startTime) ||
    !Number.isInteger(durationMinutes) ||
    (durationMinutes as number) < 1 ||
    (durationMinutes as number) > 1440
  )
    throw new Error(sessionError);
  return {
    starts_on: date,
    start_time: startTime,
    duration_minutes: durationMinutes as number,
  };
}

// Arguments are validated before touching the client so bad input never leaves the browser.
export async function createStudySession(
  client: SupabaseClient,
  input: Record<string, unknown>,
) {
  const row = { ...schedule(input), course_id: courseLink(input.courseId) };
  const { data, error } = await client
    .from('study_sessions')
    .insert(row)
    .select(columns)
    .single<Row>();
  if (error) fail(error);
  return toSession(data);
}

/** All of the student's sessions, or only those linked to one course. */
export async function listStudySessions(
  client: SupabaseClient,
  courseId?: string,
) {
  let query = client
    .from('study_sessions')
    .select(columns)
    .order('starts_on')
    .order('start_time')
    .order('created_at');
  if (courseId !== undefined) {
    if (!isId(courseId)) return [];
    query = query.eq('course_id', courseId);
  }
  const { data, error } = await query.overrideTypes<Row[]>();
  if (error) fail(error);
  return data.map(toSession);
}

export async function findStudySession(client: SupabaseClient, id: string) {
  if (!isId(id)) return null;
  const { data, error } = await client
    .from('study_sessions')
    .select(columns)
    .eq('id', id)
    .maybeSingle<Row>();
  if (error) fail(error);
  return data ? toSession(data) : null;
}

/** Links the session to another course, or unlinks it with null. */
export async function setStudySessionCourse(
  client: SupabaseClient,
  id: string,
  courseId: unknown,
) {
  const course_id = courseLink(courseId);
  if (!isId(id)) throw new Error('Study session not found');
  const { data, error } = await client
    .from('study_sessions')
    .update({ course_id })
    .eq('id', id)
    .select(columns);
  if (error) fail(error);
  const [row] = data as Row[];
  if (!row) throw new Error('Study session not found');
  return toSession(row);
}
