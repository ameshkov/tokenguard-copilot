# Changelog

All notable changes to this project will be documented in this
file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- First release of the extension that registers third-party
  OpenAI-compatible language models in VS Code Copilot Chat
  via the `languageModelChatProvider` API.
- Provider management — add, edit, and delete
  OpenAI-compatible API endpoints with API keys stored in
  VS Code SecretStorage.
- Model registry — discover models from the provider's
  `/models` endpoint and register them so they appear in the
  Copilot Chat model picker.
- Chat completion with streaming, tool-call forwarding,
  reasoning/thinking parts, and cache control.
- Token counting using the `o200k_base` tiktoken encoding.
- Per-model usage tracking with daily token aggregation and
  estimated cost calculation.
- Bundled defaults database for 35+ models (DeepSeek, Qwen,
  Claude, Gemini, GPT, Grok, Llama, Mistral, Perplexity,
  and others) for auto-filling model configuration.
- Custom fields support for injecting arbitrary parameters
  into chat completion request bodies.
- Reasoning cache that preserves chain-of-thought content
  across multi-turn conversations.
- Settings webview panel (React) for managing providers,
  models, debug logging, and usage statistics.
- Status bar indicator showing provider count and token usage.
- Chat debug logging with per-session Markdown files and a
  tree view in the Explorer sidebar.
- SQLite persistence via `node:sqlite` and Drizzle ORM.

[unreleased]: https://github.com/ameshkov/tokenguard-copilot/commits/HEAD
