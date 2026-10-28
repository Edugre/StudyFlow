export const taskKinds = ['assignment', 'exam', 'quiz', 'project'] as const;
export type TaskKind = (typeof taskKinds)[number];

/** "exam" → "Exam", for labels. */
export const kindLabel = (kind: TaskKind) =>
  kind.charAt(0).toUpperCase() + kind.slice(1);

export interface Assignment {
  id: string;
  title: string;
  /** The linked course, or null when the assignment has none. */
  courseId: string | null;
  kind: TaskKind;
}
