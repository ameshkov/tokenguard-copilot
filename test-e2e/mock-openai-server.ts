/// <reference types="mocha" />

import * as http from 'node:http';

/**
 * A minimal mock OpenAI-compatible server for E2E tests.
 * Handles `/models` and `/chat/completions` endpoints.
 */
export interface MockOpenAIServer {
  /** Base URL including the port, e.g. `http://127.0.0.1:9876`. */
  readonly baseUrl: string;
  /** Shuts down the server. */
  close(): Promise<void>;
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
    const server = http.createServer((req, res) => {
      // Parse URL path
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (req.method === 'GET' && url.pathname === '/models') {
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
        return;
      }

      if (req.method === 'POST' && url.pathname === '/chat/completions') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          const request = JSON.parse(body) as {
            stream?: boolean;
            model?: string;
          };

          if (request.stream) {
            // Streaming response (SSE)
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });

            const chunk = {
              id: 'chatcmpl-mock-1',
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: request.model ?? 'mock-model',
              choices: [
                {
                  index: 0,
                  delta: { content: 'Hello from mock server!' },
                  finish_reason: null,
                },
              ],
            };

            const doneChunk = {
              id: 'chatcmpl-mock-1',
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: request.model ?? 'mock-model',
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            };

            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } else {
            // Non-streaming response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: 'chatcmpl-mock-1',
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: request.model ?? 'mock-model',
                choices: [
                  {
                    index: 0,
                    message: {
                      role: 'assistant',
                      content: 'Hello from mock server!',
                    },
                    finish_reason: 'stop',
                  },
                ],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 5,
                  total_tokens: 15,
                },
              }),
            );
          }
        });
        return;
      }

      // Unknown endpoint
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.on('error', reject);

    // Listen on a random port on localhost
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
