import type { CourseMeeting } from './course.js';
import { isTime } from './dates.js';
const days = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export function validMeetings(value: unknown): value is CourseMeeting[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (meeting) =>
        meeting &&
        typeof meeting === 'object' &&
        days.has(meeting.day) &&
        isTime(meeting.startTime) &&
        isTime(meeting.endTime) &&
        meeting.endTime > meeting.startTime,
    )
  );
}
export const meetingError =
  'Choose a weekday and valid times for every meeting. End time must be after start time (same day).';
