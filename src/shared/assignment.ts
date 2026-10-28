export interface Assignment {
  id: string;
  title: string;
  /** The linked course, or null when the assignment has none. */
  courseId: string | null;
}
