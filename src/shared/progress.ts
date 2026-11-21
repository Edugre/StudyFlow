import type { Assignment } from './assignment.js';
import type { StudySession } from './study-session.js';

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
