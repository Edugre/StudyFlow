import type { FormEvent, ReactNode } from 'react';
import type { Goal } from '../../../shared/goal.js';
import { setGoalCourse, setGoalTargetDate } from './goal-api.js';
import { supabase } from '../../lib/supabase.js';

type GoalDetailsProps = {
  goal: Goal;
  /** The linked course's name, or null when the goal has none. */
  courseName: string | null;
  courseOptions: ReactNode;
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
 * GP-03: it can be linked to a course, moved to another, or unlinked.
 */
export function GoalDetails({
  goal,
  courseName,
  courseOptions,
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

  function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = field(event, 'courseId');
    onUpdate(
      () => setGoalCourse(supabase, goal.id, value),
      value ? 'Course saved.' : 'Goal unlinked from its course.',
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
          <dt>Course</dt>
          <dd>{courseName ?? 'No course'}</dd>
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
      <form key={`course-${goal.id}`} onSubmit={saveCourse}>
        <label>
          Course
          <select name="courseId" defaultValue={goal.courseId ?? ''}>
            <option value="">No course</option>
            {courseOptions}
          </select>
        </label>
        <button disabled={busy}>Save course</button>
      </form>
      <button type="button" onClick={() => onDelete(goal)} disabled={busy}>
        {busy ? 'Working…' : 'Delete goal'}
      </button>
    </section>
  );
}
