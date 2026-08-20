import { createHash, randomBytes } from 'node:crypto';
import { apiClientNetworkSchema, apiClientRequestSchema } from '../../contracts/schemas/apiClient.schema.js';
import type { ApiClientOAuthDto } from '../dto/ApiClientDtos.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { executeHttpTransport } from '../../infrastructure/api-client/ApiClientHttpTransport.js';
import type { ApiClientNodePayload, ApiClientRequest } from '../../domain/types.js';

type OAuthConfig = NonNullable<ApiClientRequest['auth']['oauth2']>;
type OAuthTokens = Pick<OAuthConfig, 'accessToken' | 'refreshToken' | 'tokenType' | 'expiresAt'>;
type PendingAuthorization = {
  workspaceId: string;
  nodeId: string;
  requestId: string;
  config: OAuthConfig;
  variables: Record<string, string>;
  callbackUrl: string;
  verifier: string;
  createdAt: number;
  status: 'pending' | 'complete' | 'error';
  tokens?: OAuthTokens;
  error?: string;
};

const AUTHORIZATION_TTL_MS = 10 * 60_000;
const pendingKey = Symbol.for('orkestrai.api-client.oauth.pending');
const root = globalThis as typeof globalThis & { [pendingKey]?: Map<string, PendingAuthorization> };
const pending = root[pendingKey] ??= new Map<string, PendingAuthorization>();

function renderVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/{{\s*([^{}]+?)\s*}}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
}

function oauthUrl(value: string, variables: Record<string, string>, label: string): URL {
  const url = new URL(renderVariables(value, variables));
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`${label} must use HTTPS, except for loopback development servers.`);
  }
  return url;
}

function prunePending(): void {
  const threshold = Date.now() - AUTHORIZATION_TTL_MS;
  for (const [state, attempt] of pending) if (attempt.createdAt < threshold) pending.delete(state);
}

function tokenResult(value: Record<string, unknown>): OAuthTokens {
  const accessToken = typeof value.access_token === 'string' ? value.access_token : '';
  if (!accessToken) throw new Error(typeof value.error_description === 'string' ? value.error_description : 'The OAuth provider did not return an access token.');
  const expiresIn = Number(value.expires_in);
  return {
    accessToken,
    refreshToken: typeof value.refresh_token === 'string' ? value.refresh_token : '',
    tokenType: typeof value.token_type === 'string' ? value.token_type : 'Bearer',
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1_000).toISOString() : null,
  };
}

async function exchangeToken(input: {
  config: OAuthConfig;
  variables: Record<string, string>;
  network: NonNullable<ApiClientNodePayload['network']>;
  code?: string;
  callbackUrl?: string;
  verifier?: string;
}): Promise<OAuthTokens> {
  const { config, variables } = input;
  const tokenUrl = oauthUrl(config.tokenUrl, variables, 'OAuth token URL');
  const form = new URLSearchParams();
  form.set('grant_type', config.grantType);
  if (config.scope) form.set('scope', renderVariables(config.scope, variables));
  if (config.audience) form.set('audience', renderVariables(config.audience, variables));
  if (config.grantType === 'authorization_code') {
    if (!input.code || !input.callbackUrl) throw new Error('OAuth authorization code is missing.');
    form.set('code', input.code);
    form.set('redirect_uri', input.callbackUrl);
    if (config.usePkce && input.verifier) form.set('code_verifier', input.verifier);
  } else if (config.grantType === 'client_credentials') {
    // No grant-specific fields.
  } else if (config.grantType === 'password') {
    form.set('username', renderVariables(config.username, variables));
    form.set('password', renderVariables(config.password, variables));
  } else {
    if (!config.refreshToken) throw new Error('OAuth refresh token is missing.');
    form.set('refresh_token', renderVariables(config.refreshToken, variables));
  }

  const headers = new Headers({ accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' });
  const clientId = renderVariables(config.clientId, variables);
  const clientSecret = renderVariables(config.clientSecret, variables);
  if (config.clientAuthentication === 'header') {
    headers.set('authorization', `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`);
  } else {
    form.set('client_id', clientId);
    if (clientSecret) form.set('client_secret', clientSecret);
  }
  const response = await executeHttpTransport({
    url: tokenUrl,
    method: 'POST',
    headers,
    body: form.toString(),
    timeoutMs: 30_000,
    followRedirects: false,
    network: input.network,
  });
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(response.body); } catch {
    parsed = Object.fromEntries(new URLSearchParams(response.body));
  }
  if (!response.ok) {
    const detail = typeof parsed.error_description === 'string' ? parsed.error_description : typeof parsed.error === 'string' ? parsed.error : response.statusText;
    throw new Error(`OAuth token exchange failed (${response.status}): ${detail}`);
  }
  return tokenResult(parsed);
}

export class ApiClientOAuthService {
  async authorize(workspaceId: string, dto: ApiClientOAuthDto, origin: string) {
    if (dto.input.action !== 'authorize') throw new Error('Invalid OAuth action.');
    const node = await this.requireNode(workspaceId, dto.input.nodeId);
    const request = apiClientRequestSchema.parse(dto.input.request) as ApiClientRequest;
    if (request.auth.type !== 'oauth2' || !request.auth.oauth2) throw new Error('OAuth 2.0 is not configured for this request.');
    const config = request.auth.oauth2;
    const network = apiClientNetworkSchema.parse((node.payload as ApiClientNodePayload | null)?.network ?? {});
    if (config.grantType !== 'authorization_code') {
      return { status: 'complete' as const, tokens: await exchangeToken({ config, variables: dto.input.variables, network }) };
    }

    prunePending();
    const authorizationUrl = oauthUrl(config.authorizationUrl, dto.input.variables, 'OAuth authorization URL');
    oauthUrl(config.tokenUrl, dto.input.variables, 'OAuth token URL');
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const callback = new URL(`/api/agent-room/workspaces/${encodeURIComponent(workspaceId)}/api-client/oauth/callback`, new URL(origin).origin);
    callback.searchParams.set('locale', dto.input.locale);
    const callbackUrl = callback.toString();
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', renderVariables(config.clientId, dto.input.variables));
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('state', state);
    if (config.scope) authorizationUrl.searchParams.set('scope', renderVariables(config.scope, dto.input.variables));
    if (config.audience) authorizationUrl.searchParams.set('audience', renderVariables(config.audience, dto.input.variables));
    if (config.usePkce) {
      authorizationUrl.searchParams.set('code_challenge_method', 'S256');
      authorizationUrl.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
    }
    pending.set(state, {
      workspaceId,
      nodeId: dto.input.nodeId,
      requestId: request.id,
      config,
      variables: dto.input.variables,
      callbackUrl,
      verifier,
      createdAt: Date.now(),
      status: 'pending',
    });
    return { status: 'pending' as const, state, authorizationUrl: authorizationUrl.toString() };
  }

  poll(workspaceId: string, dto: ApiClientOAuthDto) {
    if (dto.input.action !== 'poll') throw new Error('Invalid OAuth action.');
    prunePending();
    const attempt = pending.get(dto.input.state);
    if (!attempt || attempt.workspaceId !== workspaceId || attempt.nodeId !== dto.input.nodeId) throw new Error('OAuth authorization session was not found or expired.');
    if (attempt.status === 'pending') return { status: 'pending' as const };
    pending.delete(dto.input.state);
    if (attempt.status === 'error') return { status: 'error' as const, error: attempt.error ?? 'OAuth authorization failed.' };
    return { status: 'complete' as const, tokens: attempt.tokens };
  }

  async complete(workspaceId: string, state: string, code: string | null, providerError: string | null) {
    prunePending();
    const attempt = pending.get(state);
    if (!attempt || attempt.workspaceId !== workspaceId) throw new Error('OAuth authorization session was not found or expired.');
    if (providerError || !code) {
      attempt.status = 'error';
      attempt.error = providerError || 'The provider did not return an authorization code.';
      return false;
    }
    try {
      const node = await this.requireNode(workspaceId, attempt.nodeId);
      const network = apiClientNetworkSchema.parse((node.payload as ApiClientNodePayload | null)?.network ?? {});
      attempt.tokens = await exchangeToken({
        config: attempt.config,
        variables: attempt.variables,
        network,
        code,
        callbackUrl: attempt.callbackUrl,
        verifier: attempt.verifier,
      });
      attempt.status = 'complete';
      return true;
    } catch (error) {
      attempt.status = 'error';
      attempt.error = error instanceof Error ? error.message : 'OAuth token exchange failed.';
      return false;
    }
  }

  private async requireNode(workspaceId: string, nodeId: string) {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'apiClient') throw new Error('API Client node not found.');
    return node;
  }
}

export const apiClientOAuthService = new ApiClientOAuthService();
