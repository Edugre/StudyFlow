import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { optionLabel, type Assignment } from '../../../shared/assignment.js';
import {
  bySchedule,
  completedCount,
  durationText,
  plannedMinutes,
  scheduled,
  type StudySession,
} from '../../../shared/study-session.js';
import { supabase } from '../../lib/supabase.js';
import { listAssignments } from '../assignments/assignment-api.js';
import { AuthGate } from '../auth/AuthGate.js';
import { listCourses, type SavedCourse } from '../courses/course-api.js';
import {
  cancelStudySession,
  completeStudySession,
  createStudySession,
  editStudySession,
  findStudySession,
  listStudySessions,
} from './session-api.js';

export function StudyPage() {
  return (
    <>
      <h1>Study planner</h1>
      <AuthGate>{() => <Schedule />}</AuthGate>
    </>
  );
}

/** A form's minutes field as a number; blank becomes NaN so it is rejected. */
const minutes = (value: FormDataEntryValue | undefined) =>
  value === undefined || value === '' ? NaN : Number(value);

/** "2026-11-02 18:00 (90 min)" */
const whenText = (session: StudySession) =>
  `${session.date} ${session.startTime} (${session.durationMinutes} min)`;

/** The add and edit forms' values, in the shape the session API takes. */
function formSession(form: HTMLFormElement) {
  const values = Object.fromEntries(new FormData(form));
  return {
    date: values.date,
    startTime: values.startTime,
    durationMinutes: minutes(values.durationMinutes),
    courseId: values.courseId,
    assignmentId: values.assignmentId,
    objective: values.objective,
  };
}

/**
 * The fields shared by the add and edit forms, showing a saved session's
 * values when editing it.
 */
function SessionFields({
  session,
  courseOptions,
  taskOptions,
}: {
  session?: StudySession;
  courseOptions: ReactNode;
  taskOptions: ReactNode;
}) {
  return (
    <>
      <label>
        Date
        <input name="date" type="date" required defaultValue={session?.date} />
      </label>
      <label>
        Start time
        <input
          name="startTime"
          type="time"
          required
          defaultValue={session?.startTime}
        />
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
          defaultValue={session?.durationMinutes}
        />
      </label>
      <label>
        Course (optional)
        <select name="courseId" defaultValue={session?.courseId ?? ''}>
          {courseOptions}
        </select>
      </label>
      <label>
        Task (optional)
        <select name="assignmentId" defaultValue={session?.assignmentId ?? ''}>
          {taskOptions}
        </select>
      </label>
      <label>
        Objective (optional)
        <textarea
          name="objective"
          maxLength={500}
          defaultValue={session?.objective ?? ''}
        />
      </label>
    </>
  );
}

/**
 * SP-01: the student's schedule of study sessions, and a form to reserve
 * a new one with a date, start time and duration.
 * SP-02: each session can be linked to one of the student's courses.
 * SP-04: a session can be moved to a new date and start time in place.
 * SP-05: each session has a duration, and the schedule shows the planned
 * study time of all its sessions.
 * SP-06: a session can have an objective.
 * SP-03: a session can prepare for one of the student's tasks; when both
 * have a course, the courses must agree.
 * SP-07: every detail of a session can be changed in one form, or cancelled.
 * SP-09: a session can be marked completed, once, and the schedule shows how
 * many sessions are completed.
 * SP-08: a session can be canceled after confirming; it leaves the schedule
 * and planned study time but stays saved, listed under canceled sessions.
 */
function Schedule() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [courses, setCourses] = useState<SavedCourse[]>([]);
  const [tasks, setTasks] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<StudySession | null>(null);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // The most recently opened session id; older responses are discarded.
  const opening = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      listStudySessions(supabase),
      listCourses(supabase),
      listAssignments(supabase),
    ])
      .then(([savedSessions, savedCourses, savedTasks]) => {
        if (!active) return;
        setSessions(savedSessions);
        setCourses(savedCourses);
        setTasks(savedTasks);
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

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

  function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = formSession(form);
    // Invalid input is rejected before the request, so nothing is created.
    void run(async () => {
      const saved = await createStudySession(supabase, input);
      setSessions((previous) => bySchedule([...previous, saved]));
      opening.current = null;
      setEditing(false);
      setSelected(saved);
      form.reset();
      return 'Study session saved.';
    });
  }

  /** Replaces a saved session in the schedule and shows it as the open one. */
  function showSaved(saved: StudySession) {
    setSessions((previous) =>
      bySchedule(
        previous.map((session) => (session.id === saved.id ? saved : session)),
      ),
    );
    setSelected(saved);
  }

  function complete(id: string) {
    void run(async () => {
      showSaved(await completeStudySession(supabase, id));
      return 'Study session completed.';
    });
  }

  // Dismissing the confirmation sends nothing, so the session stays scheduled.
  function cancelSession(session: StudySession) {
    const confirmed = window.confirm(
      `Cancel the study session on ${whenText(session)}? It will be removed from your schedule. This can't be undone.`,
    );
    if (!confirmed) return;
    void run(async () => {
      setEditing(false);
      showSaved(await cancelStudySession(supabase, session.id));
      return 'Study session canceled.';
    });
  }

  /**
   * Saves the whole edit form to the same session, so no duplicate is
   * created, and the schedule re-sorts. If anything is invalid, nothing is
   * saved and the form stays open. Cancel just closes the form; nothing is
   * sent, so the saved details stay.
   */
  function saveEdit(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const input = formSession(event.currentTarget);
    void run(async () => {
      const saved = await editStudySession(supabase, id, input);
      setEditing(false);
      showSaved(saved);
      return 'Study session saved.';
    });
  }

  async function reopen(id: string) {
    opening.current = id;
    setEditing(false);
    setError('');
    setSelected(null);
    try {
      const session = await findStudySession(supabase, id);
      if (opening.current !== id) return;
      if (!session) throw new Error('Study session not found');
      setSelected(session);
    } catch (e) {
      if (opening.current !== id) return;
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  const courseName = (session: StudySession) =>
    courses.find((course) => course.id === session.courseId)?.name ?? null;

  const taskTitle = (session: StudySession) =>
    tasks.find((task) => task.id === session.assignmentId)?.title ?? null;

  /** "Midterm (Exam, Math)", so the task's course is visible when choosing. */
  const taskOptions = (
    <>
      <option value="">No task</option>
      {tasks.map((task) => {
        const course = courses.find((c) => c.id === task.courseId)?.name;
        return (
          <option key={task.id} value={task.id}>
            {task.title} ({optionLabel(task.kind)}
            {course && `, ${course}`})
          </option>
        );
      })}
    </>
  );

  const courseOptions = (
    <>
      <option value="">No course</option>
      {courses.map((course) => (
        <option key={course.id} value={course.id}>
          {course.name}
        </option>
      ))}
    </>
  );

  const inSchedule = scheduled(sessions);
  const canceled = sessions.filter((session) => session.canceledAt);

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <h2>Add a study session</h2>
      <form onSubmit={addSession}>
        <SessionFields
          courseOptions={courseOptions}
          taskOptions={taskOptions}
        />
        <button disabled={busy}>
          {busy ? 'Saving…' : 'Add study session'}
        </button>
      </form>
      <h2>Your schedule</h2>
      {!loaded ? (
        !error && <p>Loading study sessions…</p>
      ) : inSchedule.length ? (
        <>
          <p>Planned study time: {durationText(plannedMinutes(sessions))}</p>
          <p>Completed sessions: {completedCount(sessions)}</p>
          <ol>
            {inSchedule.map((session) => (
              <li key={session.id}>
                <button disabled={busy} onClick={() => reopen(session.id)}>
                  {whenText(session)}
                </button>
                {courseName(session) && ` — ${courseName(session)}`}
                {taskTitle(session) && ` — for ${taskTitle(session)}`}
                {session.objective && ` — ${session.objective}`}
                {session.completedAt && (
                  <>
                    {' '}
                    <span className="tag">Completed</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>No study sessions scheduled. Add a session above.</p>
      )}
      {canceled.length > 0 && (
        <>
          <h2>Canceled sessions</h2>
          <ul>
            {canceled.map((session) => (
              <li key={session.id}>
                <button disabled={busy} onClick={() => reopen(session.id)}>
                  {whenText(session)}
                </button>
                {courseName(session) && ` — ${courseName(session)}`}
              </li>
            ))}
          </ul>
        </>
      )}
      {selected && (
        <section aria-label="Selected study session">
          <h2>Study session on {whenText(selected)}</h2>
          <dl className="course-details">
            <div>
              <dt>Date</dt>
              <dd>{selected.date}</dd>
            </div>
            <div>
              <dt>Start time</dt>
              <dd>{selected.startTime}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>
                {selected.durationMinutes} minutes
                {selected.durationMinutes >= 60 &&
                  ` (${durationText(selected.durationMinutes)})`}
              </dd>
            </div>
            <div>
              <dt>Course</dt>
              <dd>{courseName(selected) ?? 'No course'}</dd>
            </div>
            <div>
              <dt>Task</dt>
              <dd>{taskTitle(selected) ?? 'No task'}</dd>
            </div>
            <div>
              <dt>Objective</dt>
              <dd>{selected.objective ?? 'No objective'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {selected.completedAt
                  ? `Completed on ${new Date(selected.completedAt).toLocaleString()}`
                  : selected.canceledAt
                    ? `Canceled on ${new Date(selected.canceledAt).toLocaleString()}`
                    : 'Scheduled'}
              </dd>
            </div>
          </dl>
          {!selected.completedAt && !selected.canceledAt && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => complete(selected.id)}
              >
                {busy ? 'Saving…' : 'Mark completed'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => cancelSession(selected)}
              >
                Cancel study session
              </button>
            </>
          )}
          {selected.canceledAt ? null : editing ? (
            <form
              onSubmit={(event) => saveEdit(event, selected.id)}
              aria-label="Edit study session"
            >
              <h3>Edit study session</h3>
              <SessionFields
                session={selected}
                courseOptions={courseOptions}
                taskOptions={taskOptions}
              />
              <button disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Edit study session
            </button>
          )}
        </section>
      )}
    </>
  );
}
