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
type SavedCourse = { id: string; name: string; code: string | null };
export function CoursesPage() {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('login');
  const [courses, setCourses] = useState<SavedCourse[]>([]);
  const [selected, setSelected] = useState<SavedCourse | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
  async function saveCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { course } = await api(`/courses/${selected.id}/code`, values);
      setSelected(course);
      setCourses((previous) =>
        previous.map((item) => (item.id === course.id ? course : item)),
      );
      setMessage('Course code saved.');
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
            <button disabled={busy}>{busy ? 'Saving…' : 'Add course'}</button>
          </form>
          <h2>Saved courses</h2>
          {courses.length ? (
            <ul>
              {courses.map((course) => (
                <li key={course.id}>
                  <button disabled={busy} onClick={() => reopen(course.id)}>
                    {course.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No courses yet. Add your first course above.</p>
          )}
          {selected && (
            <section aria-label="Selected course">
              <h2>{selected.name}</h2>
              <p>
                Course code:{' '}
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {selected.code || 'Not set'}
                </span>
              </p>
              <form onSubmit={saveCode} key={selected.id + ':' + selected.code}>
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
            </section>
          )}
        </>
      )}
    </>
  );
}
