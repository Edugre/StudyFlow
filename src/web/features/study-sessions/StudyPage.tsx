import { useEffect, useState, type FormEvent } from 'react';
import {
  bySchedule,
  type StudySession,
} from '../../../shared/study-session.js';
import { supabase } from '../../lib/supabase.js';
import { AuthGate } from '../auth/AuthGate.js';
import { createStudySession, listStudySessions } from './session-api.js';

export function StudyPage() {
  return (
    <>
      <h1>Study planner</h1>
      <AuthGate>{() => <Schedule />}</AuthGate>
    </>
  );
}

/** "2026-11-02 18:00 (90 min)" */
const whenText = (session: StudySession) =>
  `${session.date} ${session.startTime} (${session.durationMinutes} min)`;

/**
 * SP-01: the student's schedule of study sessions, and a form to reserve
 * a new one with a date, start time and duration.
 */
function Schedule() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    listStudySessions(supabase)
      .then((saved) => {
        if (!active) return;
        setSessions(saved);
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  function addSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError('');
    setMessage('');
    // Invalid input is rejected before the request, so nothing is created.
    createStudySession(supabase, {
      date: values.date,
      startTime: values.startTime,
      durationMinutes:
        values.durationMinutes === '' ? NaN : Number(values.durationMinutes),
    })
      .then((saved) => {
        setSessions((previous) => bySchedule([...previous, saved]));
        form.reset();
        setMessage('Study session saved.');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Request failed');
      })
      .finally(() => setBusy(false));
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <h2>Add a study session</h2>
      <form onSubmit={addSession}>
        <label>
          Date
          <input name="date" type="date" required />
        </label>
        <label>
          Start time
          <input name="startTime" type="time" required />
        </label>
        <label>
          Duration (minutes)
          <input
            name="durationMinutes"
            type="number"
            min={1}
            max={1440}
            step={1}
            required
          />
        </label>
        <button disabled={busy}>
          {busy ? 'Saving…' : 'Add study session'}
        </button>
      </form>
      <h2>Your schedule</h2>
      {!loaded ? (
        !error && <p>Loading study sessions…</p>
      ) : sessions.length ? (
        <ol>
          {sessions.map((session) => (
            <li key={session.id}>{whenText(session)}</li>
          ))}
        </ol>
      ) : (
        <p>No study sessions yet. Add your first session above.</p>
      )}
    </>
  );
}
