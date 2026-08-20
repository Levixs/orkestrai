export class ApiClientResponseResource {
  constructor(private readonly value: Record<string, unknown>) {}
  toJSON() { return this.value; }
}

export class ApiClientImportResource {
  constructor(private readonly value: { collectionName: string; payload: Record<string, unknown> }) {}
  toJSON() { return this.value; }
}

export class ApiClientExportResource {
  constructor(private readonly value: { kind: string; path: string; files: number }) {}
  toJSON() { return this.value; }
}
