import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Assignment } from '../../../shared/assignment.js';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import {
  createAssignment,
  findAssignment,
  listAssignments,
} from './assignment-api.js';

export function TasksPage() {
  return (
    <>
      <h1>Tasks</h1>
      <AuthGate>{() => <TaskList />}</AuthGate>
    </>
  );
}

/** AT-01: every task the student has saved, with or without a course. */
function TaskList() {
  const [tasks, setTasks] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Assignment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // The most recently opened task id; older responses are discarded.
  const opening = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    listAssignments(supabase)
      .then((saved) => {
        if (!active) return;
        setTasks(saved);
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
      const saved = await createAssignment(supabase, { title: values.title });
      setTasks((previous) => [...previous, saved]);
      opening.current = null;
      setSelected(saved);
      form.reset();
      return 'Task saved.';
    });
  }

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
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No tasks yet. Add your first task above.</p>
      )}
      {selected && (
        <section aria-label="Selected task">
          <h2>{selected.title}</h2>
        </section>
      )}
    </>
  );
}
