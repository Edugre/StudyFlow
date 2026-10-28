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
  /** When the task was marked completed, or null while it is open. */
  completedAt: string | null;
  /** Percentage grade from 0 through 100, only on completed tasks. */
  grade: number | null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * AT-09: open tasks whose deadline is now or later, earliest first.
 * Deadlines are local wall time, so "now" is read in the browser's local
 * time. A date-only deadline counts as the end of that day, so it stays
 * upcoming all day and sorts after timed deadlines on the same date.
 */
export function upcomingTasks(tasks: Assignment[], now = new Date()) {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // '24:00' sorts after every real time.
  const deadline = (task: Assignment) =>
    `${task.dueDate} ${task.dueTime ?? '24:00'}`;
  return tasks
    .filter(
      (task) =>
        !task.completedAt &&
        task.dueDate !== null &&
        deadline(task) >= `${today} ${time}`,
    )
    .sort((a, b) => deadline(a).localeCompare(deadline(b)));
}
