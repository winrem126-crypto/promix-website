import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const distRoot = path.join(projectRoot, 'dist');

export async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? listFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return groups.flat();
}

export function resolvePublicFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(distRoot, relative);
  if (candidate !== distRoot && !candidate.startsWith(distRoot + path.sep)) throw new Error('Path outside dist');
  return path.extname(candidate) ? candidate : path.join(candidate, 'index.html');
}

export async function createStaticSiteFixture() {
  await fs.access(path.join(distRoot, 'index.html'));
  const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
    '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  };
  const server = http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    try {
      const requested = resolvePublicFile(new URL(request.url, 'http://localhost').pathname);
      let file = requested;
      let status = 200;
      let bytes;
      try { bytes = await fs.readFile(file); }
      catch { file = path.join(distRoot, '404.html'); bytes = await fs.readFile(file); status = 404; }
      response.writeHead(status, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(400).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}
