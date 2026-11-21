export interface Goal {
  id: string;
  title: string;
  /** GP-01: what the student wants to accomplish. */
  message: string;
  /** GP-02: local calendar date, YYYY-MM-DD, or null when there is none. */
  targetDate: string | null;
  /** GP-03: the linked course, or null when the goal has none. */
  courseId: string | null;
  /** GP-04: how close the goal is to done, a whole percentage 0–100. */
  progress: number;
  createdAt: string;
}
