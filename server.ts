/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal Express server that serves the built SPA in production and proxies
 * to Vite's dev middleware in development. Packaged as a Docker container and
 * deployed to Google Cloud Run (see README deploy runbook). No server-side
 * AI/API routes — the tracker talks only to Supabase from the browser.
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Health check for Cloud Run.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('Express: DEVELOPMENT mode (Vite middleware)…');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Express: PRODUCTION mode (serving dist/)…');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback so client-side routes resolve to index.html.
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RSG Commission Tracker running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((e) => {
  console.error('Express server startup failed:', e);
  process.exit(1);
});
