/// <reference types="mocha" />

import * as assert from 'node:assert';
import { LanguageModelChatMessage, LanguageModelTextPart, lm } from 'vscode';
import { getExtension, waitForCondition } from './helpers.js';
import { startMockOpenAIServer, type MockOpenAIServer } from './mock-openai-server.js';

/**
 * Extension API shape exported by activate().
 * Mirrors the ExtensionApi interface from extension.ts.
 */
interface ExtensionApi {
  readonly providerManager: {
    addProvider(name: string, baseUrl: string, apiKey: string): Promise<{ id: string }>;
    removeProvider(id: string): Promise<void>;
  };
  readonly modelRegistry: {
    addModel(
      providerId: string,
      modelId: string,
      config: Record<string, unknown>,
    ): { id: string; providerId: string };
    removeModel(providerId: string, modelId: string): void;
  };
}

suite('Chat Completion E2E', () => {
  let server: MockOpenAIServer;
  let api: ExtensionApi;
  let providerId: string | undefined;

  suiteSetup(async () => {
    server = await startMockOpenAIServer();
    const extension = await getExtension();
    api = extension.exports as ExtensionApi;
    assert.ok(api, 'Extension should export an API');
    assert.ok(api.providerManager, 'API should have providerManager');
    assert.ok(api.modelRegistry, 'API should have modelRegistry');
  });

  suiteTeardown(async () => {
    if (providerId && api) {
      try {
        await api.providerManager.removeProvider(providerId);
      } catch {
        // Provider may already be cleaned up
      }
    }
    if (server) {
      await server.close();
    }
  });

  test('add provider, add model, and get a chat completion', async function () {
    // Increase timeout for this test — model registration
    // and language model API calls may take a while.
    this.timeout(30000);

    // Step 1: Add a provider pointing to the mock server.
    const provider = await api.providerManager.addProvider(
      'Mock Provider',
      server.baseUrl,
      'mock-api-key',
    );
    providerId = provider.id;
    assert.ok(providerId, 'Provider ID should be returned');

    // Step 2: Add a model for the provider.
    const model = api.modelRegistry.addModel(providerId, 'mock-model', {
      displayName: null,
      maxContextWindowTokens: 128000,
      maxOutputTokens: 4096,
      streaming: false,
      vision: false,
      temperature: null,
      topP: null,
      frequencyPenalty: null,
      presencePenalty: null,
      defaultReasoningEffort: null,
      reasoningEffortMap: null,
      preserveReasoning: false,
      inputCostPer1m: null,
      outputCostPer1m: null,
      cachedInputCostPer1m: null,
      cacheControl: null,
      customFields: null,
    });
    assert.strictEqual(model.id, 'mock-model');
    assert.strictEqual(model.providerId, providerId);

    // Step 3: Wait for the model to appear in the language
    // model registry.
    const chatModel = await waitForCondition(async () => {
      const models = await lm.selectChatModels({
        vendor: 'tokenguard-copilot',
      });

      return models.find((m) => m.family === 'mock-model');
    }, 15000);

    assert.ok(chatModel, 'Mock model should be selectable');

    // Step 4: Send a chat message and collect the response.
    const messages = [LanguageModelChatMessage.User('Say hello')];
    const response = await chatModel.sendRequest(messages, {});

    let fullText = '';
    for await (const part of response.stream) {
      if (part instanceof LanguageModelTextPart) {
        fullText += part.value;
      }
    }

    assert.strictEqual(fullText, 'Hello from mock server!', 'Response should match mock output');

    // Verify X-TokenGuard-Request-Id header was sent
    assert.ok(server.lastRequestHeaders, 'Server should have captured request headers');
    const requestIdHeader = server.lastRequestHeaders['x-tokenguard-request-id'];
    assert.ok(requestIdHeader, 'X-TokenGuard-Request-Id header should be present');
    const headerValue = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
    assert.match(
      headerValue ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      'X-TokenGuard-Request-Id should be a valid UUID',
    );

    // Verify X-Session-Id header was sent
    const sessionIdHeader = server.lastRequestHeaders['x-session-id'];
    assert.ok(sessionIdHeader, 'X-Session-Id header should be present');
    const sessionIdValue = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    assert.match(
      sessionIdValue ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      'X-Session-Id should be a valid UUID',
    );
  });

  test('streaming chat completion works', async function () {
    this.timeout(30000);

    // The provider and non-streaming model were already
    // added. Add a streaming variant.
    assert.ok(providerId, 'Provider should exist from previous test');

    api.modelRegistry.addModel(providerId, 'mock-model-stream', {
      displayName: 'Mock Streaming',
      maxContextWindowTokens: 128000,
      maxOutputTokens: 4096,
      streaming: true,
      vision: false,
      temperature: null,
      topP: null,
      frequencyPenalty: null,
      presencePenalty: null,
      defaultReasoningEffort: null,
      reasoningEffortMap: null,
      preserveReasoning: false,
      inputCostPer1m: null,
      outputCostPer1m: null,
      cachedInputCostPer1m: null,
      cacheControl: null,
      customFields: null,
    });

    const chatModel = await waitForCondition(async () => {
      const models = await lm.selectChatModels({
        vendor: 'tokenguard-copilot',
      });

      return models.find((m) => m.family === 'mock-model-stream');
    }, 15000);

    assert.ok(chatModel, 'Streaming mock model should be selectable');

    const messages = [LanguageModelChatMessage.User('Say hello')];
    const response = await chatModel.sendRequest(messages, {});

    let fullText = '';
    for await (const part of response.stream) {
      if (part instanceof LanguageModelTextPart) {
        fullText += part.value;
      }
    }

    assert.strictEqual(
      fullText,
      'Hello from mock server!',
      'Streaming response should match mock output',
    );

    // Verify X-TokenGuard-Request-Id header was sent
    assert.ok(server.lastRequestHeaders, 'Server should have captured request headers');
    const requestIdHeader = server.lastRequestHeaders['x-tokenguard-request-id'];
    assert.ok(requestIdHeader, 'X-TokenGuard-Request-Id header should be present');
    const headerValue = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
    assert.match(
      headerValue ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      'X-TokenGuard-Request-Id should be a valid UUID',
    );

    // Verify X-Session-Id header was sent
    const sessionIdHeader = server.lastRequestHeaders['x-session-id'];
    assert.ok(sessionIdHeader, 'X-Session-Id header should be present');
    const sessionIdValue = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    assert.match(
      sessionIdValue ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      'X-Session-Id should be a valid UUID',
    );
  });

  test('x-session-id is identical across turns of one conversation', async function () {
    this.timeout(30000);
    assert.ok(providerId, 'Provider should exist from previous test');

    const chatModel = await waitForCondition(async () => {
      const models = await lm.selectChatModels({
        vendor: 'tokenguard-copilot',
      });

      return models.find((m) => m.family === 'mock-model');
    }, 15000);

    assert.ok(chatModel, 'Mock model should be selectable');

    // Use a unique first message so this conversation's
    // fingerprint does not collide with the fingerprints of
    // the earlier tests (which reuse "Say hello"). Otherwise
    // turn 2 would resolve to the first stored row for that
    // shared fingerprint instead of this conversation's id.
    const firstUserMessage = `Say hello (unique ${Date.now()})`;

    // Turn 1: user asks, assistant answers.
    const firstResponse = await chatModel.sendRequest(
      [LanguageModelChatMessage.User(firstUserMessage)],
      {},
    );
    let firstText = '';
    for await (const part of firstResponse.stream) {
      if (part instanceof LanguageModelTextPart) {
        firstText += part.value;
      }
    }
    assert.strictEqual(firstText, 'Hello from mock server!');

    // Turn 2: continue the conversation with the assistant
    // message from turn 1 in the history.
    const secondResponse = await chatModel.sendRequest(
      [
        LanguageModelChatMessage.User(firstUserMessage),
        LanguageModelChatMessage.Assistant(firstText),
        LanguageModelChatMessage.User('Say hello again'),
      ],
      {},
    );
    for await (const part of secondResponse.stream) {
      if (part instanceof LanguageModelTextPart) {
        // Consume the stream
        void part.value;
      }
    }

    const history = server.requestHeadersHistory;
    assert.ok(history.length >= 2, 'Both turns should have captured request headers');

    const turn1Headers = history[history.length - 2];
    const turn2Headers = history[history.length - 1];

    const turn1Header = turn1Headers['x-session-id'];
    const turn2Header = turn2Headers['x-session-id'];
    const turn1Value = Array.isArray(turn1Header) ? turn1Header[0] : turn1Header;
    const turn2Value = Array.isArray(turn2Header) ? turn2Header[0] : turn2Header;

    assert.ok(turn1Value, 'X-Session-Id should be present on turn 1');
    assert.ok(turn2Value, 'X-Session-Id should be present on turn 2');
    assert.match(
      turn1Value,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      'X-Session-Id should be a valid UUID',
    );
    assert.strictEqual(
      turn1Value,
      turn2Value,
      'X-Session-Id should be identical across turns of one conversation',
    );
  });
});
