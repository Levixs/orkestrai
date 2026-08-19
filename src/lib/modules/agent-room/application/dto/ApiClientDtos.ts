import type {
  ExecuteApiClientRequestInput,
  ExecuteSavedApiClientRequestInput,
  ImportApiClientCollectionInput,
} from '../../contracts/schemas/apiClient.schema.js';

export class ExecuteApiClientRequestDto {
  constructor(public readonly input: ExecuteApiClientRequestInput) {}
  static from(input: ExecuteApiClientRequestInput) { return new ExecuteApiClientRequestDto(input); }
}

export class ImportApiClientCollectionDto {
  constructor(public readonly input: ImportApiClientCollectionInput) {}
  static from(input: ImportApiClientCollectionInput) { return new ImportApiClientCollectionDto(input); }
}

export class ExecuteSavedApiClientRequestDto {
  constructor(public readonly input: ExecuteSavedApiClientRequestInput) {}
  static from(input: ExecuteSavedApiClientRequestInput) { return new ExecuteSavedApiClientRequestDto(input); }
}
