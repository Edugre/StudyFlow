import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getReminderSettings,
  saveReminderSettings,
} from '../src/web/features/courses/settings-api.js';
import { account, stack } from './support/supabase.js';

test(
  'RN-04: a saved lead time persists, and invalid ones keep the saved one',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();

    const initial = await getReminderSettings(student);
    assert.equal(initial.reminder_lead_minutes, 60);

    const saved = await saveReminderSettings(student, {
      ...initial,
      reminder_lead_minutes: 1440,
    });
    assert.equal(saved.reminder_lead_minutes, 1440);
    assert.equal(
      (await getReminderSettings(student)).reminder_lead_minutes,
      1440,
    );

    for (const invalid of [4, 10081, 30.5, Number.NaN])
      await assert.rejects(
        saveReminderSettings(student, {
          ...saved,
          reminder_lead_minutes: invalid,
        }),
        /between 5 and 10080 minutes/,
      );
    assert.equal(
      (await getReminderSettings(student)).reminder_lead_minutes,
      1440,
    );

    // Each student's lead time is their own.
    assert.equal((await getReminderSettings(other)).reminder_lead_minutes, 60);
  },
);
