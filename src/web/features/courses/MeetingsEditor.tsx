import { useState, type FormEvent } from 'react';
import type { CourseMeeting, Weekday } from '../../../shared/course.js';
const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export function MeetingsEditor({
  meetings,
  busy,
  onSave,
}: {
  meetings: CourseMeeting[];
  busy: boolean;
  onSave: (meetings: CourseMeeting[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CourseMeeting[]>(meetings);
  const update = (index: number, value: Partial<CourseMeeting>) =>
    setDraft((previous) =>
      previous.map((meeting, i) =>
        i === index ? { ...meeting, ...value } : meeting,
      ),
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(draft);
  };
  return (
    <form onSubmit={submit}>
      <h3>Edit meetings</h3>
      {draft.map((meeting, index) => (
        <fieldset key={index} disabled={busy}>
          <legend>Meeting {index + 1}</legend>
          <label>
            Day
            <select
              value={meeting.day}
              onChange={(event) =>
                update(index, { day: event.target.value as Weekday })
              }
            >
              {weekdays.map((day) => (
                <option key={day} value={day}>
                  {day.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start time
            <input
              type="time"
              required
              value={meeting.startTime}
              onChange={(event) =>
                update(index, { startTime: event.target.value })
              }
            />
          </label>
          <label>
            End time
            <input
              type="time"
              required
              value={meeting.endTime}
              onChange={(event) =>
                update(index, { endTime: event.target.value })
              }
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setDraft((previous) => previous.filter((_, i) => i !== index))
            }
          >
            Remove meeting {index + 1}
          </button>
        </fieldset>
      ))}
      <p>Times are local and must end later on the same day.</p>
      <button
        type="button"
        disabled={busy || draft.length >= 100}
        onClick={() =>
          setDraft((previous) => [
            ...previous,
            { day: 'mon', startTime: '', endTime: '' },
          ])
        }
      >
        Add meeting
      </button>
      <button disabled={busy}>{busy ? 'Saving…' : 'Save meetings'}</button>
      <button type="button" disabled={busy} onClick={() => setDraft(meetings)}>
        Cancel
      </button>
    </form>
  );
}
