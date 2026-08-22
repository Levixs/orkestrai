import { describe, expect, it } from 'vitest';
import { apiClientCompletionOptions } from '$lib/components/agent-room/canvas/api-code-completions.js';

describe('API Client code completions', () => {
  it('offers official Bruno globals and contextual bru members', () => {
    expect(apiClientCompletionOptions('bruno', null).map((entry) => entry.label)).toEqual(expect.arrayContaining(['bru', 'req', 'res', 'test', 'expect']));
    expect(apiClientCompletionOptions('bruno', 'bru').map((entry) => entry.label)).toEqual(expect.arrayContaining(['getVar', 'setVar', 'sendRequest', 'runRequest', 'cookies', 'runner']));
    expect(apiClientCompletionOptions('bruno', 'bru.runner.iterationData').map((entry) => entry.label)).toEqual(expect.arrayContaining(['get', 'set', 'toObject']));
    expect(apiClientCompletionOptions('bruno', 'pm')).toEqual([]);
  });

  it('keeps Postman completion scoped to pm and exposes native compatibility aliases', () => {
    expect(apiClientCompletionOptions('postman', 'pm').map((entry) => entry.label)).toEqual(expect.arrayContaining(['test', 'expect', 'sendRequest', 'collectionVariables', 'execution']));
    expect(apiClientCompletionOptions('postman', 'bru')).toEqual([]);
    expect(apiClientCompletionOptions('orkestrai', null).map((entry) => entry.label)).toEqual(expect.arrayContaining(['bru', 'pm', 'test', 'expect']));
  });
});
