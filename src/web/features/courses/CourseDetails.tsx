import type { SavedCourse } from './course-api.js';

/** CM-09: read-only view of one course; unset optional fields read "Not set". */
export function CourseDetails({ course }: { course: SavedCourse }) {
  const fields: [string, string | null][] = [
    ['Course code', course.code],
    ['Instructor', course.instructor],
    ['Semester', course.semester],
    ['Location', course.location],
    ['Notes', course.notes],
  ];
  return (
    <dl className="course-details">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{value || 'Not set'}</dd>
        </div>
      ))}
      <div>
        <dt>Schedule</dt>
        <dd>
          {course.meetings.length ? (
            <ul>
              {course.meetings.map((meeting, index) => (
                <li key={index}>
                  {meeting.day.toUpperCase()} {meeting.startTime}–
                  {meeting.endTime}
                </li>
              ))}
            </ul>
          ) : (
            'No meetings set.'
          )}
        </dd>
      </div>
    </dl>
  );
}
