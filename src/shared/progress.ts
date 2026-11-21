import type { Assignment } from './assignment.js';
import { isDate } from './dates.js';
import { plannedMinutes, type StudySession } from './study-session.js';

/**
 * Progress metrics, computed from the student's saved records so they always
 * agree with them. Every task kind (assignment, exam, quiz, project) counts.
 */
export interface TaskProgress {
  completed: number;
  incomplete: number;
}

/** GP-06: how many of these tasks are completed and how many are not. */
export function taskProgress(tasks: Assignment[]): TaskProgress {
  const completed = tasks.filter((task) => task.completedAt !== null).length;
  return { completed, incomplete: tasks.length - completed };
}

/**
 * GP-07: how many of these study sessions are completed. A session is
 * completed or canceled, never both, but canceled sessions are left out
 * explicitly so they can never count as completed.
 */
export const completedSessions = (sessions: StudySession[]) =>
  sessions.filter(
    (session) => session.completedAt !== null && session.canceledAt === null,
  ).length;

/** GP-08: an optional range of session dates, YYYY-MM-DD, both inclusive. */
export interface Period {
  from?: string;
  to?: string;
}

export const periodError =
  'Enter valid dates, with the start of the period on or before its end.';

/** Throws unless each given date is real and the period runs forwards. */
export function checkPeriod(period: Period) {
  const { from, to } = period;
  if (
    (from !== undefined && !isDate(from)) ||
    (to !== undefined && !isDate(to)) ||
    (from !== undefined && to !== undefined && from > to)
  )
    throw new Error(periodError);
}

/** The sessions whose date falls within the period. */
export const inPeriod = (sessions: StudySession[], period: Period = {}) =>
  sessions.filter(
    (session) =>
      (period.from === undefined || session.date >= period.from) &&
      (period.to === undefined || session.date <= period.to),
  );

export interface StudyTime {
  /** Saved durations of the sessions that weren't canceled, in minutes. */
  plannedMinutes: number;
  /**
   * Saved durations of the completed sessions, in minutes. This is the time
   * the sessions were planned for, not measured elapsed time.
   */
  completedMinutes: number;
}

/** GP-08: planned versus completed study time of the sessions in a period. */
export function studyTime(
  sessions: StudySession[],
  period: Period = {},
): StudyTime {
  const shown = inPeriod(sessions, period);
  return {
    plannedMinutes: plannedMinutes(shown),
    completedMinutes: shown
      .filter((session) => session.completedAt !== null && !session.canceledAt)
      .reduce((total, session) => total + session.durationMinutes, 0),
  };
}
