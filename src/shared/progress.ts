import type { Assignment } from './assignment.js';

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
