
import type { SupabaseClient } from '@supabase/supabase-js';

export type Notification = {
  id: string;
  source_type: 'assignment' | 'exam' | 'study_session';
  source_id: string;
  scheduled_for: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

/** Retrieves the signed-in student's notifications, newest first. */
export async function listNotifications(client: SupabaseClient) {
  const { data, error } = await client
    .from('notifications')
    .select(
      'id, source_type, source_id, scheduled_for, title, message, created_at, read_at',
    )
    .order('created_at', { ascending: false });

  if (error) throw new Error('Unable to load notifications.');

  return (data ?? []) as Notification[];
}

/** Marks one of the signed-in student's notifications as read. */
export async function markNotificationRead(
  client: SupabaseClient,
  notificationId: unknown,
) {
  if (
    typeof notificationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      notificationId,
    )
  ) {
    throw new Error('Invalid notification identifier.');
  }

  const { data, error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw new Error('Unable to update notification.');

  return Boolean(data);
}
