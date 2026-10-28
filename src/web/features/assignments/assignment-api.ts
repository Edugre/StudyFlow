import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  taskKinds,
  type Assignment,
  type TaskKind,
} from '../../../shared/assignment.js';
import { courseLink, failLinked, isId } from '../../lib/linked-course.js';

/**
 * Assignment data access (AT-01) with course links (CM-10, AT-02) and
 * task types (AT-04). Ownership is enforced by row level security.
 */
type Row = {
  id: string;
  title: string;
  course_id: string | null;
  kind: TaskKind;
};
const columns = 'id, title, course_id, kind';
const toAssignment = (row: Row): Assignment => ({
  id: row.id,
  title: row.title,
  courseId: row.course_id,
  kind: row.kind,
});
function fail(error: PostgrestError): never {
  failLinked(error, 'assignment details');
}

function title(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new Error('Enter an assignment title of 1–200 characters.');
  return value;
}

/** A missing type means a plain assignment. */
function kind(value: unknown = 'assignment') {
  if (!taskKinds.includes(value as TaskKind))
    throw new Error('Choose assignment, exam, quiz, or project.');
  return value as TaskKind;
}

// Arguments are validated before touching the client so bad input never leaves the browser.
export async function createAssignment(
  client: SupabaseClient,
  input: Record<string, unknown>,
) {
  const row = {
    title: title(input.title),
    course_id: courseLink(input.courseId),
    kind: kind(input.kind),
  };
  const { data, error } = await client
    .from('assignments')
    .insert(row)
    .select(columns)
    .single<Row>();
  if (error) fail(error);
  return toAssignment(data);
}

/** All of the student's assignments, or only those linked to one course. */
export async function listAssignments(
  client: SupabaseClient,
  courseId?: string,
) {
  let query = client.from('assignments').select(columns).order('created_at');
  if (courseId !== undefined) {
    if (!isId(courseId)) return [];
    query = query.eq('course_id', courseId);
  }
  const { data, error } = await query.overrideTypes<Row[]>();
  if (error) fail(error);
  return data.map(toAssignment);
}

export async function findAssignment(client: SupabaseClient, id: string) {
  if (!isId(id)) return null;
  const { data, error } = await client
    .from('assignments')
    .select(columns)
    .eq('id', id)
    .maybeSingle<Row>();
  if (error) fail(error);
  return data ? toAssignment(data) : null;
}

/** Links the assignment to another course, or unlinks it with null. */
export async function setAssignmentCourse(
  client: SupabaseClient,
  id: string,
  courseId: unknown,
) {
  const course_id = courseLink(courseId);
  if (!isId(id)) throw new Error('Assignment not found');
  const { data, error } = await client
    .from('assignments')
    .update({ course_id })
    .eq('id', id)
    .select(columns);
  if (error) fail(error);
  const [row] = data as Row[];
  if (!row) throw new Error('Assignment not found');
  return toAssignment(row);
}

/** Changes only the task's type; its other details stay as saved. */
export async function setAssignmentKind(
  client: SupabaseClient,
  id: string,
  value: unknown,
) {
  const update = { kind: kind(value) };
  if (!isId(id)) throw new Error('Assignment not found');
  const { data, error } = await client
    .from('assignments')
    .update(update)
    .eq('id', id)
    .select(columns);
  if (error) fail(error);
  const [row] = data as Row[];
  if (!row) throw new Error('Assignment not found');
  return toAssignment(row);
}
