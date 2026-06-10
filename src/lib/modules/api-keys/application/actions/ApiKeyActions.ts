import { Action } from '@beeblock/svelar/actions';
import { ApiKeys } from '@beeblock/svelar/api-keys';
import type { CreateApiKeyDto, RevokeApiKeyDto } from '$lib/modules/api-keys/application/dto/ApiKeyDtos.js';

export class CreateApiKeyAction extends Action<{ userId: number; dto: CreateApiKeyDto }, { plainTextKey: string; record: any }> {
  async execute(input: { userId: number; dto: CreateApiKeyDto }): Promise<{ plainTextKey: string; record: any }> {
    return ApiKeys.create({
      name: input.dto.name,
      userId: input.userId,
      permissions: input.dto.permissions,
    });
  }
}

export class RevokeApiKeyAction extends Action<RevokeApiKeyDto, void> {
  async execute(dto: RevokeApiKeyDto): Promise<void> {
    await ApiKeys.revoke(dto.keyId);
  }
}
