import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GetProvidersResponse } from '@tokenguard/shared';

// Reset cached API between tests by re-importing
let getVsCodeApi: typeof import('./vscode-api.js').getVsCodeApi;
let sendRequest: typeof import('./vscode-api.js').sendRequest;

describe('getVsCodeApi', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal(
      'acquireVsCodeApi',
      vi.fn(() => ({
        postMessage: vi.fn(),
        getState: vi.fn(),
        setState: vi.fn(),
      })),
    );
    const mod = await import('./vscode-api.js');
    getVsCodeApi = mod.getVsCodeApi;
    sendRequest = mod.sendRequest;
  });

  it('returns api object', () => {
    const api = getVsCodeApi();
    expect(api.postMessage).toBeDefined();
    expect(api.getState).toBeDefined();
    expect(api.setState).toBeDefined();
  });

  it('returns same instance on second call', () => {
    const a = getVsCodeApi();
    const b = getVsCodeApi();
    expect(a).toBe(b);
  });
});

describe('sendRequest', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('resolves with matching response', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal(
      'acquireVsCodeApi',
      vi.fn(() => ({
        postMessage,
        getState: vi.fn(),
        setState: vi.fn(),
      })),
    );

    const mod = await import('./vscode-api.js');
    sendRequest = mod.sendRequest;

    const promise = sendRequest({ type: 'getProviders' });

    const posted = postMessage.mock.calls[0][0];
    expect(posted.requestId).toBeDefined();
    expect(posted.type).toBe('getProviders');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'getProvidersResult',
          requestId: posted.requestId,
          providers: [],
        },
      }),
    );

    const response = await promise;
    expect(response.type).toBe('getProvidersResult');
  });

  it('ignores messages with wrong requestId', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal(
      'acquireVsCodeApi',
      vi.fn(() => ({
        postMessage,
        getState: vi.fn(),
        setState: vi.fn(),
      })),
    );

    const mod = await import('./vscode-api.js');
    sendRequest = mod.sendRequest;

    const promise = sendRequest({ type: 'getProviders' });

    const posted = postMessage.mock.calls[0][0];

    // Wrong requestId — ignored
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'getProvidersResult',
          requestId: 'wrong-id',
          providers: [],
        },
      }),
    );

    // Correct requestId
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'getProvidersResult',
          requestId: posted.requestId,
          providers: [{ id: 'p1', name: 'A', baseUrl: 'https://a.com' }],
        },
      }),
    );

    const response = await promise;
    expect((response as GetProvidersResponse).providers).toHaveLength(1);
  });
});
