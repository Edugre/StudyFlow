import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  bySchedule,
  durationText,
  plannedMinutes,
  type StudySession,
} from '../../../shared/study-session.js';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import { listCourses, type SavedCourse } from '../courses/course-api.js';
import {
  createStudySession,
  findStudySession,
  listStudySessions,
  setStudySessionCourse,
  setStudySessionDuration,
  setStudySessionSchedule,
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

/**
 * SP-01: the student's schedule of study sessions, and a form to reserve
 * a new one with a date, start time and duration.
 * SP-02: each session can be linked to one of the student's courses, and
 * moved to another course from its details.
 * SP-04: a session can be moved to a new date and start time in place.
 * SP-05: a session's duration can be changed, and the schedule shows the
 * planned study time of all its sessions.
 */
function Schedule() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [courses, setCourses] = useState<SavedCourse[]>([]);
  const [selected, setSelected] = useState<StudySession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // The most recently opened session id; older responses are discarded.
  const opening = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listStudySessions(supabase), listCourses(supabase)])
      .then(([savedSessions, savedCourses]) => {
        if (!active) return;
        setSessions(savedSessions);
        setCourses(savedCourses);
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
    const values = Object.fromEntries(new FormData(form));
    // Invalid input is rejected before the request, so nothing is created.
    void run(async () => {
      const saved = await createStudySession(supabase, {
        date: values.date,
        startTime: values.startTime,
        durationMinutes: minutes(values.durationMinutes),
        courseId: values.courseId,
      });
      setSessions((previous) => bySchedule([...previous, saved]));
      opening.current = null;
      setSelected(saved);
      form.reset();
      return 'Study session saved.';
    });
  }

  /**
   * Saves a change to the open session. It updates the same session in
   * place, so no duplicate is created, and the schedule re-sorts.
   */
  function saveSession(save: () => Promise<StudySession>, done: string) {
    void run(async () => {
      const saved = await save();
      setSessions((previous) =>
        bySchedule(
          previous.map((session) =>
            session.id === saved.id ? saved : session,
          ),
        ),
      );
      setSelected(saved);
      return done;
    });
  }

  function moveSession(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    saveSession(
      () => setStudySessionCourse(supabase, id, values.courseId),
      'Course saved.',
    );
  }

  function reschedule(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    saveSession(
      () => setStudySessionSchedule(supabase, id, values),
      'Date and time saved.',
    );
  }

  function changeDuration(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    saveSession(
      () =>
        setStudySessionDuration(supabase, id, minutes(values.durationMinutes)),
      'Duration saved.',
    );
  }

  async function reopen(id: string) {
    opening.current = id;
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

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <h2>Add a study session</h2>
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
        <label>
          Course (optional)
          <select name="courseId" defaultValue="">
            {courseOptions}
          </select>
        </label>
        <button disabled={busy}>
          {busy ? 'Saving…' : 'Add study session'}
        </button>
      </form>
      <h2>Your schedule</h2>
      {!loaded ? (
        !error && <p>Loading study sessions…</p>
      ) : sessions.length ? (
        <>
          <p>Planned study time: {durationText(plannedMinutes(sessions))}</p>
          <ol>
            {sessions.map((session) => (
              <li key={session.id}>
                <button disabled={busy} onClick={() => reopen(session.id)}>
                  {whenText(session)}
                </button>
                {courseName(session) && ` — ${courseName(session)}`}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>No study sessions yet. Add your first session above.</p>
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
          </dl>
          <form
            onSubmit={(event) => reschedule(event, selected.id)}
            key={`${selected.id}:when:${selected.date}:${selected.startTime}`}
          >
            <label>
              Date
              <input
                name="date"
                type="date"
                required
                defaultValue={selected.date}
              />
            </label>
            <label>
              Start time
              <input
                name="startTime"
                type="time"
                required
                defaultValue={selected.startTime}
              />
            </label>
            <button disabled={busy}>
              {busy ? 'Saving…' : 'Save date and time'}
            </button>
          </form>
          <form
            onSubmit={(event) => changeDuration(event, selected.id)}
            key={`${selected.id}:duration:${selected.durationMinutes}`}
          >
            <label>
              Duration (minutes)
              <input
                name="durationMinutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                required
                defaultValue={selected.durationMinutes}
              />
            </label>
            <button disabled={busy}>
              {busy ? 'Saving…' : 'Save duration'}
            </button>
          </form>
          <form
            onSubmit={(event) => moveSession(event, selected.id)}
            key={`${selected.id}:course:${selected.courseId}`}
          >
            <label>
              Course
              <select name="courseId" defaultValue={selected.courseId ?? ''}>
                {courseOptions}
              </select>
            </label>
            <button disabled={busy}>{busy ? 'Saving…' : 'Save course'}</button>
          </form>
        </section>
      )}
    </>
  );
}
