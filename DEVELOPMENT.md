# Development

## Prerequisites

- Node.js 22
- pnpm (install via `npm install -g pnpm@10.28.1`)
- VS Code >= 1.120.0 (or VS Code Insiders for proposed API support)

## Node.js Version

The project uses **Node.js 22** (LTS). This version is
pinned in several places. When upgrading, update **all**
of them:

| File | What to change |
| --- | --- |
| `Dockerfile.ci` | `FROM node:22-bookworm-slim` base image tag |
| `Dockerfile.e2e` | Playwright image tag (ships Node.js; pick a tag matching the desired version) |
| `.github/workflows/ci.yml` | `node-version: 22` in publish jobs |
| `DEVELOPMENT.md` | Prerequisites section (this file) |
| `AGENTS.md` | Technical Context table |

The Dockerfiles are the source of truth for CI — they
fully control the Node.js version used for linting,
testing, and packaging. The `ci.yml` workflow only needs
Node.js for the publish steps that run outside Docker.

## Setup

```bash
pnpm install
```

## Build

```bash
pnpm run compile
```

This runs several sub-commands in sequence:

1. **`compile:shared`** — builds `packages/shared` (TypeScript
   compilation, emits `.d.ts` and `.js`).
2. **`compile:extension`** — bundles `packages/extension` with
   esbuild into `out/extension.js` (CJS, Node.js target).
3. **`compile:webview`** — bundles `packages/webview-ui` with
   esbuild into `out/webview/` (IIFE, browser target).
4. **`compile:migrations`** — copies SQL migration files from
   `packages/extension/src/db/migrations/` to `out/db/migrations/`.
5. **`compile:e2e`** — compiles E2E test files with `tsc` into
   `out/test-e2e/`.

## Type checking

```bash
pnpm run typecheck
```

Type-checks all packages without emitting output. Useful
for catching type errors without a full build.

## Watch mode

```bash
pnpm run watch        # watches extension host bundle
pnpm run watch:webview # watches webview bundle
```

## Webview Playground

Develop and debug the settings page in a regular browser
with VS Code styling, without running the extension host.

```bash
pnpm dev:webview
```

This starts a Vite dev server on `http://localhost:5173`
with hot module replacement. The
`@vscode-elements/webview-playground` toolbar lets you
switch between VS Code color themes. All VS Code API calls
are handled by an in-memory mock — changes are not
persisted across page reloads.

## Linting and formatting

```bash
pnpm run lint         # ESLint + Knip unused-export analysis
pnpm run lint:fix     # auto-fix ESLint issues
pnpm run format:check # Prettier + Markdownlint
pnpm run format:fix   # auto-fix formatting issues
```

## Running the extension

Use one of the launch configurations in `.vscode/launch.json`:

- **Run Extension (Current VS Code)** — launches an Extension
  Development Host using the current VS Code instance.
- **Run Extension (Insiders via CLI)** — launches VS Code
  Insiders with the extension loaded. Requires `code-insiders`
  in PATH.
- **Run Extension (Stable via CLI)** — launches stable VS Code
  with the extension loaded. Requires `code` in PATH.

## Testing

```bash
pnpm run test            # run all unit tests
pnpm run test:extension  # extension host unit tests only
pnpm run test:webview    # webview unit tests only
pnpm run test:e2e        # E2E tests inside VS Code
```

## Packaging

```bash
pnpm run package
```

This produces a `.vsix` file in the `dist/` directory.

## Database

The extension uses SQLite (via the built-in `node:sqlite`
module) with Drizzle ORM for data persistence. The database
file is stored in the VS Code `globalStorageUri` directory.

### Tables

| Table | Purpose |
| --- | --- |
| `providers` | OpenAI-compatible API provider configurations |
| `models` | Per-model configuration for registered providers |
| `usage_records` | Daily aggregated token usage per model |
| `settings` | Key-value store for extension configuration |
| `session_mappings` | Maps conversation fingerprints to debug session IDs |
| `reasoning_cache` | Persists reasoning/chain-of-thought across turns |

### Migration Generation

After modifying `src/db/schema.ts`, generate a new migration:

```bash
pnpm run db:generate
```

This creates SQL migration files in
`src/db/migrations/`. Commit both the schema changes
and the generated migration files.

### How Migrations Are Applied

Migrations run automatically when the extension activates.
The `runMigrations()` function reads the bundled
`migrations/` folder and applies any pending migrations.

### Adding New Tables or Columns

1. Modify `src/db/schema.ts` with the new table or column
   definitions.
2. Run `pnpm run db:generate` to create a new migration.
3. Run `pnpm run test` to verify the migration works.
4. Commit both the schema and migration files.

## Docker Builds

The project provides two Dockerfiles that encapsulate the
full CI pipeline. Using Docker for CI ensures **reproducible
builds** — every run uses the same OS, Node.js version, and
system libraries regardless of the host machine. This
eliminates "works on my machine" issues and means the CI
workflow in GitHub Actions is a single `docker build`
command with no setup steps.

Both Dockerfiles use multi-stage builds where the final
stage is `FROM scratch`, producing a near-empty image. The
tests and checks run during `docker build`; if any stage
fails, the build fails. Use `--output type=local` to
extract results to a local directory instead of storing a
Docker image.

### Dockerfile.ci — Lint, Unit Tests & Package

Runs linting, formatting checks, unit tests, and packages
the `.vsix` — all in parallel stages that share a common
dependency-install and compile layer.

```bash
docker build -f Dockerfile.ci \
    --output type=local,dest=./ci-output .
```

Output in `./ci-output/`:

- `lint-results.txt` — lint and format check output
- `unit-test-results.txt` — unit test output
- `*.vsix` — packaged extension

### Dockerfile.e2e — E2E Tests

Runs E2E tests inside a Playwright base image that includes
Xvfb and all Electron system dependencies.

```bash
docker build -f Dockerfile.e2e \
    --output type=local,dest=./e2e-output .
```

Output in `./e2e-output/`:

- `e2e-exit-code` — E2E test exit code
- `e2e-results.txt` — E2E test output

### BuildKit Cache

Both Dockerfiles use BuildKit cache mounts for pnpm
(`--mount=type=cache`). The E2E Dockerfile also caches the
downloaded VS Code binary in `.vscode-test`. These caches
persist across builds on the same machine, speeding up
repeated runs.

### Test Database

Tests use real in-memory SQLite databases via the
`createTestDb()` helper from
`packages/extension/src/test/db-setup.ts`. Each call returns
an independent, fully migrated database. No mocking of the
database layer is needed in tests.

## Extension Architecture

The extension follows a layered architecture with manual
constructor injection:

```text
activate() / deactivate()
     ↓
ExtensionContext (DI container)
     ↓
Commands + Providers (register with VS Code)
     ↓
Services (business logic)
     ↓
Repositories (data access)
     ↓
Database (node:sqlite + Drizzle ORM)
```

### Dependency Flow

- **`ExtensionContext`** wires repositories and services.
  It exposes only services — repositories and the database
  connection are internal wiring details.
- **Services** receive repositories via constructor. No raw
  database calls in services.
- **Repositories** receive the Drizzle `Database` instance
  via constructor. They encapsulate all SQL queries. No
  caching or business logic in repositories.
- No upward dependencies — lower layers never import from
  upper layers.
- `activate()` creates the database connection, runs
  migrations, builds the `ExtensionContext`, and passes it
  to commands and handlers.
- `deactivate()` disposes the `ExtensionContext` (which
  tears down all services) and closes the database.

### Services

All services live in
`packages/extension/src/services/`. Each service has its
own directory with an `index.ts` barrel, the implementation
file, and a `.test.ts` file.

| Service | Directory | Purpose |
| --- | --- | --- |
| **ProviderManager** | `provider-manager/` | CRUD for API providers; manages provider lifecycle and secret storage |
| **ModelRegistry** | `model-registry/` | Fetches models from providers, persists configuration, registers/unregisters with VS Code via `ChatModelProvider` |
| **ChatHandler** | `chat-handler/` | Translates VS Code chat requests to OpenAI `/chat/completions` API calls; handles streaming, tools, vision, reasoning |
| **TokenCounter** | `token-counter/` | Counts tokens using `@microsoft/tiktokenizer` with LRU caching; estimates costs per model |
| **UsageTracker** | `usage-tracker/` | Records and aggregates daily token usage per model (prompt, completion, cached, reasoning tokens) |
| **SessionTracker** | `session-tracker/` | Maps conversation fingerprints to debug session IDs for attributing chat requests |
| **ChatDebugLogger** | `chat-debug-logger/` | Logs chat request/response pairs to disk for debugging; writes session-scoped log files |
| **ChatDebugSettings** | `chat-debug-settings/` | Reads/writes chat debug logging preferences via `SettingsRepository` |
| **ChatDebugCleanup** | `chat-debug-cleanup/` | Periodic cleanup of old chat debug log files and orphaned session mappings |
| **ReasoningCacheService** | `reasoning-cache/` | Caches reasoning/chain-of-thought content across multi-turn conversations |
| **ReasoningCacheCleanup** | `reasoning-cache-cleanup/` | Periodic cleanup of expired reasoning cache entries |
| **CacheControlService** | `cache-control/` | Manages `cache_control` configuration for provider models |
| **ModelDefaults** | `model-defaults/` | Looks up default model configurations from bundled `assets/model-defaults.json` |

### Utility Modules

Utility functions live in
`packages/extension/src/utils/`.

| Module | Exports |
| --- | --- |
| `content.ts` | `extractTextContent()`, `extractImageParts()`, `ImagePartInfo` |
| `fingerprint.ts` | `computeFingerprint()`, `computeMessageFingerprint()`, types |
| `image-dimensions.ts` | `getImageDimensions()` — extracts width/height from base64 images |
| `reasoning.ts` | `extractReasoning()`, `extractReasoningFields()`, `ReasoningFields` |

### Repositories

All repositories live in
`packages/extension/src/repositories/` and are re-exported
from `index.ts`.

- **ProviderRepository** — CRUD for API provider records
- **ModelRepository** — CRUD for model configuration
- **SettingsRepository** — key-value settings store
- **SessionMappingRepository** — fingerprint-to-session ID
  mappings
- **ReasoningCacheRepository** — reasoning cache persistence
- **UsageRecordRepository** — token usage record upserts

## Logging

The extension uses a centralized `Logger` interface
(`packages/extension/src/logger/`) backed by VS Code's
`LogOutputChannel`. The output channel is named
**TokenGuard Copilot** and appears in VS Code's Output
panel.

### Viewing Logs

1. Open VS Code's Output panel (View → Output).
2. Select **TokenGuard Copilot** from the channel dropdown.
3. Use the **Log Level** selector in the Output panel
   toolbar to control verbosity (Trace, Debug, Info,
   Warning, Error).

### Architecture

A thin `Logger` interface wraps VS Code's
`LogOutputChannel`. Services depend on the interface (not
`vscode` directly) so tests can inject a mock logger via
`createMockLogger()` from
`packages/extension/src/test/mock-logger.ts`.

The logger is created once in `activate()`, pushed to
`context.subscriptions`, and injected into services
through the `ExtensionContext` DI container.

### Log Levels

| Level | Usage |
| --- | --- |
| `trace` | SSE stream events, low-level data flow |
| `debug` | Request lifecycle, command execution |
| `info` | Service initialization, activation |
| `warn` | Recoverable errors, fallbacks |
| `error` | Failures, unexpected errors |

### Security Rules

- **Never log**: API keys, auth tokens, `Authorization`
  headers, secrets, user file contents, personal data.
- **OK to log**: model IDs, provider names, status codes,
  error messages, configuration keys, request duration.
