import express from 'express';
import { resolve } from 'node:path';

export function createApp(webDirectory?: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'studyflow' });
  });
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found' });
  });
  if (webDirectory) {
    app.use(express.static(webDirectory));
    app.get(['/', '/courses'], (_request, response) => {
      response.sendFile(resolve(webDirectory, 'index.html'));
    });
  }
  app.use((_request, response) => {
    response.status(404).send('Not found');
  });
  return app;
}
