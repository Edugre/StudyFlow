import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase.js';

type User = { email?: string };

async function authenticate(mode: string, email: unknown, password: unknown) {
  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error('Enter a valid email and a password of 12–128 characters.');
  const credentials = { email: email.trim().toLowerCase(), password };
  if (mode === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw new Error('Email or password is incorrect.');
    return data.user;
  }
  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) throw new Error('Unable to create account with these details.');
  // With email confirmation enabled, sign-up returns no session.
  return data.session ? data.user : null;
}

/**
 * Shows the sign-in form until a student is signed in, then renders the page.
 * Signing out unmounts the page, so its state never outlives the session.
 */
export function AuthGate({
  children,
}: {
  children: (user: User) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setUser(data.session?.user ?? null);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const signedIn = await authenticate(mode, values.email, values.password);
      if (!signedIn) {
        setMessage('Check your email to confirm your account, then sign in.');
        setMode('login');
        return;
      }
      setUser(signedIn);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error('Unable to sign out. Try again.');
      setUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!ready ? (
        <p>Loading your workspace…</p>
      ) : !user ? (
        <>
          <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          <form onSubmit={submit} key={mode}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <p>Use a password of 12–128 characters.</p>
            <button disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
          <button
            disabled={busy}
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
          </button>
        </>
      ) : (
        <>
          <p>Signed in as {user.email}</p>
          <button disabled={busy} onClick={logout}>
            Sign out
          </button>
          {children(user)}
        </>
      )}
    </>
  );
}
