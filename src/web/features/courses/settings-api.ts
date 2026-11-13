
import type { SupabaseClient } from '@supabase/supabase-js';
import { text } from './course-api.js';

/**
 * CM-08: the student's chosen current semester. One row per student, keyed
 * by the session's user id under row level security.
 */
export async function getCurrentSemester(client: SupabaseClient) {
  const { data, error } = await client
    .from('student_settings')
    .select('current_semester')
    .maybeSingle<{ current_semester: string | null }>();
  if (error) throw new Error('Request failed');
  return data?.current_semester ?? null;
}

/** Saves (or clears, with null or blank) the current semester; returns the stored label. */
export async function setCurrentSemester(
  client: SupabaseClient,
  semester: unknown,
) {
  const current_semester = text(semester, 'Semester', 100);
  const { data, error } = await client
    .from('student_settings')
    .upsert({ current_semester }, { onConflict: 'owner_id' })
    .select('current_semester')
    .single<{ current_semester: string | null }>();
  if (error?.code === '23514')
    throw new Error('Semester must be text of at most 100 characters.');
  if (error) throw new Error('Request failed');
  return data.current_semester;
}

/** RN-01, RN-02, RN-03: reminder preferences for one student. */
export type ReminderSettings = {
  assignment_reminders_enabled: boolean;
  exam_reminders_enabled: boolean;
  study_session_reminders_enabled: boolean;
  reminder_lead_minutes: number;
  time_zone: string;
};

/** Checks whether a time-zone identifier is supported by the browser. */
function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Loads reminder preferences and initializes settings for a new student. */
export async function getReminderSettings(client: SupabaseClient) {
  const { data, error } = await client
    .from('student_settings')
    .select(
      'assignment_reminders_enabled, exam_reminders_enabled, study_session_reminders_enabled, reminder_lead_minutes, time_zone',
    )
    .maybeSingle<ReminderSettings>();

  if (error) throw new Error('Unable to load reminder settings.');

  if (data) return data;

  // A new settings row uses the browser's time zone when available.
  const browserTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const { data: created, error: createError } = await client
    .from('student_settings')
    .upsert({ time_zone: browserTimeZone }, { onConflict: 'owner_id' })
    .select(
      'assignment_reminders_enabled, exam_reminders_enabled, study_session_reminders_enabled, reminder_lead_minutes, time_zone',
    )
    .single<ReminderSettings>();

  if (createError || !created)
    throw new Error('Unable to initialize reminder settings.');

  return created;
}

/** Validates and saves a student's reminder preferences. */
export async function saveReminderSettings(
  client: SupabaseClient,
  settings: ReminderSettings,
) {
  if (
    typeof settings.assignment_reminders_enabled !== 'boolean' ||
    typeof settings.exam_reminders_enabled !== 'boolean' ||
    typeof settings.study_session_reminders_enabled !== 'boolean'
  ) {
    throw new Error('Reminder preferences must be enabled or disabled.');
  }

  if (
    !Number.isInteger(settings.reminder_lead_minutes) ||
    settings.reminder_lead_minutes < 5 ||
    settings.reminder_lead_minutes > 10080
  ) {
    throw new Error('Reminder timing must be between 5 and 10080 minutes.');
  }

  if (!validTimeZone(settings.time_zone)) {
    throw new Error('Enter a valid time-zone identifier.');
  }

  const { data, error } = await client
    .from('student_settings')
    .upsert(settings, { onConflict: 'owner_id' })
    .select(
      'assignment_reminders_enabled, exam_reminders_enabled, study_session_reminders_enabled, reminder_lead_minutes, time_zone',
    )
    .single<ReminderSettings>();

  if (error) throw new Error('Unable to save reminder settings.');
  return data;
}
