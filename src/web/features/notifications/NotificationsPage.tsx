
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import {
  listNotifications,
  markNotificationRead,
  type Notification,
} from './notification-api.js';
import { AuthGate } from '../auth/AuthGate.js';

function NotificationList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    try {
      const results = await listNotifications(supabase);
      setNotifications(results);
      setError('');
    } catch {
      setError('Unable to load your notifications.');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markAsRead(id: string) {
    setBusyId(id);
    setError('');

    try {
      await markNotificationRead(supabase, id);
      await loadNotifications();
    } catch {
      setError('Unable to mark this notification as read.');
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return <p>Loading notifications…</p>;

  return (
    <section aria-labelledby="notification-heading">
      <h2 id="notification-heading">Your notifications</h2>

      {error && <p role="alert">{error}</p>}

      {notifications.length === 0 ? (
        <p>You don't have any notifications yet.</p>
      ) : (
        <ul>
          {notifications.map((notification) => (
            <li key={notification.id}>
              <article>
                <h3>{notification.title}</h3>
                <p>{notification.message}</p>
                <p>
                  <time dateTime={notification.created_at}>
                    {new Date(notification.created_at).toLocaleString()}
                  </time>
                </p>

                {notification.read_at ? (
                  <p>Read</p>
                ) : (
                  <>
                    <p>Unread</p>
                    <button
                      type="button"
                      disabled={busyId === notification.id}
                      onClick={() => markAsRead(notification.id)}
                    >
                      {busyId === notification.id
                        ? 'Updating…'
                        : 'Mark as read'}
                    </button>
                  </>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NotificationsPage() {
  return (
    <>
      <h1>Notifications</h1>
      <p>Keep track of your assignment, exam, and study-session reminders.</p>
      <AuthGate>{() => <NotificationList />}</AuthGate>
    </>
  );
}
