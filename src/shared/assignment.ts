export const taskKinds = ['assignment', 'exam', 'quiz', 'project'] as const;
export type TaskKind = (typeof taskKinds)[number];

export const priorities = ['low', 'medium', 'high'] as const;
export type Priority = (typeof priorities)[number];

/** "exam" → "Exam", for labels. */
export const optionLabel = (value: TaskKind | Priority) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export interface Assignment {
  id: string;
  title: string;
  /** The linked course, or null when the assignment has none. */
  courseId: string | null;
  kind: TaskKind;
  priority: Priority;
  /** Local calendar date, YYYY-MM-DD, or null when the task has no deadline. */
  dueDate: string | null;
  /** Local wall time in HH:MM, or null for a date-only deadline. */
  dueTime: string | null;
}
