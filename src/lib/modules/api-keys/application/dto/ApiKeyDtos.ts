import type { CreateApiKeyInput, RevokeApiKeyInput } from '$lib/modules/api-keys/contracts/schemas/api-key.schema.js';

export class CreateApiKeyDto {
  constructor(
    public readonly name: string,
    public readonly permissions: string[]
  ) {}

  static from(input: CreateApiKeyInput): CreateApiKeyDto {
    return new CreateApiKeyDto(
      input.name,
      input.permissions.split(',').map((permission) => permission.trim()).filter(Boolean)
    );
  }
}

export class RevokeApiKeyDto {
  constructor(public readonly keyId: string) {}

  static from(input: RevokeApiKeyInput): RevokeApiKeyDto {
    return new RevokeApiKeyDto(input.keyId);
  }
}
