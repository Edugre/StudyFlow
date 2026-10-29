import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  priorities,
  taskKinds,
  type Assignment,
  type Priority,
  type TaskKind,
} from '../../../shared/assignment.js';
import { isDate, isTime } from '../../../shared/dates.js';
import { courseLink, failLinked, isId } from '../../lib/linked-course.js';

/**
 * Assignment data access (AT-01) with course links (CM-10, AT-02) and
 * task types (AT-04), priorities (AT-05), deadlines (AT-03), completion
 * (AT-06) and grades (AT-10). Ownership is enforced by row level security.
 */
type Row = {
  id: string;
  title: string;
  course_id: string | null;
  kind: TaskKind;
  priority: Priority;
  due_on: string | null;
  due_time: string | null;
  completed_at: string | null;
  grade: number | string | null;
};
const columns =
  'id, title, course_id, kind, priority, due_on, due_time, completed_at, grade';
const toAssignment = (row: Row): Assignment => ({
  id: row.id,
  title: row.title,
  courseId: row.course_id,
  kind: row.kind,
  priority: row.priority,
  dueDate: row.due_on,
  dueTime: row.due_time?.slice(0, 5) ?? null,
  completedAt: row.completed_at,
  // Postgres numeric may arrive as a string.
  grade: row.grade === null ? null : Number(row.grade),
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

export const deadlineError =
  'Enter a valid due date, and a due time (HH:MM) only together with a date.';

/** An optional due date with an optional time; blank values mean none. */
function deadline(dueDate: unknown, dueTime: unknown) {
  const blank = (value: unknown) =>
    value === undefined || value === null || value === '';
  const due_on = blank(dueDate) ? null : dueDate;
  const due_time = blank(dueTime) ? null : dueTime;
  if (
    (due_on !== null && !isDate(due_on)) ||
    (due_time !== null && (!isTime(due_time) || due_on === null))
  )
    throw new Error(deadlineError);
  return { due_on, due_time } as {
    due_on: string | null;
    due_time: string | null;
  };
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
    ...deadline(input.dueDate, input.dueTime),
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

/**
 * Sets or clears the task's deadline. Invalid input is rejected before the
 * request, so the previously saved deadline stays.
 */
export async function setAssignmentDue(
  client: SupabaseClient,
  id: string,
  input: Record<string, unknown>,
) {
  return updateAssignment(client, id, deadline(input.dueDate, input.dueTime));
}

/**
 * Marks the task completed. The database records its own time and keeps the
 * first completion, so repeating this changes nothing.
 */
export async function completeAssignment(client: SupabaseClient, id: string) {
  return updateAssignment(client, id, {
    completed_at: new Date().toISOString(),
  });
}

/**
 * AT-07: saves every editable detail of a task in one update. The input holds
 * the whole edit form; if any field is invalid, nothing is saved.
 * Completion (AT-06) is not editable here.
 */
export async function editAssignment(
  client: SupabaseClient,
  id: string,
  input: Record<string, unknown>,
) {
  return updateAssignment(client, id, {
    title: title(input.title),
    course_id: courseLink(input.courseId),
    kind: kind(input.kind),
    priority: priority(input.priority),
    ...deadline(input.dueDate, input.dueTime),
  });
}

/** AT-08: deletes one task; false when it doesn't exist or isn't the student's. */
export async function deleteAssignment(client: SupabaseClient, id: string) {
  if (!isId(id)) return false;
  const { data, error } = await client
    .from('assignments')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) fail(error);
  return data.length > 0;
}

export const gradeError = 'Enter a grade from 0 to 100.';

/** A percentage from 0 through 100 with at most two decimals. */
function grade(value: unknown) {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d{1,3}(\.\d{1,2})?$/.test(text.trim()))
    throw new Error(gradeError);
  const parsed = Number(text);
  if (parsed > 100) throw new Error(gradeError);
  return parsed;
}

/**
 * AT-10: records or replaces the grade of a completed task. Invalid grades
 * are rejected before the request, so the saved grade stays.
 */
export async function recordGrade(
  client: SupabaseClient,
  id: string,
  value: unknown,
) {
  const update = { grade: grade(value) };
  if (!isId(id)) throw new Error('Assignment not found');
  const { data, error } = await client
    .from('assignments')
    .update(update)
    .eq('id', id)
    .not('completed_at', 'is', null)
    .select(columns);
  if (error) fail(error);
  const [row] = data as Row[];
  if (row) return toAssignment(row);
  // Nothing matched: either the task is still open, or it isn't the student's.
  if (await findAssignment(client, id))
    throw new Error('Mark the task completed before recording a grade.');
  throw new Error('Assignment not found');
}
