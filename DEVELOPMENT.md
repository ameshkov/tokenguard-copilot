# Development

## Prerequisites

- Node.js 22
- pnpm
- VS Code >= 1.116.0

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
npm install
```

## Build

```bash
npm run compile
```

## Watch mode

```bash
npm run watch
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

## Linting

```bash
npm run lint
npm run format:check
```

## Running the extension

Use one of the launch configurations in `.vscode/launch.json`:

- **Run Extension (Current VS Code)** — launches an Extension Development Host
  using the current VS Code instance.
- **Run Extension (Insiders via CLI)** — launches VS Code Insiders with the
  extension loaded. Requires `code-insiders` in PATH.
- **Run Extension (Stable via CLI)** — launches stable VS Code with the
  extension loaded. Requires `code` in PATH.

## Packaging

```bash
npm run package
```

This produces a `.vsix` file in the `dist/` directory.

## Database

The extension uses SQLite (via `better-sqlite3`) with Drizzle
ORM for data persistence. The database file is stored in the
VS Code `globalStorageUri` directory.

### Migration Generation

After modifying `src/db/schema.ts`, generate a new migration:

```bash
pnpm run db:generate
```

This creates SQL migration files in `src/db/migrations/`.
Commit both the schema changes and the generated migration
files.

### How Migrations Are Applied

Migrations run automatically when the extension activates.
The `runMigrations()` function in `src/db/migrate.ts` reads
the bundled `migrations/` folder and applies any pending
migrations.

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

- `e2e-results.txt` — E2E test output

### BuildKit Cache

Both Dockerfiles use BuildKit cache mounts for pnpm
(`--mount=type=cache`). The E2E Dockerfile also caches the
downloaded VS Code binary in `.vscode-test`. These caches
persist across builds on the same machine, speeding up
repeated runs.

### Test Database

Tests use real in-memory SQLite databases via the
`createTestDb()` helper from `src/test/db-setup.ts`. Each
call returns an independent, fully migrated database. No
mocking of the database layer is needed in tests.

## Logging

The extension uses a centralized `LogOutputChannel` for
runtime diagnostics. The output channel is named
**TokenGuard Copilot** and appears in VS Code's Output
panel.

### Viewing Logs

1. Open VS Code's Output panel (View → Output).
2. Select **TokenGuard Copilot** from the channel dropdown.
3. Use the **Log Level** selector in the Output panel
   toolbar to control verbosity (Trace, Debug, Info,
   Warning, Error).

### Architecture

A thin `Logger` interface
(`packages/extension/src/logger/`) wraps VS Code's
`LogOutputChannel`. Services depend on the interface (not
`vscode` directly) so tests can inject a mock logger via
`createMockLogger()` from `src/test/mock-logger.ts`.

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
