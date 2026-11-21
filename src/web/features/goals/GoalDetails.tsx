import type { FormEvent } from 'react';
import type { Goal } from '../../../shared/goal.js';
import { setGoalTargetDate } from './goal-api.js';
import { supabase } from '../../lib/supabase.js';

type GoalDetailsProps = {
  goal: Goal;
  busy: boolean;
  onDelete: (goal: Goal) => void;
  /** Runs a change to the goal and shows the saved result, or its error. */
  onUpdate: (change: () => Promise<Goal>, success: string) => void;
};

/** The value of one named field of a submitted form. */
const field = (event: FormEvent<HTMLFormElement>, name: string) =>
  new FormData(event.currentTarget).get(name) ?? '';

/**
 * GP-01: a reopened goal with its description.
 * GP-02: its target date can be set, changed or cleared.
 */
export function GoalDetails({
  goal,
  busy,
  onDelete,
  onUpdate,
}: GoalDetailsProps) {
  function saveTargetDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = field(event, 'targetDate');
    onUpdate(
      () => setGoalTargetDate(supabase, goal.id, value),
      value ? 'Target date saved.' : 'Target date cleared.',
    );
  }

  return (
    <section aria-label="Selected goal">
      <h2>{goal.title}</h2>
      <p>{goal.message}</p>
      <dl className="course-details">
        <div>
          <dt>Target date</dt>
          <dd>{goal.targetDate ?? 'None'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{new Date(goal.createdAt).toLocaleString()}</dd>
        </div>
      </dl>
      <form key={`date-${goal.id}`} onSubmit={saveTargetDate}>
        <label>
          Target date (leave blank for none)
          <input
            name="targetDate"
            type="date"
            defaultValue={goal.targetDate ?? ''}
          />
        </label>
        <button disabled={busy}>Save target date</button>
      </form>
      <button type="button" onClick={() => onDelete(goal)} disabled={busy}>
        {busy ? 'Working…' : 'Delete goal'}
      </button>
    </section>
  );
}
