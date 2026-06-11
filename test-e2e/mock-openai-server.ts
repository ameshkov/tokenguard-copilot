/// <reference types="mocha" />

import * as http from 'node:http';

/**
 * A minimal mock OpenAI-compatible server for E2E tests.
 * Handles `/models` and `/chat/completions` endpoints.
 */
export interface MockOpenAIServer {
  /** Base URL including the port, e.g. `http://127.0.0.1:9876`. */
  readonly baseUrl: string;
  /** Headers received from the last `/chat/completions` request, or null if none. */
  readonly lastRequestHeaders: Record<string, string | string[] | undefined> | null;
  /** Shuts down the server. */
  close(): Promise<void>;
}

/** Shape of a parsed chat completion request body. */
interface ChatCompletionRequest {
  stream?: boolean;
  model?: string;
}

/** Type for the headers-capture callback used by handleChatCompletions. */
type HeadersCallback = (headers: Record<string, string | string[] | undefined>) => void;

/**
 * Writes a `GET /models` response returning a single `mock-model`.
 */
function handleGetModels(res: http.ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      object: 'list',
      data: [
        {
          id: 'mock-model',
          object: 'model',
          created: Date.now(),
          owned_by: 'mock',
        },
      ],
    }),
  );
}

/**
 * Writes a 404 JSON error response.
 */
function handleNotFound(res: http.ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

/**
 * Writes SSE streaming response chunks for a chat completion.
 */
function writeStreamResponse(res: http.ServerResponse, modelId: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const now = Math.floor(Date.now() / 1000);

  const chunk = {
    id: 'chatcmpl-mock-1',
    object: 'chat.completion.chunk',
    created: now,
    model: modelId,
    choices: [{ index: 0, delta: { content: 'Hello from mock server!' }, finish_reason: null }],
  };

  const doneChunk = {
    id: 'chatcmpl-mock-1',
    object: 'chat.completion.chunk',
    created: now,
    model: modelId,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };

  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

/**
 * Writes a non-streaming JSON response for a chat completion.
 */
function writeNonStreamResponse(res: http.ServerResponse, modelId: string): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      id: 'chatcmpl-mock-1',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from mock server!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  );
}

/**
 * Reads the request body, parses it as a chat completion request,
 * and dispatches to either the streaming or non-streaming response helper.
 */
function handleChatCompletions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  onHeaders: HeadersCallback,
): void {
  onHeaders(req.headers);

  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });
  req.on('end', () => {
    const request = JSON.parse(body) as ChatCompletionRequest;
    const modelId = request.model ?? 'mock-model';

    if (request.stream) {
      writeStreamResponse(res, modelId);
    } else {
      writeNonStreamResponse(res, modelId);
    }
  });
}

/**
 * Starts a mock OpenAI-compatible HTTP server on a random
 * available port. The server responds to:
 *
 * - `GET /models` — returns a single model `mock-model`.
 * - `POST /chat/completions` — returns a non-streaming
 *   completion with a fixed assistant message.
 *
 * @returns A running mock server with its base URL and a
 *   close method.
 */
export function startMockOpenAIServer(): Promise<MockOpenAIServer> {
  return new Promise((resolve, reject) => {
    let lastRequestHeaders: Record<string, string | string[] | undefined> | null = null;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (req.method === 'GET' && url.pathname === '/models') {
        handleGetModels(res);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/chat/completions') {
        handleChatCompletions(req, res, (headers) => {
          lastRequestHeaders = headers;
        });
        return;
      }

      handleNotFound(res);
    });

    server.on('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        get lastRequestHeaders() {
          return lastRequestHeaders;
        },
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
