import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  listNotifications,
  markNotificationRead,
} from '../src/web/features/notifications/notification-api.js';
import { account, stack } from './support/supabase.js';

// Students cannot create notifications, so a fresh account always starts with
// none. Ordering and read status are covered by notification_history.test.sql.
test(
  'RN-08: a student with no notifications gets an empty history',
  { skip: stack },
  async () => {
    const student = await account();
    assert.deepEqual(await listNotifications(student), []);
    assert.equal(await markNotificationRead(student, randomUUID()), false);
  },
);
