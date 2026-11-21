import { useEffect, useState, type FormEvent } from 'react';
import type { Goal } from '../../../shared/goal.js';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import { listCourses, type SavedCourse } from '../courses/course-api.js';
import { GoalDetails } from './GoalDetails.js';
import { createGoal, deleteGoal as removeGoal, listGoals } from './goal-api.js';

export function GoalsPage() {
  return (
    <>
      <h1>Goals</h1>
      <AuthGate>{() => <GoalsWorkspace />}</AuthGate>
    </>
  );
}

/**
 * GP-01: the student's academic goals, newest first, with a form to add one.
 * GP-02: a goal can have a target date.
 * GP-03: a goal can be linked to a course, and the list can show only one
 * course's goals.
 */
function GoalsWorkspace() {
  const [ready, setReady] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [courses, setCourses] = useState<SavedCourse[]>([]);
  // '' shows every goal; otherwise only goals linked to this course id.
  const [courseFilter, setCourseFilter] = useState('');
  const [selected, setSelected] = useState<Goal | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listGoals(supabase), listCourses(supabase)])
      .then(([savedGoals, savedCourses]) => {
        if (!active) return;
        setGoals(savedGoals);
        setCourses(savedCourses);
        setReady(true);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Unable to load goals.');
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const courseName = (goal: Goal) =>
    courses.find((course) => course.id === goal.courseId)?.name ?? null;
  const shown = courseFilter
    ? goals.filter((goal) => goal.courseId === courseFilter)
    : goals;
  const courseOptions = courses.map((course) => (
    <option key={course.id} value={course.id}>
      {course.name}
    </option>
  ));

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    void run(async () => {
      const goal = await createGoal(supabase, values);
      setGoals((previous) => [goal, ...previous]);
      setSelected(goal);
      form.reset();
      return 'Goal saved.';
    });
  }

  /** Saves a change to the selected goal and replaces it in the list. */
  function handleUpdate(change: () => Promise<Goal>, success: string) {
    void run(async () => {
      const saved = await change();
      setGoals((previous) =>
        previous.map((item) => (item.id === saved.id ? saved : item)),
      );
      setSelected(saved);
      return success;
    });
  }

  function handleDelete(goal: Goal) {
    const confirmed = window.confirm(
      `Delete ${goal.title}? This action cannot be undone.`,
    );
    if (!confirmed) return;
    void run(async () => {
      if (!(await removeGoal(supabase, goal.id)))
        throw new Error('Goal not found');
      if (selected?.id === goal.id) setSelected(null);
      setGoals((previous) => previous.filter((item) => item.id !== goal.id));
      return 'Goal deleted.';
    });
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
            <label>
              Course (optional)
              <select name="courseId" defaultValue="">
                <option value="">No course</option>
                {courseOptions}
              </select>
            </label>
            <button disabled={busy}>{busy ? 'Saving…' : 'Add goal'}</button>
          </form>

          <h2>Saved goals</h2>
          {courses.length > 0 && (
            <label>
              Show goals for
              <select
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
              >
                <option value="">All courses</option>
                {courseOptions}
              </select>
            </label>
          )}
          {shown.length ? (
            <ul>
              {shown.map((goal) => (
                <li key={goal.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected(goal)}
                  >
                    {goal.title}
                  </button>
                  {courseName(goal) && (
                    <>
                      {' '}
                      <span className="tag">{courseName(goal)}</span>
                    </>
                  )}
                  {goal.targetDate && <> due by {goal.targetDate}</>}
                </li>
              ))}
            </ul>
          ) : courseFilter ? (
            <p>No goals are linked to this course.</p>
          ) : (
            <p>No goals yet. Add your first goal above.</p>
          )}

          {selected && (
            <GoalDetails
              goal={selected}
              courseName={courseName(selected)}
              courseOptions={courseOptions}
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
