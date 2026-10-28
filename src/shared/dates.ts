/** A real calendar date as YYYY-MM-DD (rejects impossible dates such as 2026-02-30). */
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  // Round-tripping through Date catches days past the end of the month.
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

/** A 24-hour wall-clock time as HH:MM. */
export const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
