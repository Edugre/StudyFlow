import type { CourseMeeting } from '../../../shared/course.js';
const days = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function validMeetings(value: unknown): value is CourseMeeting[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(
      (meeting) =>
        meeting &&
        typeof meeting === 'object' &&
        days.has(meeting.day) &&
        typeof meeting.startTime === 'string' &&
        typeof meeting.endTime === 'string' &&
        time.test(meeting.startTime) &&
        time.test(meeting.endTime) &&
        meeting.endTime > meeting.startTime,
    )
  );
}
export const meetingError =
  'Choose a weekday and valid times for every meeting. End time must be after start time (same day).';
