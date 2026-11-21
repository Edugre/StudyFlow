import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getReminderSettings,
  saveReminderSettings,
} from '../src/web/features/courses/settings-api.js';
import { account, stack } from './support/supabase.js';

test(
  'RN-07: each notification category can be turned off and back on',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();

    const initial = await getReminderSettings(student);
    assert.equal(initial.assignment_reminders_enabled, true);
    assert.equal(initial.exam_reminders_enabled, true);
    assert.equal(initial.study_session_reminders_enabled, true);
    assert.equal(initial.overdue_notifications_enabled, true);

    const allOff = {
      ...initial,
      assignment_reminders_enabled: false,
      exam_reminders_enabled: false,
      study_session_reminders_enabled: false,
      overdue_notifications_enabled: false,
    };
    assert.deepEqual(await saveReminderSettings(student, allOff), allOff);
    assert.deepEqual(await getReminderSettings(student), allOff);

    // Turning one category back on leaves the others as saved.
    const overdueOnly = { ...allOff, overdue_notifications_enabled: true };
    await saveReminderSettings(student, overdueOnly);
    assert.deepEqual(await getReminderSettings(student), overdueOnly);

    // Each student's categories are their own.
    assert.equal(
      (await getReminderSettings(other)).overdue_notifications_enabled,
      true,
    );
    assert.equal(
      (await getReminderSettings(other)).assignment_reminders_enabled,
      true,
    );
  },
);
