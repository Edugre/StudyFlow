export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface CourseMeeting {
  day: Weekday;
  /** Local wall time in HH:MM. Timezone behavior requires a team decision. */
  startTime: string;
  endTime: string;
}

export interface CourseInput {
  name: string;
  code?: string | null;
  instructor?: string | null;
  semester?: string | null;
  location?: string | null;
  notes?: string | null;
  meetings: CourseMeeting[];
}

export interface Course extends CourseInput {
  id: string;
}
