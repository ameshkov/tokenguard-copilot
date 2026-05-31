# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased][unreleased]

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

[unreleased]: https://github.com/ameshkov/tokenguard-copilot/compare/v1.1.0...HEAD
[v1.1.0]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.1.0
[v1.0.0]: https://github.com/ameshkov/tokenguard-copilot/releases/tag/v1.0.0
