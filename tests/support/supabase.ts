import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Integration tests create throwaway accounts, so they only run against the
 * local stack (`npm run db:start`), never the hosted project.
 */
export const stack = !url
  ? 'Supabase is not configured; run `npm run db:start` and fill .env.local'
  : !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url) || !key
    ? 'VITE_SUPABASE_URL is not a local stack; integration tests skipped'
    : false;

export const client = () =>
  createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const password = 'a-fixture-password-long-enough';
export const email = () => `student-${randomUUID()}@example.com`;

/** Registers a fresh student and returns a client signed in as them. */
export async function account(address = email()) {
  const signedIn = client();
  const { error } = await signedIn.auth.signUp({ email: address, password });
  if (error) throw error;
  return signedIn;
}
