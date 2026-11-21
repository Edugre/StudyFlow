import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import { loadProgress, type Progress } from './progress-api.js';

export function ProgressPage() {
  return (
    <>
      <h1>Progress</h1>
      <AuthGate>{() => <ProgressWorkspace />}</AuthGate>
    </>
  );
}

/**
 * GP-06: how many tasks are completed and how many are not. Refreshing
 * recomputes the counts from the saved records.
 */
function ProgressWorkspace() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setProgress(await loadProgress(supabase));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load progress.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void refresh()}>
        {busy ? 'Refreshing…' : 'Refresh progress'}
      </button>
      {progress ? (
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
      ) : (
        !error && <p>Loading progress…</p>
      )}
    </>
  );
}
