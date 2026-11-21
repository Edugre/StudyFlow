import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { durationText } from '../../../shared/study-session.js';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import { loadProgress, type Progress, type Scope } from './progress-api.js';

export function ProgressPage() {
  return (
    <>
      <h1>Progress</h1>
      <AuthGate>{() => <ProgressWorkspace />}</AuthGate>
    </>
  );
}

/** "90 min" → "1 h 30 min (90 minutes)" */
const minutesText = (minutes: number) =>
  `${durationText(minutes)} (${minutes} minutes)`;

/** A blank date field means that side of the period is open. */
const optionalDate = (value: FormDataEntryValue | null) =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * GP-06: how many tasks are completed and how many are not.
 * GP-07: how many study sessions are completed; canceled ones don't count.
 * GP-08: planned versus completed study time, optionally for a period.
 * Refreshing recomputes everything from the saved records.
 */
function ProgressWorkspace() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [scope, setScope] = useState<Scope>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (next: Scope) => {
    setBusy(true);
    setError('');
    try {
      setProgress(await loadProgress(supabase, next));
      setScope(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load progress.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh({});
  }, [refresh]);

  function choosePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void refresh({
      ...scope,
      from: optionalDate(values.get('from')),
      to: optionalDate(values.get('to')),
    });
  }

  const periodText =
    scope.from && scope.to
      ? `from ${scope.from} to ${scope.to}`
      : scope.from
        ? `from ${scope.from} on`
        : scope.to
          ? `through ${scope.to}`
          : 'for all dates';

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void refresh(scope)}>
        {busy ? 'Refreshing…' : 'Refresh progress'}
      </button>
      {progress ? (
        <>
          <section aria-labelledby="task-progress">
            <h2 id="task-progress">Assignments</h2>
            <dl className="course-details">
              <div>
                <dt>Completed</dt>
                <dd>{progress.tasks.completed}</dd>
              </div>
              <div>
                <dt>Incomplete</dt>
                <dd>{progress.tasks.incomplete}</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="study-progress">
            <h2 id="study-progress">Study sessions</h2>
            <dl className="course-details">
              <div>
                <dt>Completed sessions</dt>
                <dd>{progress.completedSessions}</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="study-time">
            <h2 id="study-time">Study time {periodText}</h2>
            <form onSubmit={choosePeriod}>
              <label>
                From (optional)
                <input name="from" type="date" defaultValue={scope.from} />
              </label>
              <label>
                To (optional)
                <input name="to" type="date" defaultValue={scope.to} />
              </label>
              <button disabled={busy}>Show study time</button>
            </form>
            <dl className="course-details">
              <div>
                <dt>Planned</dt>
                <dd>{minutesText(progress.studyTime.plannedMinutes)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{minutesText(progress.studyTime.completedMinutes)}</dd>
              </div>
            </dl>
            <p>
              <small>
                Completed time adds up the planned durations of completed
                sessions; it isn&apos;t measured. Canceled sessions are left
                out.
              </small>
            </p>
          </section>
        </>
      ) : (
        !error && <p>Loading progress…</p>
      )}
    </>
  );
}
