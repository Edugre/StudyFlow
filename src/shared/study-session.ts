export interface StudySession {
  id: string;
  /** The linked course, or null when the session has none. */
  courseId: string | null;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local wall time in HH:MM. Timezone behavior requires a team decision. */
  startTime: string;
  durationMinutes: number;
  /** SP-06: what the student intends to accomplish, or null for none. */
  objective: string | null;
  /** SP-03: the task (assignment, exam, …) it prepares for, or null. */
  assignmentId: string | null;
  /** SP-09: when the session was marked completed, or null while unfinished. */
  completedAt: string | null;
  /** SP-08: when the session was canceled, or null while it is scheduled. */
  canceledAt: string | null;
}

/** Schedule order: earliest date and start time first; ties keep saved order. */
export const bySchedule = (sessions: StudySession[]) =>
  [...sessions].sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
  );

/** SP-08: the sessions that are still in the schedule (not canceled). */
export const scheduled = (sessions: StudySession[]) =>
  sessions.filter((session) => !session.canceledAt);

/**
 * SP-05: the planned study time of these sessions, in minutes. Canceled
 * sessions (SP-08) are left out, as GP-08 requires.
 */
export const plannedMinutes = (sessions: StudySession[]) =>
  scheduled(sessions).reduce(
    (total, session) => total + session.durationMinutes,
    0,
  );

/** 195 → "3 h 15 min", 60 → "1 h", 45 → "45 min", 0 → "0 min". */
export function durationText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** SP-09: how many of these sessions are completed. */
export const completedCount = (sessions: StudySession[]) =>
  sessions.filter((session) => session.completedAt !== null).length;
