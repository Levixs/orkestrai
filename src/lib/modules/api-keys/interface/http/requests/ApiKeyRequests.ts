import { FormRequest } from '@beeblock/svelar/forms';
import { createApiKeySchema, revokeApiKeySchema } from '$lib/modules/api-keys/contracts/schemas/api-key.schema.js';
import { CreateApiKeyDto, RevokeApiKeyDto } from '$lib/modules/api-keys/application/dto/ApiKeyDtos.js';

export class CreateApiKeyRequest extends FormRequest {
  rules() {
    return createApiKeySchema;
  }

  authorize(event: any): boolean {
    return !!event.locals.user;
  }

  passedValidation(data: any): CreateApiKeyDto {
    return CreateApiKeyDto.from(data);
  }
}

export class RevokeApiKeyRequest extends FormRequest {
  rules() {
    return revokeApiKeySchema;
  }

  authorize(event: any): boolean {
    return !!event.locals.user;
  }

  passedValidation(data: any): RevokeApiKeyDto {
    return RevokeApiKeyDto.from(data);
  }
}
