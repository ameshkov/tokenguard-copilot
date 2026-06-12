# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased][unreleased]

## [v1.2.7] - 2026-06-12

### Changed

- Added `kimi-k2.7-code` to model defaults, fixed prices to match Moonshot API
- Reafactored code after introducing max-lines limits to the linter config

## [v1.2.6] - 2026-06-10

### Changed

- Reasoning preservation has been reworked — see
  [docs/reasoning.md](docs/reasoning.md) for details.
- Reasoning fields in API requests now only include the fields the
  server originally sent, instead of populating all three
  (`reasoning_content`, `reasoning`, `reasoning_details`) from a
  single value. This prevents fake reasoning fields from being injected
  into upstream requests and ensures compatibility with providers that
  reject unknown fields.
- Added model defaults for `mimo-v2.5-pro-ultraspeed` and `fable-5`.
- Extracted `translateMessages` and `mapRole` into a separate module,
  exported `OpenAIToolCall` from the chat-handler barrel, and split
  `chat-handler.test.ts` into four logical test files.

## [v1.2.5] - 2026-06-09

### Fixed

- An issue with reasoning preservation not working when content rules are
  applied.

## [v1.2.4] - 2026-06-03

### Changed

- Chat debug tree view items now display formatted timestamps
  (`2026-05-21 10:00:00`), request IDs as descriptions, and
  order numbers. "log(s)" renamed to "turn(s)" for session
  descriptions.
- `requestId` is now written to the metadata section of chat debug
  Markdown logs for easy correlation with HTTP headers and runtime
  log lines.

### Fixed

- Re-adding a previously removed model no longer fails with a
  primary key constraint violation. The stale soft-deleted row
  is reactivated instead of attempting a duplicate insert.

## [v1.2.3] - 2026-06-02

### Added

- `X-TokenGuard-Request-Id` header sent in chat completion requests,
  logged in debug logs, and included in error messages.
- Request ID is now generated per-chat-completion-request and
  propagated to the per-session debug Markdown file names for
  easy correlation between HTTP headers, runtime logs, debug
  files, and error messages.

### Fixed

- Chat completion `fetch` requests are now retried once on a
  transient network failure (e.g. `ETIMEDOUT` from undici's
  keep-alive pool handing out a half-dead connection), with the
  original failure logged at `warn` level. User-initiated
  cancellation is not retried.

## [v1.2.2] - 2026-06-02

### Changed

- User-Agent header for all HTTP requests sent by the extension is now
  `TokenGuardCopilot/v${version}`
- Chat completion error log and the per-session Chat Debug
  Markdown "Error" section now include the underlying network
  error cause (e.g. `code=ENOTFOUND`, `syscall=getaddrinfo`,
  `hostname=...`) instead of just `"fetch failed"`, making DNS,
  TCP, and TLS failures diagnosable from a single log line or
  debug file.

## [v1.2.1] - 2026-06-01

### Added

- Model defaults: added MiniMax-M3 model entry with vision support,
  reasoning effort, 512K context window, and pricing of $0.6/$2.4
  per 1M input/output tokens ($0.12 cached).

### Changed

- **`@types/vscode`**: Updated from `^1.116.0` to `^1.120.0` and
  minimum VS Code engine from `^1.116.0` to `^1.120.0` (closes #??).

### Fixed

- Reasoning effort picker is now visible for models added via
  TokenGuard Copilot.
- Fixed Usage Stats graph not filtering data when a model is selected
  without a provider
  ([#3](https://github.com/ameshkov/tokenguard-copilot/issues/3)).
- Fixed model sampling parameter inputs (temperature, top_p,
  frequency_penalty, presence_penalty) rejecting arbitrary
  floating-point values like `0.95` due to restrictive `step="0.1"`
  attribute
  ([#1](https://github.com/ameshkov/tokenguard-copilot/issues/1)).
- Fixed model context size displayed in Copilot Chat model picker
  being inflated (context window + output tokens instead of just
  context window). `maxInputTokens` was incorrectly set to the full
  context window; it is now correctly computed as
  `maxContextWindowTokens - maxOutputTokens`
  ([#2](https://github.com/ameshkov/tokenguard-copilot/issues/2)).

## [v1.2.0] - 2026-05-31

### Added

- Content Rules: regex-based message transformation engine. Rules can
  match on role, message number, model/content patterns, and tool
  presence, then apply regex substitutions to chat messages. Includes
  a management UI in the settings webview, database persistence, and
  full documentation.

### Fixed

- Streaming chat handler now reports `LanguageModelThinkingPart`
  before `LanguageModelTextPart` within each SSE chunk, consistent
  with the non-streaming path.
- Chat Debug logs now include tool parameter schemas (`parameters`)
  and workspace folder paths (`workspaces` field) in metadata.
- Error messages from failed HTTP responses are now truncated to 128
  characters to prevent large gateway HTML pages from polluting the
  error display. The full response body is still logged to the output
  channel for debugging.
- Fixed "database is locked" error by setting `PRAGMA busy_timeout`
  (5-second wait) on the SQLite connection, and wrapping usage
  recording and reasoning cache writes in try-catch so that
  transient DB lock contention does not crash chat responses.

## [v1.1.0] - 2026-05-29

### Changed

- Improved logging in cleanup services: `ChatDebugCleanupService` and
  `ReasoningCacheCleanupService` now log starting and completion messages at
  `debug` level, and `ChatDebugCleanupService` logs individual session
  deletions and a summary with counts.
- Usage stats chart tooltip now shows a per-component cost breakdown (prompt,
  cached, completion) instead of a single total, and correctly aggregates
  costs across all models for the hovered date.

## [v1.0.0] - 2026-05-29

### Added

- First release of the extension that registers third-party OpenAI-compatible
  language models in VS Code Copilot Chat via the `languageModelChatProvider`
  API.
- Provider management — add, edit, and delete OpenAI-compatible API endpoints
  with API keys stored in VS Code SecretStorage.
- Model registry — discover models from the provider’s `/models` endpoint and
  register them so they appear in the Copilot Chat model picker.
- Chat completion with streaming, tool-call forwarding, reasoning/thinking
  parts, and cache control.
- Token counting using the `o200k_base` tiktoken encoding.
- Per-model usage tracking with daily token aggregation and estimated cost
  calculation.
- Bundled defaults database for 35+ models (DeepSeek, Qwen, Claude, GPT, Kimi,
  GLM, Minimax and others) for auto-filling model configuration.
- Custom fields support for injecting arbitrary parameters into chat completion
  request bodies.
- Reasoning cache that preserves chain-of-thought content across multi-turn
  conversations.
- Settings webview panel (React) for managing providers, models, debug logging,
  and usage statistics.
- Status bar indicator showing provider count and token usage.
- Chat debug logging with per-session Markdown files and a tree view in the
  Explorer sidebar.
- SQLite persistence via `node:sqlite` and Drizzle ORM.

[unreleased]: https://github.com/ameshkov/tokenguard-copilot/compare/v1.2.7...HEAD
[v1.2.7]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.7
[v1.2.6]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.6
[v1.2.5]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.5
[v1.2.4]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.4
[v1.2.3]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.3
[v1.2.2]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.2
[v1.2.1]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.1
[v1.2.0]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.2.0
[v1.1.0]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.1.0
[v1.0.0]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.0.0
