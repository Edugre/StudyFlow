import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { isDate } from '../../../shared/dates.js';
import type { Goal } from '../../../shared/goal.js';
import { isId } from '../../lib/linked-course.js';

/**
 * Academic goal data access (GP-01) with target dates (GP-02). Ownership is
 * enforced by row level security.
 */
type Row = {
  id: string;
  title: string;
  message: string;
  target_date: string | null;
  created_at: string;
};
const columns = 'id, title, message, target_date, created_at';
const toGoal = (row: Row): Goal => ({
  id: row.id,
  title: row.title,
  message: row.message,
  targetDate: row.target_date,
  createdAt: row.created_at,
});

function fail(error: PostgrestError, action: string): never {
  if (
    error.code === '23514' ||
    error.code === '22007' ||
    error.code === '22008'
  )
    throw new Error('Check the goal details and try again.');
  throw new Error(`Unable to ${action}.`);
}

/** Retrieves signed-in student's goals, newest first. */
export async function listGoals(client: SupabaseClient) {
  const { data, error } = await client
    .from('goals')
    .select(columns)
    .order('created_at', { ascending: false })
    .overrideTypes<Row[]>();
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
