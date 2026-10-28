import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Course, CourseMeeting } from '../../../shared/course.js';
import { meetingError, validMeetings } from '../../../shared/meetings.js';

/**
 * Course data access. Ownership is enforced by row level security on the
 * signed-in session, so no owner identity is ever sent from here.
 * Takes the client as a parameter so tests can exercise the same code.
 */
export type SavedCourse = Course & {
  code: string | null;
  instructor: string | null;
  semester: string | null;
  location: string | null;
  notes: string | null;
};
export type EditableField = 'code' | 'instructor' | 'semester';

const columns =
  'id, name, code, instructor, semester, location, notes, course_meetings(day, start_time, end_time)';

type Row = Omit<SavedCourse, 'meetings'> & {
  course_meetings: { day: string; start_time: string; end_time: string }[];
};

const toCourse = ({ course_meetings, ...row }: Row): SavedCourse => ({
  ...row,
  meetings: course_meetings.map((meeting) => ({
    day: meeting.day as CourseMeeting['day'],
    startTime: meeting.start_time.slice(0, 5),
    endTime: meeting.end_time.slice(0, 5),
  })),
});

function fail(error: PostgrestError): never {
  if (error.code === 'P0002') throw new Error('Course not found');
  if (error.code === '23514' || error.code === '22023')
    throw new Error('Check the course details and try again.');
  throw new Error('Request failed');
}

export function text(value: unknown, label: string, max?: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || (max && value.length > max))
    throw new Error(
      max
        ? `${label} must be text of at most ${max} characters.`
        : `${label} must be text.`,
    );
  return value;
}

function courseName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200)
    throw new Error('Enter a course name of 1–200 characters.');
  return value;
}

function meetingList(value: unknown = []) {
  if (!validMeetings(value)) throw new Error(meetingError);
  return value;
}

export async function listCourses(client: SupabaseClient, semester?: string) {
  let query = client
    .from('courses')
    .select(columns)
    .order('created_at')
    .order('id', { referencedTable: 'course_meetings' });
  if (semester !== undefined) query = query.eq('semester', semester);
  const { data, error } = await query.overrideTypes<Row[]>();
  if (error) fail(error);
  return data.map(toCourse);
}

export async function findCourse(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from('courses')
    .select(columns)
    .eq('id', id)
    .order('id', { referencedTable: 'course_meetings' })
    .maybeSingle()
    .overrideTypes<Row>();
  // Malformed ids are indistinguishable from other students' courses.
  if (error?.code === '22P02') return null;
  if (error) fail(error);
  return data ? toCourse(data) : null;
}

async function reload(client: SupabaseClient, id: string) {
  const course = await findCourse(client, id);
  if (!course) throw new Error('Course not found');
  return course;
}

// Arguments are validated before touching the client so bad input never leaves the browser.
export async function createCourse(
  client: SupabaseClient,
  input: Record<string, unknown>,
) {
  const args = {
    p_name: courseName(input.name),
    p_code: text(input.code, 'Course code'),
    p_instructor: text(input.instructor, 'Instructor'),
    p_semester: text(input.semester, 'Semester', 100),
    p_meetings: meetingList(input.meetings),
  };
  const { data, error } = await client.rpc('create_course', args);
  if (error) fail(error);
  return reload(client, data as string);
}

export async function updateCourseField(
  client: SupabaseClient,
  id: string,
  field: EditableField,
  value: unknown,
) {
  const checked =
    field === 'code'
      ? text(value, 'Course code')
      : field === 'instructor'
        ? text(value, 'Instructor')
        : text(value, 'Semester', 100);
  const { data, error } = await client
    .from('courses')
    .update({ [field]: checked })
    .eq('id', id)
    .select('id');
  if (error?.code === '22P02') throw new Error('Course not found');
  if (error) fail(error);
  if (!data.length) throw new Error('Course not found');
  return reload(client, id);
}

export async function replaceMeetings(
  client: SupabaseClient,
  id: string,
  meetings: unknown,
) {
  const args = { p_course_id: id, p_meetings: meetingList(meetings) };
  const { error } = await client.rpc('replace_course_meetings', args);
  if (error?.code === '22P02') throw new Error('Course not found');
  if (error) fail(error);
  return reload(client, id);
}

/** CM-06: replaces every editable field and the meeting schedule. */
export async function updateCourse(
  client: SupabaseClient,
  id: string,
  input: Record<string, unknown>,
) {
  const args = {
    p_id: id,
    p_name: courseName(input.name),
    p_code: text(input.code, 'Course code'),
    p_instructor: text(input.instructor, 'Instructor'),
    p_semester: text(input.semester, 'Semester', 100),
    p_location: text(input.location, 'Location'),
    p_notes: text(input.notes, 'Notes'),
    p_meetings: meetingList(input.meetings),
  };
  const { error } = await client.rpc('update_course', args);
  if (error?.code === '22P02') throw new Error('Course not found');
  if (error) fail(error);
  return reload(client, id);
}

export async function deleteCourse(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from('courses')
    .delete()
    .eq('id', id)
    .select('id');
  if (error?.code === '22P02') return false;
  if (error) fail(error);
  return data.length > 0;
}
