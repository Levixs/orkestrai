import type { SaveProviderProfileInput } from '../../contracts/schemas/providerProfileSchemas.js';

export class SaveProviderProfileDto {
  constructor(
    public readonly providerId: string,
    public readonly name: string,
    public readonly configDir: string | null,
    public readonly dataDir: string | null,
    public readonly token: string | null,
  ) {}

  static from(input: SaveProviderProfileInput): SaveProviderProfileDto {
    return new SaveProviderProfileDto(
      input.providerId,
      input.name,
      input.configDir ?? null,
      input.dataDir ?? null,
      input.token ?? null,
    );
  }
}
