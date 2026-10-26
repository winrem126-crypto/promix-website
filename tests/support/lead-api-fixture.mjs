import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

export async function createLeadApiFixture() {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'promix-safe-leads-'));
  const backendRoot = path.join(temporaryRoot, 'backend');
  await fs.mkdir(path.join(backendRoot, 'public', 'api'), { recursive: true });
  await fs.mkdir(path.join(backendRoot, 'config'), { recursive: true });
  await Promise.all([
    fs.cp(path.join(projectRoot, 'backend', 'src'), path.join(backendRoot, 'src'), { recursive: true }),
    fs.cp(path.join(projectRoot, 'backend', 'vendor'), path.join(backendRoot, 'vendor'), { recursive: true }),
    fs.copyFile(path.join(projectRoot, 'backend', 'public', 'api', 'lead.php'), path.join(backendRoot, 'public', 'api', 'lead.php')),
  ]);

  const smtp = { mode: 'accept', messages: [], transactions: 0, connections: 0 };
  const smtpSockets = new Set();
  const smtpServer = net.createServer((socket) => {
    smtpSockets.add(socket);
    smtp.connections += 1;
    socket.on('close', () => smtpSockets.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    socket.write('220 localhost PROMIX local acceptance sink\r\n');
    let buffer = '';
    let readingMessage = false;
    let authStep = 0;
    socket.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\r\n')) {
        if (readingMessage) {
          const boundary = buffer.indexOf('\r\n.\r\n');
          if (boundary < 0) return;
          const message = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 5);
          readingMessage = false;
          smtp.transactions += 1;
          if (smtp.mode === 'reject') socket.write('550 5.0.0 Local fixture rejects this message\r\n');
          else {
            smtp.messages.push(message);
            if (smtp.mode === 'drop-after-data') { socket.destroy(); return; }
            socket.write('250 2.0.0 Captured by local test sink\r\n');
          }
          continue;
        }
        const boundary = buffer.indexOf('\r\n');
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (authStep === 1) { authStep = 2; socket.write('334 UGFzc3dvcmQ6\r\n'); }
        else if (authStep === 2) { authStep = 0; socket.write('235 2.7.0 Test authentication accepted\r\n'); }
        else if (/^EHLO|^HELO/i.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH LOGIN/i.test(line)) { authStep = 1; socket.write('334 VXNlcm5hbWU6\r\n'); }
        else if (/^AUTH PLAIN/i.test(line)) socket.write('235 2.7.0 Test authentication accepted\r\n');
        else if (/^DATA$/i.test(line)) { readingMessage = true; socket.write('354 End with <CRLF>.<CRLF>\r\n'); }
        else if (/^QUIT$/i.test(line)) { socket.end('221 2.0.0 Goodbye\r\n'); return; }
        else socket.write('250 2.0.0 OK\r\n');
      }
    });
  });
  const smtpPort = await listen(smtpServer);
  const configPath = path.join(backendRoot, 'config', 'config.php');
  const config = {
    smtp_host: '127.0.0.1', smtp_port: smtpPort, smtp_secure: false,
    smtp_user: 'local-test', smtp_password: 'local-test-only',
    leads_from_email: 'sender@example.invalid', leads_to_email: 'sink@example.invalid',
    smtp_timeout_seconds: 1, storage_path: path.join(temporaryRoot, 'storage'),
    storage_secret: 'local-fixture-secret-not-a-production-secret-00000000',
    rate_window_seconds: 900, rate_client_limit: 100, rate_global_limit: 100,
    idempotency_ttl_seconds: 86400, trusted_proxies: [],
  };
  const storagePaths = new Set([config.storage_path]);
  const writeConfig = async (patch = {}) => {
    Object.assign(config, patch);
    storagePaths.add(config.storage_path);
    const encoded = Buffer.from(JSON.stringify(config)).toString('base64');
    await fs.writeFile(configPath, `<?php return json_decode(base64_decode('${encoded}'), true, 512, JSON_THROW_ON_ERROR);\n`);
  };
  await writeConfig();
  const reservation = net.createServer();
  const apiPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const php = spawn(process.env.PHP_BINARY || 'php', ['-S', `127.0.0.1:${apiPort}`, '-t', path.join(backendRoot, 'public')], {
    cwd: backendRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let phpLog = '';
  let spawnError;
  php.on('error', (error) => { spawnError = error; });
  php.stdout.on('data', (chunk) => { phpLog += chunk; });
  php.stderr.on('data', (chunk) => { phpLog += chunk; });
  const apiUrl = `http://127.0.0.1:${apiPort}/api/lead.php`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (spawnError) throw spawnError;
    try { ready = (await fetch(apiUrl)).status === 405; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error('Local PHP fixture did not become ready');

  const proxy = { dropNextResponse: false, delayNextResponse: 0, nextResponse: null, requests: [] };
  const webServer = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/api/lead.php') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString('utf8');
        const submissionId = JSON.parse(body).submissionId;
        proxy.requests.push(submissionId);
        if (proxy.nextResponse) {
          const next = proxy.nextResponse;
          proxy.nextResponse = null;
          response.writeHead(next.status, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ submissionId, ...next.body }));
          return;
        }
        const upstream = await fetch(apiUrl, { method: request.method, headers: { 'Content-Type': 'application/json' }, body });
        const result = await upstream.text();
        if (proxy.dropNextResponse) { proxy.dropNextResponse = false; response.destroy(); return; }
        if (proxy.delayNextResponse) {
          const delay = proxy.delayNextResponse;
          proxy.delayNextResponse = 0;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        if (response.destroyed) return;
        response.writeHead(upstream.status, { 'Content-Type': 'application/json' });
        response.end(result);
        return;
      }
      const root = path.resolve(projectRoot, 'dist');
      let target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      if ((await fs.stat(target)).isDirectory()) target = path.join(target, 'index.html');
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
      response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
      response.end(await fs.readFile(target));
    } catch { response.writeHead(404); response.end(); }
  });
  const webPort = await listen(webServer);

  return {
    smtp, proxy, apiUrl, baseUrl: `http://127.0.0.1:${webPort}`, config, configPath, writeConfig,
    getLog: () => phpLog,
    async readState() {
      const values = [];
      for (const directory of storagePaths) {
        const files = await fs.readdir(directory);
        values.push(...await Promise.all(files.filter((name) => name.endsWith('.json')).map((name) => fs.readFile(path.join(directory, name), 'utf8'))));
      }
      return values;
    },
    async close() {
      php.kill();
      for (const socket of smtpSockets) socket.destroy();
      webServer.closeAllConnections();
      await Promise.all([
        new Promise((resolve) => webServer.close(resolve)),
        new Promise((resolve) => smtpServer.close(resolve)),
        php.exitCode !== null ? Promise.resolve() : once(php, 'exit'),
      ]);
      const resolved = path.resolve(temporaryRoot);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('promix-safe-leads-')) throw new Error('Unsafe fixture cleanup path');
      await fs.rm(resolved, { recursive: true, force: true });
    },
  };
}
