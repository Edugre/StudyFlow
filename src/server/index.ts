import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { openDatabase } from './db/database.js';

const port = Number(process.env.PORT ?? '3001');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const host = process.env.HOST ?? '127.0.0.1';
const db = openDatabase(process.env.DATABASE_PATH ?? './data/studyflow.sqlite');
const webDirectory = resolve('dist/web');
const app = createApp(
  db,
  existsSync(resolve(webDirectory, 'index.html')) ? webDirectory : undefined,
);
const server = app.listen(port, host, () => {
  console.log(`StudyFlow API listening on http://${host}:${port}`);
});
server.on('error', (error) => {
  db.close();
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => db.close());
  });
}
