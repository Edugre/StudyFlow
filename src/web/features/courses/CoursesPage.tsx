import { CourseDetails } from './CourseDetails.js';
import { Coursework } from './Coursework.js';
import { MeetingsEditor } from './MeetingsEditor.js';
import type { CourseMeeting } from '../../../shared/course.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase.js';
import {
  createCourse,
  deleteCourse as removeCourse,
  findCourse,
  listCourses,
  replaceMeetings,
  updateCourse,
  updateCourseField,
  type SavedCourse,
} from './course-api.js';
import { getCurrentSemester, setCurrentSemester } from './settings-api.js';

/** Loads everything the signed-in workspace shows at once. */
async function loadWorkspace() {
  const [courses, currentSemester] = await Promise.all([
    listCourses(supabase),
    getCurrentSemester(supabase),
  ]);
  return { courses, currentSemester };
}

async function authenticate(mode: string, email: unknown, password: unknown) {
  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error('Enter a valid email and a password of 12–128 characters.');
  const credentials = { email: email.trim().toLowerCase(), password };
  if (mode === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw new Error('Email or password is incorrect.');
    return data.user;
  }
  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) throw new Error('Unable to create account with these details.');
  // With email confirmation enabled, sign-up returns no session.
  return data.session ? data.user : null;
}
export function CoursesPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('login');
  const [courses, setCourses] = useState<SavedCourse[]>([]);
  const [selected, setSelected] = useState<SavedCourse | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [currentSemester, setCurrent] = useState<string | null>(null);
  // The current semester stays selectable even after its last course moves.
  const semesters = [
    ...new Set(
      [...courses.map((course) => course.semester), currentSemester].filter(
        (semester): semester is string => Boolean(semester),
      ),
    ),
  ].sort();
  const visibleCourses = semesterFilter
    ? courses.filter((course) => course.semester === semesterFilter)
    : courses;
  const [busy, setBusy] = useState(false);
  // The most recently opened course id; older responses are discarded.
  const opening = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const sessionUser = data.session?.user ?? null;
        const saved = sessionUser ? await loadWorkspace() : null;
        if (active) {
          setUser(sessionUser);
          if (saved) showWorkspace(saved);
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
  function showWorkspace(saved: Awaited<ReturnType<typeof loadWorkspace>>) {
    setCourses(saved.courses);
    setCurrent(saved.currentSemester);
    // CM-08: the list opens on the current semester when one is chosen.
    setSemesterFilter(saved.currentSemester ?? '');
  }
  async function chooseCurrentSemester(value: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await setCurrentSemester(supabase, value);
      setCurrent(saved);
      setSemesterFilter(saved ?? '');
      opening.current = null;
      setSelected(null);
      setMessage(
        saved ? 'Current semester saved.' : 'Current semester cleared.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  function replaceCourse(course: SavedCourse) {
    setSelected(course);
    setCourses((previous) =>
      previous.map((item) => (item.id === course.id ? course : item)),
    );
  }
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
      replaceCourse(
        await updateCourseField(supabase, selected.id, field, values[field]),
      );
      if (field === 'semester') setSemesterFilter('');
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
      // The form edits name/location/notes; keep the other saved fields.
      replaceCourse(
        await updateCourse(supabase, selected.id, {
          ...selected,
          ...values,
        }),
      );
      setMessage('Course information saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function deleteCourse() {
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete ${selected.name}? This action cannot be undone. Its assignments and study sessions are kept without a course.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!(await removeCourse(supabase, selected.id)))
        throw new Error('Course not found');
      setSelected(null);
      setCourses((previous) =>
        previous.filter((item) => item.id !== selected.id),
      );
      setMessage('Course deleted.');
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
      replaceCourse(await replaceMeetings(supabase, selected.id, meetings));
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
        const signedIn = await authenticate(
          mode,
          values.email,
          values.password,
        );
        if (!signedIn) {
          setMessage('Check your email to confirm your account, then sign in.');
          setMode('login');
          return;
        }
        showWorkspace(await loadWorkspace());
        setUser(signedIn);
      } else {
        const course = await createCourse(supabase, values);
        setCourses((previous) => [...previous, course]);
        opening.current = null;
        setSelected(course);
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
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error('Unable to sign out. Try again.');
      setUser(null);
      setCourses([]);
      opening.current = null;
      setSelected(null);
      setMessage('');
      setSemesterFilter('');
      setCurrent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function reopen(id: string) {
    opening.current = id;
    setError('');
    setSelected(null);
    try {
      const course = await findCourse(supabase, id);
      if (opening.current !== id) return;
      if (!course) throw new Error('Course not found');
      setSelected(course);
    } catch (e) {
      if (opening.current !== id) return;
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
            Current semester
            <select
              value={currentSemester ?? ''}
              disabled={busy}
              onChange={(event) => chooseCurrentSemester(event.target.value)}
            >
              <option value="">Not chosen</option>
              {semesters.map((semester) => (
                <option key={semester} value={semester}>
                  {semester}
                </option>
              ))}
            </select>
          </label>
          {!currentSemester && semesters.length > 0 && (
            <p>Choose your current semester to see only its courses.</p>
          )}
          <label>
            Filter by semester
            <select
              value={semesterFilter}
              disabled={busy}
              onChange={(event) => {
                setSemesterFilter(event.target.value);
                opening.current = null;
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
              {semesterFilter && semesterFilter === currentSemester
                ? 'No courses in your current semester.'
                : semesterFilter
                  ? 'No courses in this semester.'
                  : 'No courses yet. Add your first course above.'}
            </p>
          )}
          {selected && (
            <section aria-label="Selected course">
              <h2>{selected.name}</h2>
              <CourseDetails course={selected} />
              <Coursework
                key={selected.id}
                course={selected}
                courses={courses}
              />

              <button type="button" onClick={deleteCourse} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete course'}
              </button>
              <details>
                <summary>Edit course</summary>
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
                <MeetingsEditor
                  key={selected.id + JSON.stringify(selected.meetings)}
                  meetings={selected.meetings}
                  busy={busy}
                  onSave={saveMeetings}
                />
              </details>
            </section>
          )}
        </>
      )}
    </>
  );
}
