import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPortFree, run } from '../../packages/orkestrai-cli/src/cli.js';

/**
 * Testa a CLI `orkestrai` contra um servidor HTTP falso que emula a bridge.
 */
describe('orkestrai CLI', () => {
  let server;
  let apiUrl;
  let cwd;
  const requests = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : undefined, auth: req.headers.authorization });
        res.setHeader('content-type', 'application/json');
        if (req.url?.startsWith('/api/agent-room/bridge/agents')) {
          res.end(JSON.stringify({ data: { workspace: { id: 'w1', name: 'Teste' }, agents: [{ nodeId: 'n1', title: 'Claude', provider: 'claude', sessionAlive: true }], notes: [] } }));
        } else if (req.url === '/api/agent-room/bridge/ask') {
          res.end(JSON.stringify({ data: { to: 'Claude', reply: 'resposta do claude', timedOut: false } }));
        } else if (req.url === '/api/agent-room/bridge/notes/n9' && req.method === 'GET') {
          res.end(JSON.stringify({ data: { nodeId: 'n9', title: 'nota', content: 'conteudo da nota' } }));
        } else {
          res.end(JSON.stringify({ data: { ok: true } }));
        }
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    apiUrl = `http://127.0.0.1:${server.address().port}`;

    cwd = mkdtempSync(join(tmpdir(), 'orkestrai-cli-'));
    mkdirSync(join(cwd, '.orkestrai'));
    writeFileSync(join(cwd, '.orkestrai', 'workspace.json'), JSON.stringify({ token: 'tok123', apiUrl }));
  });

  afterAll(() => server.close());

  function capture() {
    const lines = [];
    return { lines, out: (line) => lines.push(String(line)) };
  }

  it('list mostra agentes do workspace', async () => {
    const { lines, out } = capture();
    const code = await run(['list'], { cwd, out, env: {} });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Claude');
    expect(requests.at(-1).auth).toBe('Bearer tok123');
  });

  it('ask envia mensagem e imprime a resposta', async () => {
    const { lines, out } = capture();
    const code = await run(['ask', 'Claude', 'como vai?'], { cwd, out, env: {} });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('resposta do claude');
    expect(requests.at(-1).body).toMatchObject({ to: 'Claude', message: 'como vai?' });
  });

  it('note read imprime o conteudo da nota', async () => {
    const { lines, out } = capture();
    const code = await run(['note', 'read', 'n9'], { cwd, out, env: {} });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('conteudo da nota');
  });

  it('note write envia o conteudo via PUT', async () => {
    const { out } = capture();
    const code = await run(['note', 'write', 'n9', 'novo', 'texto'], { cwd, out, env: {} });
    expect(code).toBe(0);
    expect(requests.at(-1).method).toBe('PUT');
    expect(requests.at(-1).body.content).toBe('novo texto');
  });

  it('note create repassa content e connect (parseFlags generico)', async () => {
    const { out } = capture();
    await run(['note', 'create', 'Minha nota', '--content', 'corpo da nota', '--connect', 'Claude'], { env: {}, cwd, out });
    const request = requests.find((entry) => entry.url === '/api/agent-room/bridge/notes' && entry.method === 'POST');
    expect(request.body.title).toBe('Minha nota');
    expect(request.body.content).toBe('corpo da nota');
    expect(request.body.connect).toBe('Claude');
  });

  it('note create conecta por padrao ao time inteiro', async () => {
    const { out } = capture();
    await run(['note', 'create', 'Spec X'], { env: { ORKESTRAI_NODE_ID: 'n1' }, cwd, out });
    const request = requests.filter((entry) => entry.url === '/api/agent-room/bridge/notes' && entry.method === 'POST').at(-1);
    expect(request.body.connect).toBe('all');
  });

  it('task assign usa o flag --assign', async () => {
    const { out } = capture();
    await run(['task', 'add', 'Revisar PR', '--assign', 'Claude'], { env: {}, cwd, out });
    const request = requests.find((entry) => entry.url === '/api/agent-room/bridge/tasks' && entry.method === 'POST');
    expect(request.body.assignee).toBe('Claude');
  });

  it('sem token retorna erro claro', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'orkestrai-cli-empty-'));
    await expect(run(['list'], { cwd: emptyDir, out: () => {}, env: {} })).rejects.toThrow('Token');
  });

  it('env ORKESTRAI_TOKEN tem precedencia sobre arquivo', async () => {
    const { lines, out } = capture();
    await run(['list'], { cwd, out, env: { ORKESTRAI_TOKEN: 'env-tok', ORKESTRAI_API_URL: apiUrl } });
    expect(requests.at(-1).auth).toBe('Bearer env-tok');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('recruit usa ORKESTRAI_NODE_ID como --from padrao', async () => {
    const { out } = capture();
    await run(['recruit', 'Dev Frontend', '--provider', 'claude'], { env: { ORKESTRAI_NODE_ID: 'n1' }, cwd, out });
    const request = requests.find((entry) => entry.url === '/api/agent-room/bridge/recruit');
    expect(request.body.from).toBe('n1');
  });

  it('flag --from explicito tem precedencia sobre o env', async () => {
    const { out } = capture();
    await run(['recruit', 'QA', '--from', 'Outro'], { env: { ORKESTRAI_NODE_ID: 'n1' }, cwd, out });
    const request = requests.filter((entry) => entry.url === '/api/agent-room/bridge/recruit').at(-1);
    expect(request.body.from).toBe('Outro');
  });

  it('list usa ORKESTRAI_NODE_ID como --agent padrao', async () => {
    const { out } = capture();
    await run(['list'], { env: { ORKESTRAI_NODE_ID: 'n1' }, cwd, out });
    expect(requests.at(-1).url).toContain('agentNodeId=n1');
  });

  it('runtime.json tem precedencia sobre o apiUrl do workspace.json', async () => {
    // workspace.json com porta obsoleta; runtime.json aponta o servidor atual.
    const staleDir = mkdtempSync(join(tmpdir(), 'orkestrai-cli-stale-'));
    mkdirSync(join(staleDir, '.orkestrai'));
    writeFileSync(join(staleDir, '.orkestrai', 'workspace.json'), JSON.stringify({ token: 'tok123', apiUrl: 'http://127.0.0.1:1' }));
    const runtimeFile = join(staleDir, 'runtime.json');
    writeFileSync(runtimeFile, JSON.stringify({ apiUrl }));

    const { lines, out } = capture();
    const code = await run(['list'], { cwd: staleDir, out, env: { ORKESTRAI_RUNTIME_FILE: runtimeFile } });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Claude');
  });

  it('port devolve uma porta livre (sem precisar de workspace.json)', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'orkestrai-cli-port-'));
    const { lines, out } = capture();
    const code = await run(['port'], { cwd: emptyDir, out, env: {} });
    expect(code).toBe(0);
    const port = Number(lines.at(-1));
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThanOrEqual(65535);
    expect(await isPortFree(port)).toBe(true);
  });

  it('port --check distingue porta ocupada de livre', async () => {
    const blocker = createNetServer();
    await new Promise<void>((resolvePromise) => blocker.listen(0, '127.0.0.1', resolvePromise));
    const busy = (blocker.address() as { port: number }).port;
    try {
      const { lines, out } = capture();
      const code = await run(['port', '--check', String(busy)], { cwd, out, env: {} });
      expect(code).toBe(1);
      expect(lines.at(-1)).toBe(`${busy} ocupada`);
    } finally {
      await new Promise((resolvePromise) => blocker.close(resolvePromise));
    }
    const { lines, out } = capture();
    const code = await run(['port', '--check', String(busy)], { cwd, out, env: {} });
    expect(code).toBe(0);
    expect(lines.at(-1)).toBe(`${busy} livre`);
  });
});
