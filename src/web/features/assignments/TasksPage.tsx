import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  optionLabel,
  priorities,
  taskKinds,
  type Assignment,
} from '../../../shared/assignment.js';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import { listCourses, type SavedCourse } from '../courses/course-api.js';
import {
  completeAssignment,
  createAssignment,
  findAssignment,
  listAssignments,
  setAssignmentCourse,
  setAssignmentDue,
  setAssignmentKind,
  setAssignmentPriority,
} from './assignment-api.js';

const kindOptions = taskKinds.map((kind) => (
  <option key={kind} value={kind}>
    {optionLabel(kind)}
  </option>
));
const priorityOptions = priorities.map((priority) => (
  <option key={priority} value={priority}>
    {optionLabel(priority)}
  </option>
));

/** "2026-11-02 18:00", or just the date for a date-only deadline. */
const dueText = (task: Assignment) =>
  task.dueTime ? `${task.dueDate} ${task.dueTime}` : task.dueDate;

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
 * AT-05: each task has a Low, Medium, or High priority.
 * AT-03: each task can have a due date with an optional time.
 * AT-06: a task can be marked completed, once.
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
        priority: values.priority,
        dueDate: values.dueDate,
        dueTime: values.dueTime,
      });
      setTasks((previous) => [...previous, saved]);
      opening.current = null;
      setSelected(saved);
      form.reset();
      return 'Task saved.';
    });
  }

  /** Saves one detail of the open task and shows the saved result. */
  function saveTask(save: () => Promise<Assignment>, done: string) {
    void run(async () => {
      const saved = await save();
      setTasks((previous) =>
        previous.map((task) => (task.id === saved.id ? saved : task)),
      );
      setSelected(saved);
      return done;
    });
  }

  function saveDue(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    saveTask(
      () => setAssignmentDue(supabase, id, values),
      values.dueDate ? 'Due date saved.' : 'Due date cleared.',
    );
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
          Priority
          <select name="priority" defaultValue="medium">
            {priorityOptions}
          </select>
        </label>
        <label>
          Due date (optional)
          <input name="dueDate" type="date" />
        </label>
        <label>
          Due time (optional)
          <input name="dueTime" type="time" />
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
              <span className="tag">{optionLabel(task.kind)}</span>{' '}
              <span className="tag">{optionLabel(task.priority)} priority</span>
              {task.completedAt && (
                <>
                  {' '}
                  <span className="tag">Completed</span>
                </>
              )}
              {courseName(task) && ` — ${courseName(task)}`}
              {task.dueDate && ` — due ${dueText(task)}`}
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
              <dd>{optionLabel(selected.kind)}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{optionLabel(selected.priority)}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{selected.dueDate ? dueText(selected) : 'No due date'}</dd>
            </div>
            <div>
              <dt>Course</dt>
              <dd>{courseName(selected) ?? 'No course'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {selected.completedAt
                  ? `Completed on ${new Date(selected.completedAt).toLocaleString()}`
                  : 'Not completed'}
              </dd>
            </div>
          </dl>
          {!selected.completedAt && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                saveTask(
                  () => completeAssignment(supabase, selected.id),
                  'Task completed.',
                )
              }
            >
              {busy ? 'Saving…' : 'Mark completed'}
            </button>
          )}
          <label>
            Change type
            <select
              value={selected.kind}
              disabled={busy}
              onChange={(event) =>
                saveTask(
                  () =>
                    setAssignmentKind(
                      supabase,
                      selected.id,
                      event.target.value,
                    ),
                  'Type saved.',
                )
              }
            >
              {kindOptions}
            </select>
          </label>
          <label>
            Change priority
            <select
              value={selected.priority}
              disabled={busy}
              onChange={(event) =>
                saveTask(
                  () =>
                    setAssignmentPriority(
                      supabase,
                      selected.id,
                      event.target.value,
                    ),
                  'Priority saved.',
                )
              }
            >
              {priorityOptions}
            </select>
          </label>
          <form
            onSubmit={(event) => saveDue(event, selected.id)}
            key={`${selected.id}:${selected.dueDate}:${selected.dueTime}`}
          >
            <label>
              Due date
              <input
                name="dueDate"
                type="date"
                defaultValue={selected.dueDate ?? ''}
              />
            </label>
            <label>
              Due time (optional)
              <input
                name="dueTime"
                type="time"
                defaultValue={selected.dueTime ?? ''}
              />
            </label>
            <p>Leave both blank to remove the due date.</p>
            <button disabled={busy}>
              {busy ? 'Saving…' : 'Save due date'}
            </button>
            <button type="reset" disabled={busy}>
              Cancel
            </button>
          </form>
          <label>
            Change course
            <select
              value={selected.courseId ?? ''}
              disabled={busy}
              onChange={(event) =>
                saveTask(
                  () =>
                    setAssignmentCourse(
                      supabase,
                      selected.id,
                      event.target.value || null,
                    ),
                  'Course saved.',
                )
              }
            >
              {courseOptions}
            </select>
          </label>
        </section>
      )}
    </>
  );
}
