export interface StudySession {
  id: string;
  /** The linked course, or null when the session has none. */
  courseId: string | null;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local wall time in HH:MM. Timezone behavior requires a team decision. */
  startTime: string;
  durationMinutes: number;
}

/** Schedule order: earliest date and start time first; ties keep saved order. */
export const bySchedule = (sessions: StudySession[]) =>
  [...sessions].sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
  );

/** SP-05: the planned study time of these sessions, in minutes. */
export const plannedMinutes = (sessions: StudySession[]) =>
  sessions.reduce((total, session) => total + session.durationMinutes, 0);

/** 195 → "3 h 15 min", 60 → "1 h", 45 → "45 min", 0 → "0 min". */
export function durationText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
