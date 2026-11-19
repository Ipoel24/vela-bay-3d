// serve.ts — small local dev server for VELA BAY 3D (Node http, stdlib
// only). Serves the game/ folder over local HTTP so the game can be
// play-tested in a local browser (file:// cannot load ES modules). Serves
// only local files under game/: any path that escapes the folder is refused.
// Port: PORT env var, default 8080. Run: `node serve.ts`, then open
// http://localhost:8080/ — add ?shot=chase&seed=11 for a photo-mode scene.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve('game');
const PORT = Number.parseInt(process.env.PORT || '8080', 10) || 8080;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const raw = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  const rel = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const path = resolve(join(ROOT, normalize(rel)));
  // Refuse anything outside game/ (no .. escapes, no absolute paths).
  if (path !== ROOT && !path.startsWith(ROOT + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  let st;
  try {
    st = statSync(path);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  if (!st.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream' });
  createReadStream(path).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`VELA BAY 3D dev server: http://127.0.0.1:${PORT}/`);
});
