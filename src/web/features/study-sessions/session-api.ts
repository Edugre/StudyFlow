import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { isDate, isTime } from '../../../shared/dates.js';
import type { StudySession } from '../../../shared/study-session.js';
import { courseLink, failLinked, isId } from '../../lib/linked-course.js';

/**
 * Study session data access (SP-01) with course links (CM-10, SP-02),
 * rescheduling (SP-04), durations (SP-05), objectives (SP-06) and task
 * links (SP-03). Ownership is enforced by row level security.
 */
type Row = {
  id: string;
  course_id: string | null;
  starts_on: string;
  start_time: string;
  duration_minutes: number;
  objective: string | null;
  assignment_id: string | null;
};
const columns =
  'id, course_id, starts_on, start_time, duration_minutes, objective, assignment_id';
const toSession = (row: Row): StudySession => ({
  id: row.id,
  courseId: row.course_id,
  date: row.starts_on,
  startTime: row.start_time.slice(0, 5),
  durationMinutes: row.duration_minutes,
  objective: row.objective,
  assignmentId: row.assignment_id,
});
export const taskCourseError =
  "This task belongs to another course. Give the session the task's course, or no course.";

/**
 * The database reports a task the student can't see (another student's, or
 * deleted) as P0002, and a course that disagrees with the task's as P0001.
 */
function fail(error: PostgrestError): never {
  if (error.code === 'P0002') throw new Error('Task not found');
  if (error.code === 'P0001') throw new Error(taskCourseError);
  failLinked(error, 'study session details');
}

/** A task link is either absent (null) or a well-formed task id. */
function taskLink(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (!isId(value)) throw new Error('Task not found');
  return value;
}

export const sessionError =
  'Enter a valid date, a start time (HH:MM) and a duration of 1–1440 minutes.';

/** A whole number of minutes from 1 through 1440 (one day). */
const isDuration = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 1 &&
  (value as number) <= 1440;

function schedule(input: Record<string, unknown>) {
  const { date, startTime, durationMinutes } = input;
  if (!isDate(date) || !isTime(startTime) || !isDuration(durationMinutes))
    throw new Error(sessionError);
  return {
    starts_on: date,
    start_time: startTime,
    duration_minutes: durationMinutes,
  };
}

export const objectiveError = 'Keep the objective to 500 characters or fewer.';

/** An optional objective; blank means none. The database trims it too. */
function objective(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > 500)
    throw new Error(objectiveError);
  return value.trim() || null;
}

// Arguments are validated before touching the client so bad input never leaves the browser.
export async function createStudySession(
  client: SupabaseClient,
  input: Record<string, unknown>,
) {
  const row = {
    ...schedule(input),
    course_id: courseLink(input.courseId),
    objective: objective(input.objective),
    assignment_id: taskLink(input.assignmentId),
  };
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

/** Updates only the given columns of one session; nothing is duplicated. */
async function updateStudySession(
  client: SupabaseClient,
  id: string,
  update: Partial<Omit<Row, 'id'>>,
) {
  if (!isId(id)) throw new Error('Study session not found');
  const { data, error } = await client
    .from('study_sessions')
    .update(update)
    .eq('id', id)
    .select(columns);
  if (error) fail(error);
  const [row] = data as Row[];
  if (!row) throw new Error('Study session not found');
  return toSession(row);
}

/** Links the session to another course, or unlinks it with null. */
export async function setStudySessionCourse(
  client: SupabaseClient,
  id: string,
  courseId: unknown,
) {
  return updateStudySession(client, id, { course_id: courseLink(courseId) });
}

export const rescheduleError = 'Enter a valid date and a start time (HH:MM).';

/**
 * SP-04: moves the session to a new date and start time in place, so no
 * copy remains at the old time. Its duration and course stay as saved.
 * Invalid input is rejected before the request, so the saved time stays.
 */
export async function setStudySessionSchedule(
  client: SupabaseClient,
  id: string,
  input: Record<string, unknown>,
) {
  const { date, startTime } = input;
  if (!isDate(date) || !isTime(startTime)) throw new Error(rescheduleError);
  return updateStudySession(client, id, {
    starts_on: date,
    start_time: startTime,
  });
}

export const durationError = 'Enter a duration of 1–1440 whole minutes.';

/**
 * SP-05: changes only the session's intended duration. Zero, negative,
 * fractional and non-numeric values are rejected before the request, so the
 * saved duration stays.
 */
export async function setStudySessionDuration(
  client: SupabaseClient,
  id: string,
  durationMinutes: unknown,
) {
  if (!isDuration(durationMinutes)) throw new Error(durationError);
  return updateStudySession(client, id, { duration_minutes: durationMinutes });
}

/**
 * SP-06: sets, replaces or (when blank) clears the session's objective.
 * Its date, time, duration and course stay as saved.
 */
export async function setStudySessionObjective(
  client: SupabaseClient,
  id: string,
  value: unknown,
) {
  return updateStudySession(client, id, { objective: objective(value) });
}

/**
 * SP-03: links the session to one of the student's tasks, or unlinks it with
 * null. When both have a course, they must agree, or the link is rejected.
 */
export async function setStudySessionTask(
  client: SupabaseClient,
  id: string,
  assignmentId: unknown,
) {
  return updateStudySession(client, id, {
    assignment_id: taskLink(assignmentId),
  });
}
