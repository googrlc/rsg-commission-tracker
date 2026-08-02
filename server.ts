/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal Express server that serves the built SPA in production and proxies
 * to Vite's dev middleware in development. Packaged as a Docker container and
 * served privately over the tailnet (see README deploy runbook).
 *
 * It carries exactly one API route of its own: a pass-through to the commission
 * service for /api/finance. Reads still go browser -> Supabase under RLS; only
 * statement WRITES take this path, because they have to go through the staging
 * and approval gate rather than straight into the money tables.
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// The commission service (backend/). Same box, not published to the tailnet —
// the browser reaches it only through this proxy, so it is same-origin and
// there is no second address to secure.
const FINANCE_API_URL = process.env.FINANCE_API_URL || 'http://127.0.0.1:8801';

/**
 * Stream /api/finance/* to the commission service, preserving method, headers
 * and body. Written with fetch rather than a proxy dependency because it is one
 * prefix: multipart uploads pass through as a stream, so a large statement
 * never lands in this process's memory.
 */
async function proxyFinance(req: express.Request, res: express.Response) {
  const target = `${FINANCE_API_URL}${req.originalUrl.replace(/^\/api\/finance/, '')}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    // Hop-by-hop and host headers must not be forwarded.
    if (['host', 'connection', 'content-length'].includes(key)) continue;
    if (typeof value === 'string') headers.set(key, value);
  }

  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? (req as unknown as ReadableStream) : undefined,
      // Node needs this to stream a request body rather than buffer it.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key)) {
        res.setHeader(key, value);
      }
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) {
    // A dead service must read as a dead service, not as a rejected statement.
    console.error('finance proxy failed:', e);
    res.status(502).json({
      detail: 'The commission service is not reachable from the app server.',
    });
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Allow the SPA to be embedded in an iframe by any portal, while still
  // working when opened full-screen standalone. We explicitly drop the legacy
  // X-Frame-Options header (which some proxies inject as DENY/SAMEORIGIN) and
  // set a permissive frame-ancestors CSP. Data access stays protected by
  // Supabase RLS regardless of who frames the page.
  app.use((_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    next();
  });

  // Health check.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Statement staging/approval. Registered before the Vite middleware and the
  // SPA fallback so it is never swallowed by index.html.
  app.all('/api/finance/*', proxyFinance);

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
