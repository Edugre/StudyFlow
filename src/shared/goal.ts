export interface Goal {
  id: string;
  title: string;
  /** GP-01: what the student wants to accomplish. */
  message: string;
  /** GP-02: local calendar date, YYYY-MM-DD, or null when there is none. */
  targetDate: string | null;
  createdAt: string;
}
