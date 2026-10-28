import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  kindLabel,
  taskKinds,
  type Assignment,
} from '../../../shared/assignment.js';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import { listCourses, type SavedCourse } from '../courses/course-api.js';
import {
  createAssignment,
  findAssignment,
  listAssignments,
  setAssignmentCourse,
  setAssignmentKind,
} from './assignment-api.js';

const kindOptions = taskKinds.map((kind) => (
  <option key={kind} value={kind}>
    {kindLabel(kind)}
  </option>
));

export function TasksPage() {
  return (
    <>
      <h1>Tasks</h1>
      <AuthGate>{() => <TaskList />}</AuthGate>
    </>
  );
}

/**
 * AT-01: every task the student has saved, with or without a course.
 * AT-02: each task can be linked to one of the student's courses.
 * AT-04: each task is an assignment, exam, quiz, or project.
 */
function TaskList() {
  const [tasks, setTasks] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<SavedCourse[]>([]);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // The most recently opened task id; older responses are discarded.
  const opening = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listAssignments(supabase), listCourses(supabase)])
      .then(([savedTasks, savedCourses]) => {
        if (!active) return;
        setTasks(savedTasks);
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

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void run(async () => {
      const saved = await createAssignment(supabase, {
        title: values.title,
        courseId: values.courseId,
        kind: values.kind,
      });
      setTasks((previous) => [...previous, saved]);
      opening.current = null;
      setSelected(saved);
      form.reset();
      return 'Task saved.';
    });
  }

  function moveTask(id: string, courseId: string) {
    void run(async () => {
      const saved = await setAssignmentCourse(supabase, id, courseId || null);
      setTasks((previous) =>
        previous.map((task) => (task.id === id ? saved : task)),
      );
      setSelected(saved);
      return 'Course saved.';
    });
  }

  function changeKind(id: string, kind: string) {
    void run(async () => {
      const saved = await setAssignmentKind(supabase, id, kind);
      setTasks((previous) =>
        previous.map((task) => (task.id === id ? saved : task)),
      );
      setSelected(saved);
      return 'Type saved.';
    });
  }

  const courseName = (task: Assignment) =>
    courses.find((course) => course.id === task.courseId)?.name ?? null;

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

  async function reopen(id: string) {
    opening.current = id;
    setError('');
    setSelected(null);
    try {
      const task = await findAssignment(supabase, id);
      if (opening.current !== id) return;
      if (!task) throw new Error('Task not found');
      setSelected(task);
    } catch (e) {
      if (opening.current !== id) return;
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <h2>Add a task</h2>
      <form onSubmit={addTask}>
        <label>
          Title
          <input name="title" required maxLength={200} />
        </label>
        <label>
          Type
          <select name="kind" defaultValue="assignment">
            {kindOptions}
          </select>
        </label>
        <label>
          Course (optional)
          <select name="courseId" defaultValue="">
            {courseOptions}
          </select>
        </label>
        <button disabled={busy}>{busy ? 'Saving…' : 'Add task'}</button>
      </form>
      <h2>Your tasks</h2>
      {!loaded ? (
        !error && <p>Loading tasks…</p>
      ) : tasks.length ? (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <button disabled={busy} onClick={() => reopen(task.id)}>
                {task.title}
              </button>{' '}
              <span className="tag">{kindLabel(task.kind)}</span>
              {courseName(task) && ` — ${courseName(task)}`}
            </li>
          ))}
        </ul>
      ) : (
        <p>No tasks yet. Add your first task above.</p>
      )}
      {selected && (
        <section aria-label="Selected task">
          <h2>{selected.title}</h2>
          <dl className="course-details">
            <div>
              <dt>Type</dt>
              <dd>{kindLabel(selected.kind)}</dd>
            </div>
            <div>
              <dt>Course</dt>
              <dd>{courseName(selected) ?? 'No course'}</dd>
            </div>
          </dl>
          <label>
            Change type
            <select
              value={selected.kind}
              disabled={busy}
              onChange={(event) => changeKind(selected.id, event.target.value)}
            >
              {kindOptions}
            </select>
          </label>
          <label>
            Change course
            <select
              value={selected.courseId ?? ''}
              disabled={busy}
              onChange={(event) => moveTask(selected.id, event.target.value)}
            >
              {courseOptions}
            </select>
          </label>
        </section>
      )}
    </>
  );
}
