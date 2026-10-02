import { MeetingsEditor } from './MeetingsEditor.js';
import type { CourseMeeting } from '../../../shared/course.js';
import { useEffect, useState, type FormEvent } from 'react';

async function api(path: string, body?: unknown) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-StudyFlow-Request': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}
type SavedCourse = {
  id: string;
  name: string;
  code: string | null;
  instructor: string | null;
  semester: string | null;
  location: string | null;
  notes: string | null;
  meetings: CourseMeeting[];
};
export function CoursesPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('login');
  const [courses, setCourses] = useState<SavedCourse[]>([]);
  const [selected, setSelected] = useState<SavedCourse | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const semesters = [
    ...new Set(
      courses
        .map((course) => course.semester)
        .filter((semester): semester is string => Boolean(semester)),
    ),
  ].sort();
  const visibleCourses = semesterFilter
    ? courses.filter((course) => course.semester === semesterFilter)
    : courses;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api('/auth/me')
      .then(async (data) => {
        const saved = data.user ? await api('/courses') : { courses: [] };
        if (active) {
          setUser(data.user);
          setCourses(saved.courses);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function saveField(
    event: FormEvent<HTMLFormElement>,
    field: 'code' | 'instructor' | 'semester',
  ) {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { course } = await api(`/courses/${selected.id}/${field}`, values);
      setSelected(course);
      if (field === 'semester') setSemesterFilter('');
      setCourses((previous) =>
        previous.map((item) => (item.id === course.id ? course : item)),
      );
      setMessage(
        field === 'code'
          ? 'Course code saved.'
          : field === 'instructor'
            ? 'Instructor saved.'
            : 'Semester saved.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function saveCourse(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!selected) return;

  const values = Object.fromEntries(new FormData(event.currentTarget));

  setBusy(true);
  setError('');
  setMessage('');

  try {
    const { course } = await api(`/courses/${selected.id}`, {
      ...values,
      meetings: selected.meetings,
    });

    setSelected(course);
    setCourses((previous) =>
      previous.map((item) => (item.id === course.id ? course : item)),
    );
    setMessage('Course information saved.');
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Request failed');
  } finally {
    setBusy(false);
  }
}
  async function saveMeetings(meetings: CourseMeeting[]) {
    if (!selected) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { course } = await api(`/courses/${selected.id}/meetings`, {
        meetings,
      });
      setSelected(course);
      setCourses((previous) =>
        previous.map((item) => (item.id === course.id ? course : item)),
      );
      setMessage('Meetings saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!user) {
        const data = await api(`/auth/${mode}`, values);
        const saved = await api('/courses');
        setUser(data.user);
        setCourses(saved.courses);
      } else {
        const data = await api('/courses', values);
        setCourses((previous) => [...previous, data.course]);
        setSelected(data.course);
        setSemesterFilter('');
        setMessage('Course saved.');
        form.reset();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/logout', {});
      setUser(null);
      setCourses([]);
      setSelected(null);
      setMessage('');
      setSemesterFilter('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function reopen(id: string) {
    setError('');
    try {
      setSelected((await api(`/courses/${id}`)).course);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }
  return (
    <>
      <h1>Courses</h1>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!ready ? (
        <p>Loading your workspace…</p>
      ) : !user ? (
        <>
          <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          <form onSubmit={submit} key={mode}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <p>Use a password of 12–128 characters.</p>
            <button disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
          <button
            disabled={busy}
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
          </button>
        </>
      ) : (
        <>
          <p>Signed in as {user.email}</p>
          <button disabled={busy} onClick={logout}>
            Sign out
          </button>
          <h2>Add a course</h2>
          <form onSubmit={submit}>
            <label>
              Course name
              <input name="name" required maxLength={200} />
            </label>
            <label>
              Course code (optional)
              <input name="code" type="text" />
            </label>
            <label>
              Instructor (optional)
              <input name="instructor" type="text" />
            </label>
            <label>
              Semester (optional)
              <input
                name="semester"
                list="semester-options"
                maxLength={100}
                placeholder="e.g. Fall 2026"
              />
            </label>
            <button disabled={busy}>{busy ? 'Saving…' : 'Add course'}</button>
          </form>
          <h2>Saved courses</h2>
          <label>
            Filter by semester
            <select
              value={semesterFilter}
              disabled={busy}
              onChange={(event) => {
                setSemesterFilter(event.target.value);
                setSelected(null);
              }}
            >
              <option value="">All semesters</option>
              {semesters.map((semester) => (
                <option key={semester} value={semester}>
                  {semester}
                </option>
              ))}
            </select>
          </label>
          <datalist id="semester-options">
            {semesters.map((semester) => (
              <option key={semester} value={semester} />
            ))}
          </datalist>
          {visibleCourses.length ? (
            <ul>
              {visibleCourses.map((course) => (
                <li key={course.id}>
                  <button disabled={busy} onClick={() => reopen(course.id)}>
                    {course.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {semesterFilter
                ? 'No courses in this semester.'
                : 'No courses yet. Add your first course above.'}
            </p>
          )}
          {selected && (
            <section aria-label="Selected course">
              <h2>{selected.name}</h2>
  <form
    onSubmit={saveCourse}
    key={
    selected.id +
    ':course:' +
    selected.name +
    ':' +
    selected.location +
    ':' +
    selected.notes
  }
>
  <h3>Edit course information</h3>

  <label>
    Course name
    <input
      name="name"
      required
      maxLength={200}
      defaultValue={selected.name}
    />
  </label>

  <label>
    Location (optional)
    <input
      name="location"
      type="text"
      defaultValue={selected.location ?? ''}
    />
  </label>

  <label>
    Notes (optional)
    <textarea
      name="notes"
      defaultValue={selected.notes ?? ''}
    />
  </label>

  <button disabled={busy}>
    {busy ? 'Saving…' : 'Save course information'}
  </button>

  <button type="reset" disabled={busy}>
    Cancel
  </button>
</form>
              <p>
                Course code:{' '}
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {selected.code || 'Not set'}
                </span>
              </p>
              <form
                onSubmit={(event) => saveField(event, 'code')}
                key={selected.id + ':' + selected.code}
              >
                <label>
                  Edit course code
                  <input
                    name="code"
                    type="text"
                    defaultValue={selected.code ?? ''}
                  />
                </label>
                <button disabled={busy}>
                  {busy ? 'Saving…' : 'Save code'}
                </button>
                <button type="reset" disabled={busy}>
                  Cancel
                </button>
              </form>
              <p>Instructor: {selected.instructor || 'Not set'}</p>
              <form
                onSubmit={(event) => saveField(event, 'instructor')}
                key={selected.id + ':instructor:' + selected.instructor}
              >
                <label>
                  Edit instructor
                  <input
                    name="instructor"
                    type="text"
                    defaultValue={selected.instructor ?? ''}
                  />
                </label>
                <button disabled={busy}>
                  {busy ? 'Saving…' : 'Save instructor'}
                </button>
                <button type="reset" disabled={busy}>
                  Cancel
                </button>
              </form>
              <p>Semester: {selected.semester || 'Not set'}</p>
              <form
                onSubmit={(event) => saveField(event, 'semester')}
                key={selected.id + ':semester:' + selected.semester}
              >
                <label>
                  Edit semester
                  <input
                    name="semester"
                    list="semester-options"
                    maxLength={100}
                    defaultValue={selected.semester ?? ''}
                  />
                </label>
                <button disabled={busy}>
                  {busy ? 'Saving…' : 'Save semester'}
                </button>
                <button type="reset" disabled={busy}>
                  Cancel
                </button>
              </form>
              <h3>Course schedule</h3>
              {selected.meetings.length ? (
                <ul>
                  {selected.meetings.map((meeting, index) => (
                    <li key={index}>
                      {meeting.day.toUpperCase()} {meeting.startTime}–
                      {meeting.endTime}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No meetings set.</p>
              )}
              <MeetingsEditor
                key={selected.id + JSON.stringify(selected.meetings)}
                meetings={selected.meetings}
                busy={busy}
                onSave={saveMeetings}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
