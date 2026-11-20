import type { Goal } from './goal-api.js';

type GoalDetailsProps = {
  goal: Goal;
  busy: boolean;
  onDelete: (goal: Goal) => void;
};

export function GoalDetails({ goal, busy, onDelete }: GoalDetailsProps) {
  return (
    <section aria-label="Selected goal">
      <h2>{goal.title}</h2>
      <p>{goal.message}</p>
      <p>
        <small>Created {new Date(goal.created_at).toLocaleString()}</small>
      </p>
      <button
        type="button"
        onClick={() => onDelete(goal)}
        disabled={busy}
      >
        {busy ? 'Deleting…' : 'Delete goal'}
      </button>
    </section>
  );
}
