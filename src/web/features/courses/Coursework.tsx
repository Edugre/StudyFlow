import { useEffect, useState, type FormEvent } from 'react';
import { optionLabel, type Assignment } from '../../../shared/assignment.js';
import type { StudySession } from '../../../shared/study-session.js';
import { supabase } from '../../lib/supabase.js';
import {
  createAssignment,
  listAssignments,
  setAssignmentCourse,
} from '../assignments/assignment-api.js';
import {
  createStudySession,
  listStudySessions,
  setStudySessionCourse,
} from '../study-sessions/session-api.js';
import type { SavedCourse } from './course-api.js';

/** CM-10: the assignments and study sessions linked to one course. */
export function Coursework({
  course,
  courses,
}: {
  course: SavedCourse;
  courses: SavedCourse[];
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoaded(false);
    Promise.all([
      listAssignments(supabase, course.id),
      listStudySessions(supabase, course.id),
    ])
      .then(([linkedAssignments, linkedSessions]) => {
        if (!active) return;
        setAssignments(linkedAssignments);
        setSessions(linkedSessions);
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [course.id]);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setMessage(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  function addAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void run(async () => {
      const saved = await createAssignment(supabase, {
        title: values.title,
        courseId: course.id,
      });
      setAssignments((previous) => [...previous, saved]);
      form.reset();
      return 'Assignment saved.';
    });
  }

  function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void run(async () => {
      const saved = await createStudySession(supabase, {
        date: values.date,
        startTime: values.startTime,
        durationMinutes: Number(values.durationMinutes),
        courseId: course.id,
      });
      setSessions((previous) =>
        [...previous, saved].sort((a, b) =>
          (a.date + a.startTime).localeCompare(b.date + b.startTime),
        ),
      );
      form.reset();
      return 'Study session saved.';
    });
  }

  // Moving an item to another course (or none) removes it from this list.
  function moveAssignment(id: string, courseId: string) {
    void run(async () => {
      await setAssignmentCourse(supabase, id, courseId || null);
      setAssignments((previous) => previous.filter((item) => item.id !== id));
      return 'Assignment moved.';
    });
  }

  function moveSession(id: string, courseId: string) {
    void run(async () => {
      await setStudySessionCourse(supabase, id, courseId || null);
      setSessions((previous) => previous.filter((item) => item.id !== id));
      return 'Study session moved.';
    });
  }

  const courseSelect = (label: string, onMove: (courseId: string) => void) => (
    <label>
      {label}
      <select
        value={course.id}
        disabled={busy}
        onChange={(event) => onMove(event.target.value)}
      >
        {courses.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
        <option value="">No course</option>
      </select>
    </label>
  );

  return (
    <section aria-label="Coursework">
      <h3>Assignments and study sessions</h3>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!loaded ? (
        !error && <p>Loading coursework…</p>
      ) : (
        <>
          <h4>Assignments</h4>
          {assignments.length ? (
            <ul>
              {assignments.map((assignment) => (
                <li key={assignment.id}>
                  {assignment.title}{' '}
                  <span className="tag">{optionLabel(assignment.kind)}</span>
                  {assignment.completedAt && (
                    <>
                      {' '}
                      <span className="tag">Completed</span>
                    </>
                  )}
                  {courseSelect(`Course for ${assignment.title}`, (id) =>
                    moveAssignment(assignment.id, id),
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No assignments for this course.</p>
          )}
          <form onSubmit={addAssignment}>
            <label>
              Assignment title
              <input name="title" required maxLength={200} />
            </label>
            <button disabled={busy}>
              {busy ? 'Saving…' : 'Add assignment'}
            </button>
          </form>

          <h4>Study sessions</h4>
          {sessions.length ? (
            <ul>
              {sessions.map((session) => {
                const when = `${session.date} ${session.startTime} (${session.durationMinutes} min)`;
                return (
                  <li key={session.id}>
                    {when}
                    {courseSelect(`Course for session on ${when}`, (id) =>
                      moveSession(session.id, id),
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No study sessions for this course.</p>
          )}
          <form onSubmit={addSession}>
            <label>
              Date
              <input name="date" type="date" required />
            </label>
            <label>
              Start time
              <input name="startTime" type="time" required />
            </label>
            <label>
              Duration (minutes)
              <input
                name="durationMinutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                required
              />
            </label>
            <button disabled={busy}>
              {busy ? 'Saving…' : 'Add study session'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
