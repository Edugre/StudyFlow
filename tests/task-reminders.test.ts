import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createAssignment,
  editAssignment,
  findAssignment,
  setAssignmentReminders,
} from '../src/web/features/assignments/assignment-api.js';
import { account, stack } from './support/supabase.js';

test(
  'RN-06: turning off one task’s reminders persists and leaves other tasks on',
  { skip: stack },
  async () => {
    const student = await account();
    const other = await account();

    const essay = await createAssignment(student, {
      title: 'Essay',
      dueDate: '2026-12-01',
    });
    const lab = await createAssignment(student, {
      title: 'Lab',
      dueDate: '2026-12-01',
    });
    assert.equal(essay.remindersEnabled, true);

    const muted = await setAssignmentReminders(student, essay.id, false);
    assert.equal(muted.remindersEnabled, false);
    assert.equal(
      (await findAssignment(student, essay.id))?.remindersEnabled,
      false,
    );
    assert.equal(
      (await findAssignment(student, lab.id))?.remindersEnabled,
      true,
    );

    // Editing the task's other details keeps its reminder setting.
    await editAssignment(student, essay.id, {
      title: 'Final essay',
      dueDate: '2026-12-02',
    });
    assert.equal(
      (await findAssignment(student, essay.id))?.remindersEnabled,
      false,
    );

    await assert.rejects(
      setAssignmentReminders(student, essay.id, 'on'),
      /whether this task sends reminders/,
    );
    await assert.rejects(
      setAssignmentReminders(other, lab.id, false),
      /Assignment not found/,
    );
    assert.equal(
      (await findAssignment(student, lab.id))?.remindersEnabled,
      true,
    );

    const resumed = await setAssignmentReminders(student, essay.id, true);
    assert.equal(resumed.remindersEnabled, true);
  },
);
