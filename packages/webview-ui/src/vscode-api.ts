import type { WebviewCommand, HostMessage } from '@tokenguard/shared';

/**
 * Minimal interface for the VS Code webview API.
 */
export interface VsCodeApi {
  /** Posts a message to the extension host. */
  postMessage(message: unknown): void;
  /** Returns the persisted webview state. */
  getState(): unknown;
  /** Persists webview state. */
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let cachedApi: VsCodeApi | null = null;

/**
 * Returns the VS Code webview API singleton.
 *
 * Calls `acquireVsCodeApi()` once and caches the result.
 *
 * @returns The VS Code webview API object.
 */
export function getVsCodeApi(): VsCodeApi {
  if (!cachedApi) {
    cachedApi = acquireVsCodeApi();
  }
  return cachedApi;
}

/**
 * Request payload without the auto-generated requestId.
 */
type RequestPayload = {
  [K in WebviewCommand['type']]: Omit<Extract<WebviewCommand, { type: K }>, 'requestId'>;
}[WebviewCommand['type']];

/**
 * Sends a request to the extension host and returns a promise
 * that resolves when the host responds with a matching
 * `requestId`.
 *
 * @param message - Request payload without requestId.
 * @returns The host's response message.
 */
export function sendRequest<T extends HostMessage>(message: RequestPayload): Promise<T> {
  const requestId = crypto.randomUUID();
  const api = getVsCodeApi();

  return new Promise<T>((resolve) => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data?.requestId === requestId) {
        window.removeEventListener('message', handler);
        resolve(data as T);
      }
    };
    window.addEventListener('message', handler);
    api.postMessage({ ...message, requestId });
  });
}
