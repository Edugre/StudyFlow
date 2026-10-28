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
  // Validated before touching the client so bad input never leaves the browser.
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
