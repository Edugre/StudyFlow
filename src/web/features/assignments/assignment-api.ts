import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  priorities,
  taskKinds,
  type Assignment,
  type Priority,
  type TaskKind,
} from '../../../shared/assignment.js';
import { courseLink, failLinked, isId } from '../../lib/linked-course.js';

/**
 * Assignment data access (AT-01) with course links (CM-10, AT-02) and
 * task types (AT-04) and priorities (AT-05). Ownership is enforced by row level security.
 */
type Row = {
  id: string;
  title: string;
  course_id: string | null;
  kind: TaskKind;
  priority: Priority;
};
const columns = 'id, title, course_id, kind, priority';
const toAssignment = (row: Row): Assignment => ({
  id: row.id,
  title: row.title,
  courseId: row.course_id,
  kind: row.kind,
  priority: row.priority,
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

/** A missing priority means Medium. */
function priority(value: unknown = 'medium') {
  if (!priorities.includes(value as Priority))
    throw new Error('Choose Low, Medium, or High priority.');
  return value as Priority;
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
    priority: priority(input.priority),
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

/** Updates only the given columns of one task; other tasks never change. */
async function updateAssignment(
  client: SupabaseClient,
  id: string,
  update: Partial<Omit<Row, 'id'>>,
) {
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

/** Links the assignment to another course, or unlinks it with null. */
export async function setAssignmentCourse(
  client: SupabaseClient,
  id: string,
  courseId: unknown,
) {
  return updateAssignment(client, id, { course_id: courseLink(courseId) });
}

/** Changes only the task's type; its other details stay as saved. */
export async function setAssignmentKind(
  client: SupabaseClient,
  id: string,
  value: unknown,
) {
  return updateAssignment(client, id, { kind: kind(value) });
}

/** Changes only the task's priority; its other details stay as saved. */
export async function setAssignmentPriority(
  client: SupabaseClient,
  id: string,
  value: unknown,
) {
  return updateAssignment(client, id, { priority: priority(value) });
}
