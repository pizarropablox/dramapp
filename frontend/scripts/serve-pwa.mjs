// Serves the production build like Render's static site does, so the service worker can be tried locally
// (ng serve has none). No dependencies: Node's http module only.
//
//   npm run serve:pwa            builds, then serves http://localhost:4300 (and the LAN address)
//
// Like render.yaml: every file with Cache-Control: no-cache (revalidated by ETag), /api/* proxied to the
// backend (http://localhost:8080, or BACKEND_URL), and any other path falls back to index.html.
// The service worker needs a secure origin: http://localhost works; http://192.168.x.x does not (the app
// still opens and can be added to the home screen, without offline or update notices). See README.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4300);
const BACKEND_URL = new URL(process.env.BACKEND_URL ?? 'http://localhost:8080');
const ROOT = fileURLToPath(new URL('../dist/frontend/browser/', import.meta.url));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** The file a path maps to, or null (outside the build, missing, or a directory). */
async function fileFor(pathname) {
  const path = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
    return null;
  }
  try {
    const info = await stat(path);
    return info.isFile() ? { path, info } : null;
  } catch {
    return null;
  }
}

async function serveStatic(req, res, pathname) {
  // Existing files win; everything else is the Angular app (SPA fallback), as in render.yaml.
  const file = (await fileFor(pathname)) ?? (await fileFor('/index.html'));
  const etag = `"${file.info.size.toString(16)}-${file.info.mtimeMs.toString(16)}"`;
  const headers = {
    'Content-Type': CONTENT_TYPES[extname(file.path)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    ETag: etag,
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers).end();
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': file.info.size });
  if (req.method === 'HEAD') {
    res.end();
  } else {
    createReadStream(file.path).pipe(res);
  }
}

function proxyToBackend(req, res) {
  const upstream = httpRequest(
    {
      hostname: BACKEND_URL.hostname,
      port: BACKEND_URL.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: BACKEND_URL.host },
    },
    (answer) => {
      // rawHeaders keeps every Set-Cookie (session and XSRF) as the backend sent them.
      res.writeHead(answer.statusCode ?? 502, answer.rawHeaders);
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    res
      .writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('Backend no disponible');
  });
  req.pipe(upstream);
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname.startsWith('/api/')) {
    proxyToBackend(req, res);
  } else {
    serveStatic(req, res, pathname).catch(() => res.writeHead(500).end());
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === 'IPv4' && !address.internal)
    .map((address) => `http://${address.address}:${PORT}/`);
  console.log(`PWA build served at http://localhost:${PORT}/ (service worker on)`);
  for (const url of lan) {
    console.log(`  LAN: ${url} (no service worker: not a secure origin)`);
  }
  console.log(`  /api/* -> ${BACKEND_URL.origin}`);
});
