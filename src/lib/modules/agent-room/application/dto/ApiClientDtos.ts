import type {
  ExecuteApiClientRequestInput,
  ExecuteSavedApiClientRequestInput,
  ApiClientOAuthInput,
  ApiClientSyncRequestInput,
  ExportApiClientCollectionInput,
  ImportApiClientCollectionInput,
  CreateAgentApiClientInput,
  ReplaceAgentApiClientInput,
  ExportAgentApiClientInput,
  ExecuteAgentApiClientRunnerInput,
} from '../../contracts/schemas/apiClient.schema.js';

export class ExecuteApiClientRequestDto {
  constructor(public readonly input: ExecuteApiClientRequestInput) {}
  static from(input: ExecuteApiClientRequestInput) { return new ExecuteApiClientRequestDto(input); }
}

export class ImportApiClientCollectionDto {
  constructor(public readonly input: ImportApiClientCollectionInput) {}
  static from(input: ImportApiClientCollectionInput) { return new ImportApiClientCollectionDto(input); }
}

export class ExportApiClientCollectionDto {
  constructor(public readonly input: ExportApiClientCollectionInput) {}
  static from(input: ExportApiClientCollectionInput) { return new ExportApiClientCollectionDto(input); }
}

export class ExecuteSavedApiClientRequestDto {
  constructor(public readonly input: ExecuteSavedApiClientRequestInput) {}
  static from(input: ExecuteSavedApiClientRequestInput) { return new ExecuteSavedApiClientRequestDto(input); }
}

export class ApiClientOAuthDto {
  constructor(public readonly input: ApiClientOAuthInput) {}
  static from(input: ApiClientOAuthInput) { return new ApiClientOAuthDto(input); }
}

export class ApiClientSyncDto {
  constructor(public readonly input: ApiClientSyncRequestInput) {}
  static from(input: ApiClientSyncRequestInput) { return new ApiClientSyncDto(input); }
}

export class CreateAgentApiClientDto {
  constructor(public readonly input: CreateAgentApiClientInput) {}
  static from(input: CreateAgentApiClientInput) { return new CreateAgentApiClientDto(input); }
}

export class ReplaceAgentApiClientDto {
  constructor(public readonly input: ReplaceAgentApiClientInput) {}
  static from(input: ReplaceAgentApiClientInput) { return new ReplaceAgentApiClientDto(input); }
}

export class ExportAgentApiClientDto {
  constructor(public readonly input: ExportAgentApiClientInput) {}
  static from(input: ExportAgentApiClientInput) { return new ExportAgentApiClientDto(input); }
}

export class ExecuteAgentApiClientRunnerDto {
  constructor(public readonly input: ExecuteAgentApiClientRunnerInput) {}
  static from(input: ExecuteAgentApiClientRunnerInput) { return new ExecuteAgentApiClientRunnerDto(input); }
}
