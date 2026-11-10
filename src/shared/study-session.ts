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
