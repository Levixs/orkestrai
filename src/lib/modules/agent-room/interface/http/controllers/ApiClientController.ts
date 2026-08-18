import { Controller } from '@beeblock/svelar/routing';
import { ExecuteApiClientRequestAction } from '../../../application/actions/ExecuteApiClientRequestAction.js';
import { ImportApiClientCollectionAction } from '../../../application/actions/ImportApiClientCollectionAction.js';
import { ExecuteApiClientRequestDto, ImportApiClientCollectionDto } from '../../../application/dto/ApiClientDtos.js';
import { ExecuteApiClientRequest, ImportApiClientCollectionRequest } from '../requests/ApiClientRequests.js';
import { ApiClientImportResource, ApiClientResponseResource } from '../resources/ApiClientResource.js';

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
      return this.json({ error: error instanceof Error ? error.message : 'Could not execute the API request.' }, 400);
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
      return this.json({ error: error instanceof Error ? error.message : 'Could not import the API collection.' }, 400);
    }
  }
}
