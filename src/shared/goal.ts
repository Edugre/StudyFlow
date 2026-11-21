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
  /** GP-05: when the goal was marked completed, or null while it is active. */
  completedAt: string | null;
  createdAt: string;
}

/** GP-05: how many of these goals are completed; each counts once. */
export const completedGoals = (goals: Goal[]) =>
  goals.filter((goal) => goal.completedAt !== null).length;
