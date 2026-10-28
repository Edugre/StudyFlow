import type { PostgrestError } from '@supabase/supabase-js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isId = (value: unknown): value is string =>
  typeof value === 'string' && uuid.test(value);

/** A course link is either absent (null) or a well-formed course id. */
export function courseLink(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (!isId(value)) throw new Error('Course not found');
  return value;
}

/**
 * Maps errors from coursework tables. Row level security rejects links to
 * courses the student does not own (42501), and a deleted course fails the
 * foreign key (23503); both read as a missing course.
 */
export function failLinked(error: PostgrestError, details: string): never {
  if (error.code === '42501' || error.code === '23503')
    throw new Error('Course not found');
  if (
    error.code === '23514' ||
    error.code === '22007' ||
    error.code === '22008'
  )
    throw new Error(`Check the ${details} and try again.`);
  throw new Error('Request failed');
}
