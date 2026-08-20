import { Controller } from '@beeblock/svelar/routing';
import { ExecuteApiClientRequestAction } from '../../../application/actions/ExecuteApiClientRequestAction.js';
import { ImportApiClientCollectionAction } from '../../../application/actions/ImportApiClientCollectionAction.js';
import { ExportApiClientCollectionAction } from '../../../application/actions/ExportApiClientCollectionAction.js';
import { AuthorizeApiClientOAuthAction } from '../../../application/actions/AuthorizeApiClientOAuthAction.js';
import { PollApiClientOAuthAction } from '../../../application/actions/PollApiClientOAuthAction.js';
import { CompleteApiClientOAuthAction } from '../../../application/actions/CompleteApiClientOAuthAction.js';
import { SyncApiClientCollectionAction } from '../../../application/actions/SyncApiClientCollectionAction.js';
import { ApiClientOAuthDto, ApiClientSyncDto, ExecuteApiClientRequestDto, ExportApiClientCollectionDto, ImportApiClientCollectionDto } from '../../../application/dto/ApiClientDtos.js';
import { ApiClientOAuthRequest, ApiClientSyncRequest, ExecuteApiClientRequest, ExportApiClientCollectionRequest, ImportApiClientCollectionRequest } from '../requests/ApiClientRequests.js';
import { ApiClientExportResource, ApiClientImportResource, ApiClientResponseResource } from '../resources/ApiClientResource.js';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}

function executionErrorPayload(error: unknown) {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  if (value?.code === 'api_client_script_failed' && typeof value.detail === 'string') {
    return {
      error: value.detail,
      code: 'api_client_script_failed',
      stage: value.stage,
      lineNumber: typeof value.lineNumber === 'number' ? value.lineNumber : null,
    };
  }
  return { error: errorMessage(error, 'Could not execute the API request.') };
}

export class ApiClientController extends Controller {
  async execute(event: any) {
    try {
      const input = await ExecuteApiClientRequest.validate(event);
      const result = await new ExecuteApiClientRequestAction().execute({
        workspaceId: event.params.id,
        dto: ExecuteApiClientRequestDto.from(input),
      });
      return this.json({ data: new ApiClientResponseResource(result).toJSON() });
    } catch (error) {
      return this.json(executionErrorPayload(error), 400);
    }
  }

  async import(event: any) {
    try {
      const input = await ImportApiClientCollectionRequest.validate(event);
      const result = await new ImportApiClientCollectionAction().execute({
        workspaceId: event.params.id,
        dto: ImportApiClientCollectionDto.from(input),
      });
      return this.json({ data: new ApiClientImportResource(result).toJSON() });
    } catch (error) {
      return this.json({ error: errorMessage(error, 'Could not import the API collection.') }, 400);
    }
  }

  async export(event: any) {
    try {
      const input = await ExportApiClientCollectionRequest.validate(event);
      const result = await new ExportApiClientCollectionAction().execute({
        workspaceId: event.params.id,
        dto: ExportApiClientCollectionDto.from(input),
      });
      return this.json({ data: new ApiClientExportResource(result).toJSON() });
    } catch (error) {
      return this.json({ error: errorMessage(error, 'Could not export the API collection.') }, 400);
    }
  }

  async oauth(event: any) {
    try {
      const input = await ApiClientOAuthRequest.validate(event);
      const dto = ApiClientOAuthDto.from(input);
      const result = input.action === 'authorize'
        ? await new AuthorizeApiClientOAuthAction().execute({ workspaceId: event.params.id, dto, origin: event.url.origin })
        : await new PollApiClientOAuthAction().execute({ workspaceId: event.params.id, dto });
      return this.json({ data: result });
    } catch (error) {
      return this.json({ error: errorMessage(error, 'OAuth authorization failed.') }, 400);
    }
  }

  async oauthCallback(event: any) {
    const state = event.url.searchParams.get('state') ?? '';
    let complete = false;
    try {
      complete = await new CompleteApiClientOAuthAction().execute({
        workspaceId: event.params.id,
        state,
        code: event.url.searchParams.get('code'),
        error: event.url.searchParams.get('error_description') ?? event.url.searchParams.get('error'),
      });
    } catch { /* The renderer poll reports the actionable error. */ }
    const locale = event.url.searchParams.get('locale');
    const copy = locale === 'pt-BR'
      ? { complete: 'Autorização concluída', failed: 'A autorização falhou', done: 'Você pode fechar esta janela e voltar ao Orkestrai.', review: 'Volte ao Orkestrai para revisar o erro.' }
      : locale === 'es'
        ? { complete: 'Autorización completada', failed: 'La autorización falló', done: 'Puedes cerrar esta ventana y volver a Orkestrai.', review: 'Vuelve a Orkestrai para revisar el error.' }
        : { complete: 'Authorization complete', failed: 'Authorization failed', done: 'You can close this window and return to Orkestrai.', review: 'Return to Orkestrai to review the error.' };
    const title = complete ? copy.complete : copy.failed;
    const detail = complete ? copy.done : copy.review;
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#111;color:#f5f5f5;font:16px system-ui"><main><h1>${title}</h1><p>${detail}</p></main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }

  async sync(event: any) {
    try {
      const input = await ApiClientSyncRequest.validate(event);
      const result = await new SyncApiClientCollectionAction().execute({ workspaceId: event.params.id, dto: ApiClientSyncDto.from(input) });
      return this.json({ data: result });
    } catch (error) {
      return this.json({ error: errorMessage(error, 'Collection synchronization failed.') }, 400);
    }
  }
}
