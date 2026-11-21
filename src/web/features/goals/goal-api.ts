import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { isDate } from '../../../shared/dates.js';
import type { Goal } from '../../../shared/goal.js';
import { courseLink, isId } from '../../lib/linked-course.js';

/**
 * Academic goal data access (GP-01) with target dates (GP-02), course
 * links (GP-03) and progress (GP-04). Ownership is enforced by row level security.
 */
type Row = {
  id: string;
  title: string;
  message: string;
  target_date: string | null;
  course_id: string | null;
  progress: number;
  created_at: string;
};
const columns =
  'id, title, message, target_date, course_id, progress, created_at';
const toGoal = (row: Row): Goal => ({
  id: row.id,
  title: row.title,
  message: row.message,
  targetDate: row.target_date,
  courseId: row.course_id,
  progress: row.progress,
  createdAt: row.created_at,
});

/**
 * Row level security rejects links to courses the student does not own
 * (42501), and a deleted course fails the foreign key (23503); both read as
 * a missing course.
 */
function fail(error: PostgrestError, action: string): never {
  if (error.code === '42501' || error.code === '23503')
    throw new Error('Course not found');
  if (
    error.code === '23514' ||
    error.code === '22007' ||
    error.code === '22008'
  )
    throw new Error('Check the goal details and try again.');
  throw new Error(`Unable to ${action}.`);
}

/**
 * The signed-in student's goals, newest first: all of them, or (GP-03) only
 * those linked to one course.
 */
export async function listGoals(client: SupabaseClient, courseId?: string) {
  let query = client
    .from('goals')
    .select(columns)
    .order('created_at', { ascending: false });
  if (courseId !== undefined) {
    if (!isId(courseId)) return [];
    query = query.eq('course_id', courseId);
  }
  const { data, error } = await query.overrideTypes<Row[]>();
  if (error) fail(error, 'load goals');
  return data.map(toGoal);
}

/** GP-01: reopens one of the student's goals, or null if it isn't theirs. */
export async function findGoal(client: SupabaseClient, id: string) {
  if (!isId(id)) return null;
  const { data, error } = await client
    .from('goals')
    .select(columns)
    .eq('id', id)
    .maybeSingle<Row>();
  if (error) fail(error, 'load goals');
  return data ? toGoal(data) : null;
}

export const targetDateError = 'Enter a valid target date.';

/** GP-02: an optional target date; blank means none. */
function targetDate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (!isDate(value)) throw new Error(targetDateError);
  return value;
}

// Arguments are validated before touching the client so bad input never leaves the browser.
export async function createGoal(
  client: SupabaseClient,
  input: Record<string, unknown>,
) {
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 120
  )
    throw new Error('Enter a goal title of 1–120 characters.');
  if (
    typeof input.message !== 'string' ||
    !input.message.trim() ||
    input.message.length > 500
  )
    throw new Error('Enter a goal message of 1–500 characters.');

  const row = {
    title: input.title.trim(),
    message: input.message.trim(),
    target_date: targetDate(input.targetDate),
    course_id: courseLink(input.courseId),
  };
  const { data, error } = await client
    .from('goals')
    .insert(row)
    .select(columns)
    .single<Row>();
  if (error) fail(error, 'create goal');
  return toGoal(data);
}

/** Updates only the given columns of one goal; nothing is duplicated. */
async function updateGoal(
  client: SupabaseClient,
  id: string,
  update: Partial<Omit<Row, 'id' | 'created_at'>>,
) {
  if (!isId(id)) throw new Error('Goal not found');
  const { data, error } = await client
    .from('goals')
    .update(update)
    .eq('id', id)
    .select(columns);
  if (error) fail(error, 'save goal');
  const [row] = data as Row[];
  if (!row) throw new Error('Goal not found');
  return toGoal(row);
}

/**
 * GP-02: sets, replaces or (when blank) clears the goal's target date. An
 * invalid date is rejected before the request, so the saved date stays.
 */
export async function setGoalTargetDate(
  client: SupabaseClient,
  id: string,
  value: unknown,
) {
  return updateGoal(client, id, { target_date: targetDate(value) });
}

/** GP-03: links the goal to another course, or unlinks it with null. */
export async function setGoalCourse(
  client: SupabaseClient,
  id: string,
  courseId: unknown,
) {
  return updateGoal(client, id, { course_id: courseLink(courseId) });
}

export const progressError = 'Enter progress as a whole number from 0 to 100.';

/**
 * GP-04: saves the goal's progress as a whole percentage from 0 through 100.
 * Nonnumeric, fractional or out-of-range values are rejected before the
 * request, so the saved percentage stays.
 */
export async function setGoalProgress(
  client: SupabaseClient,
  id: string,
  progress: unknown,
) {
  if (
    !Number.isInteger(progress) ||
    (progress as number) < 0 ||
    (progress as number) > 100
  )
    throw new Error(progressError);
  return updateGoal(client, id, { progress: progress as number });
}

export async function deleteGoal(client: SupabaseClient, id: string) {
  if (!isId(id)) return false;
  const { data, error } = await client
    .from('goals')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) fail(error, 'delete goal');
  return data.length > 0;
}
