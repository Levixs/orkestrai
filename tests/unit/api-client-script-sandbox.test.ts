import { describe, expect, it } from 'vitest';
import { apiClientRequestSchema } from '$lib/modules/agent-room/contracts/schemas/apiClient.schema.js';
import { runApiClientScript } from '$lib/modules/agent-room/infrastructure/api-client/ApiClientScriptSandbox.js';

function request() {
  return apiClientRequestSchema.parse({
    id: 'request-1',
    name: 'Health',
    method: 'GET',
    url: 'https://example.test/health',
    headers: [],
    auth: { type: 'none' },
  });
}

describe('ApiClientScriptSandbox', () => {
  it('exposes the Bruno-compatible request and variable helpers without host access', async () => {
    const result = await runApiClientScript({
      script: `
        bru.setVar('token', 'updated');
        req.setUrl(req.getUrl() + '?ok=1');
        req.setHeader('X-Test', bru.getVar('token'));
        console.log('ready', bru.hasVar('token'));
      `,
      request: request(),
      variables: { token: 'initial' },
    });

    expect(result.variables).toEqual({ token: 'updated' });
    expect(result.request.url).toBe('https://example.test/health?ok=1');
    expect(result.request.headers).toEqual([expect.objectContaining({ name: 'X-Test', value: 'updated', enabled: true })]);
    expect(result.logs).toEqual(['ready true']);
    expect(result.tests).toEqual([]);
  });

  it('supports common Postman variable, response, and test helpers', async () => {
    const result = await runApiClientScript({
      script: `
        pm.environment.set('fromPostman', 'yes');
        pm.test('status is successful', () => pm.expect(pm.response.code).to.eql(200));
        pm.test('body is JSON', () => pm.expect(pm.response.json()).to.have.property('ok', true));
      `,
      request: request(),
      variables: {},
      response: {
        status: 200,
        statusText: 'OK',
        ok: true,
        durationMs: 12,
        size: 11,
        contentType: 'application/json',
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
        binary: false,
      },
    });

    expect(result.variables).toEqual({ fromPostman: 'yes' });
    expect(result.tests).toEqual([
      expect.objectContaining({ label: 'status is successful', passed: true }),
      expect.objectContaining({ label: 'body is JSON', passed: true }),
    ]);
  });

  it('supports the official Bruno global test and expect syntax in native test scripts', async () => {
    const result = await runApiClientScript({
      script: `test('native Bruno alias works', () => expect(res.getStatus()).to.equal(200));`,
      request: request(),
      variables: {},
      response: {
        status: 200,
        statusText: 'OK',
        ok: true,
        durationMs: 3,
        size: 2,
        contentType: 'application/json',
        headers: {},
        body: '{}',
        binary: false,
      },
    });

    expect(result.tests).toEqual([expect.objectContaining({ label: 'native Bruno alias works', passed: true })]);
  });

  it('interrupts scripts that exceed the execution deadline', async () => {
    await expect(runApiClientScript({
      script: 'while (true) {}',
      request: request(),
      variables: {},
    })).rejects.toThrow();
  });

  it('normalizes QuickJS syntax failures with their execution stage and user line', async () => {
    await expect(runApiClientScript({
      script: 'const ',
      request: request(),
      variables: {},
      stage: 'collectionPreRequest',
    })).rejects.toMatchObject({
      name: 'ApiClientScriptExecutionError',
      code: 'api_client_script_failed',
      stage: 'collectionPreRequest',
      lineNumber: 1,
      detail: expect.stringMatching(/^SyntaxError:/),
    });
  });
});
