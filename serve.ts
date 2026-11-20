// A tiny static file server for game/ (Node 22, standard library only).
//
// Lets the entry be played locally with no build step:
//
//   node serve.ts [--port 8080]
//
// It serves game/ on http://localhost:8080 by default, sends the MIME types a
// browser game needs, refuses every path that escapes game/, and does nothing
// else: a development convenience, not a web server for the internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort(argv: string[]): number {
  const at = argv.indexOf('--port');
  const wanted = at === -1 ? 8080 : Number(argv[at + 1]);
  return Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;
}

function mimeFor(file: string): string {
  const byExt: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
  };
  return byExt[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// Resolve a request path inside gameRoot, or return null when it escapes.
function insideGame(requestPath: string): string | null {
  let cleaned = requestPath;
  if (cleaned.endsWith('/')) cleaned += 'index.html';
  const resolved = resolve(join(gameRoot, normalize(cleaned)));
  if (resolved !== gameRoot && !resolved.startsWith(gameRoot + sep)) return null;
  return resolved;
}

const port = pickPort(process.argv.slice(2));

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = insideGame(pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`SELARA BAY game/ is on http://localhost:${port}`);
});
