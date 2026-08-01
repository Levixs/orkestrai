#!/usr/bin/env node
/**
 * Servidor de producao do Orkestrai: HTTP (handler do adapter-node) +
 * WebSocket de PTY no mesmo processo/porta.
 *
 * Usado pelo Electron (electron/main.cjs) e por `npm run start`.
 * Requer `npm run build` antes. Roda com Node 24+ (type stripping para os
 * modulos .ts do PTY).
 */
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { WebSocketServer } from 'ws';

// App Electron aberto pelo Finder recebe um PATH minimo do macOS; sem os
// locais comuns de CLIs a deteccao e o spawn dos agentes falham com ENOENT.
{
  const extra = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    `${homedir()}/.local/bin`,
    `${homedir()}/.bun/bin`,
    `${homedir()}/.volta/bin`,
    `${homedir()}/.deno/bin`,
    `${homedir()}/.cargo/bin`,
    `${homedir()}/.npm-global/bin`,
    `${homedir()}/bin`,
  ];
  const current = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  process.env.PATH = [...current, ...extra.filter((dir) => !current.includes(dir))].join(delimiter);
}

// Carrega .env do projeto sem sobrescrever variaveis ja definidas
// (o handler do adapter-node nao carrega .env sozinho).
const dotEnvPath = resolve('.env');
if (existsSync(dotEnvPath)) {
  for (const line of readFileSync(dotEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

// Import tardio: o handler avalia APP_KEY e ORIGIN na carga, entao so depois
// do .env e da definicao de ORIGIN abaixo.

const { handlePtyConnection, isAllowedPtyWsOrigin, isPtyWsPath } = await import(
  '../src/lib/modules/agent-room/infrastructure/pty/pty-ws.ts'
);

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);

// O adapter-node assume https por padrao ao derivar event.url; sem isso o
// middleware de origem do Svelar bloqueia POSTs same-origin (http vs https).
process.env.ORIGIN ??= `http://${host}:${port}`;

const { handler } = await import('../build/handler.js');

const server = http.createServer(handler);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
  if (!isPtyWsPath(pathname)) {
    socket.destroy();
    return;
  }
  if (!isAllowedPtyWsOrigin(request.headers.origin, request.headers.host)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => handlePtyConnection(ws));
});

server.listen(port, host, () => {
  console.log(`Orkestrai ouvindo em http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  });
}
