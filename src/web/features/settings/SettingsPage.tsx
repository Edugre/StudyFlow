
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase.js';
import {
  getReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from '../courses/settings-api.js';
import { AuthGate } from '../auth/AuthGate.js';

const timeZones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'UTC',
];

function ReminderSettingsForm() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    getReminderSettings(supabase)
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch(() => {
        if (active) setError('Unable to load your reminder settings.');
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  function updateSetting<K extends keyof ReminderSettings>(
    key: K,
    value: ReminderSettings[K],
  ) {
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const saved = await saveReminderSettings(supabase, settings);
      setSettings(saved);
      setMessage('Your reminder settings have been saved.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to save your reminder settings.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p>Loading reminder settings…</p>;

  if (!settings) {
    return (
      <p role="alert">
        {error || 'Unable to load your reminder settings.'}
      </p>
    );
  }

  const knownTimeZone = timeZones.includes(settings.time_zone);

  return (
    <form onSubmit={submit}>
      <section>
        <h2>Reminder preferences</h2>
        <p>Choose which reminders you would like to receive.</p>

        <label>
          <span>
            <input
              type="checkbox"
              checked={settings.assignment_reminders_enabled}
              onChange={(event) =>
                updateSetting(
                  'assignment_reminders_enabled',
                  event.target.checked,
                )
              }
            />{' '}
            Assignment reminders
          </span>
        </label>

        <label>
          <span>
            <input
              type="checkbox"
              checked={settings.exam_reminders_enabled}
              onChange={(event) =>
                updateSetting('exam_reminders_enabled', event.target.checked)
              }
            />{' '}
            Exam reminders
          </span>
        </label>

        <label>
          <span>
            <input
              type="checkbox"
              checked={settings.study_session_reminders_enabled}
              onChange={(event) =>
                updateSetting(
                  'study_session_reminders_enabled',
                  event.target.checked,
                )
              }
            />{' '}
            Study-session reminders
          </span>
        </label>
      </section>

      <section>
        <h2>Reminder timing</h2>
        <label>
          Remind me this many minutes before an event
          <input
            type="number"
            min="5"
            max="10080"
            step="5"
            required
            value={settings.reminder_lead_minutes}
            onChange={(event) =>
              updateSetting(
                'reminder_lead_minutes',
                Number(event.target.value),
              )
            }
          />
        </label>
        <p>Choose between 5 minutes and 7 days in advance.</p>
      </section>

      <section>
        <h2>Time zone</h2>
        <label>
          Your time zone
          <select
            value={
              knownTimeZone ? settings.time_zone : 'other'
            }
            onChange={(event) => {
              if (event.target.value !== 'other') {
                updateSetting('time_zone', event.target.value);
              }
            }}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
            {!knownTimeZone && (
              <option value="other">{settings.time_zone}</option>
            )}
          </select>
        </label>
        <p>
          Your time zone helps StudyFlow schedule reminders at the correct
          local time.
        </p>
      </section>

      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save reminder settings'}
      </button>
    </form>
  );
}

export function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <p>Manage your reminder preferences and time zone.</p>
      <AuthGate>{() => <ReminderSettingsForm />}</AuthGate>
    </>
  );
}
