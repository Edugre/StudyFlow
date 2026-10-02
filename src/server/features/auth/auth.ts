import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Request, Response } from 'express';

export const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const derive = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, stored] = hash.split(':');
  if (!salt || !stored) return false;
  const actual = await derive(password, salt);
  const expected = Buffer.from(stored, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function sessionToken(request: Request) {
  return (
    request.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('studyflow_session='))
      ?.slice('studyflow_session='.length) ?? ''
  );
}
export function currentUser(db: DatabaseSync, request: Request) {
  return db
    .prepare(
      'SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?',
    )
    .get(digest(sessionToken(request)), Date.now()) as
    { id: string; email: string } | undefined;
}
export function clearSession(response: Response) {
  response.clearCookie('studyflow_session', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}
export function startSession(
  db: DatabaseSync,
  request: Request,
  response: Response,
  userId: string,
) {
  db.prepare(
    'DELETE FROM sessions WHERE token_hash = ? OR expires_at <= ?',
  ).run(digest(sessionToken(request)), Date.now());
  const token = randomBytes(32).toString('hex');
  const lifetime = 7 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(
    digest(token),
    userId,
    Date.now() + lifetime,
  );
  response.cookie('studyflow_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: lifetime,
  });
}
export { randomUUID };
