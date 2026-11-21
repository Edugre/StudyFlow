import { useEffect, useState, type FormEvent } from 'react';
import { AuthGate } from '../auth/AuthGate.js';
import { supabase } from '../../lib/supabase.js';
import { GoalDetails } from './GoalDetails.js';
import type { Goal } from '../../../shared/goal.js';
import { createGoal, deleteGoal as removeGoal, listGoals } from './goal-api.js';

export function GoalsPage() {
  return (
    <>
      <h1>Goals</h1>
      <AuthGate>{() => <GoalsWorkspace />}</AuthGate>
    </>
  );
}

function GoalsWorkspace() {
  const [ready, setReady] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selected, setSelected] = useState<Goal | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    listGoals(supabase)
      .then((saved) => {
        if (active) {
          setGoals(saved);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Unable to load goals.');
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const goal = await createGoal(supabase, values);
      setGoals((previous) => [goal, ...previous]);
      setSelected(goal);
      setMessage('Goal saved.');
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  /** Saves a change to the selected goal and replaces it in the list. */
  async function handleUpdate(change: () => Promise<Goal>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await change();
      setGoals((previous) =>
        previous.map((item) => (item.id === saved.id ? saved : item)),
      );
      setSelected(saved);
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(goal: Goal) {
    const confirmed = window.confirm(
      `Delete ${goal.title}? This action cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!(await removeGoal(supabase, goal.id))) {
        throw new Error('Goal not found');
      }
      if (selected?.id === goal.id) setSelected(null);
      setGoals((previous) => previous.filter((item) => item.id !== goal.id));
      setMessage('Goal deleted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!ready ? (
        !error && <p>Loading goals…</p>
      ) : (
        <>
          <h2>Add a goal</h2>
          <form onSubmit={submit}>
            <label>
              Goal title
              <input
                name="title"
                maxLength={120}
                placeholder="e.g. Finish biology study guide"
              />
            </label>
            <label>
              Description
              <textarea
                name="message"
                maxLength={500}
                rows={3}
                placeholder="Describe your academic goal..."
              />
            </label>
            <label>
              Target date (optional)
              <input name="targetDate" type="date" />
            </label>
            <button disabled={busy}>{busy ? 'Saving…' : 'Add goal'}</button>
          </form>

          <h2>Saved goals</h2>
          {goals.length ? (
            <ul>
              {goals.map((goal) => (
                <li key={goal.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(goal)}
                  >
                    {goal.title}
                  </button>
                  {goal.targetDate && <> due by {goal.targetDate}</>}
                </li>
              ))}
            </ul>
          ) : (
            <p>No goals yet. Add your first goal above.</p>
          )}

          {selected && (
            <GoalDetails
              goal={selected}
              busy={busy}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          )}
        </>
      )}
    </>
  );
}
