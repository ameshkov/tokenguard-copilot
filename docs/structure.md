# Extension Structure

This document describes the target monorepo structure for the
TokenGuard Copilot VS Code extension: how the code is organized,
how packages communicate, how the project is built, tested, and
packaged.

## Table of Contents

- [Why a Monorepo](#why-a-monorepo)
- [Workspace Layout](#workspace-layout)
- [Packages](#packages)
    - [packages/shared](#packagesshared)
    - [packages/extension](#packagesextension)
    - [packages/webview-ui](#packageswebview-ui)
- [Dependency Graph](#dependency-graph)
- [TypeScript Configuration](#typescript-configuration)
- [Message Passing Protocol](#message-passing-protocol)
- [Build Pipeline](#build-pipeline)
    - [Extension Bundle](#extension-bundle)
    - [Webview Bundle](#webview-bundle)
    - [Database Migrations](#database-migrations)
    - [Build Scripts](#build-scripts)
- [Testing](#testing)
    - [Unit Tests (Vitest)](#unit-tests-vitest)
    - [Webview Component Tests](#webview-component-tests)
    - [E2E Tests](#e2e-tests)
- [Packaging](#packaging)
- [Development Workflow](#development-workflow)

## Why a Monorepo

The extension has two distinct runtime targets that share types:

1. **Extension host** — Node.js code that runs in the VS Code
   extension host process (providers, models, database, chat
   completion handler).
2. **Webview UI** — browser code (React app) that runs inside a
   VS Code webview panel (settings, model configuration, usage
   charts).

A monorepo with pnpm workspaces lets us:

- Share TypeScript types and message definitions between host and
  webview without publishing packages.
- Run separate bundlers for each target (esbuild for Node.js,
  esbuild/Vite for browser) with independent configs.
- Keep each package focused on a single concern with its own
  `tsconfig.json` and test setup.
- Produce a single `.vsix` that bundles everything together.

## Workspace Layout

```text
tokenguard-copilot/
├── pnpm-workspace.yaml             # workspace: ["packages/*"]
├── package.json                     # Extension manifest + root scripts
├── tsconfig.json                    # Base TS config (shared settings)
├── eslint.config.mjs                # Shared ESLint flat config
├── .vscode-test.mjs                 # E2E test runner config
├── .vscodeignore                    # Files excluded from .vsix
│
├── assets/                          # Static assets shipped with extension
│   ├── model-defaults.json          # Bundled model defaults database
│   └── webview/
│       └── settings.html            # Webview HTML shell template
│
├── test-e2e/                        # E2E tests (separate from packages)
│   ├── tsconfig.json
│   ├── fixtures/                    # Test fixtures & data
│   └── extension.test.ts            # Extension activation, commands, etc.
│
├── packages/
│   ├── shared/                      # Shared types & protocol
│   │   ├── package.json             # "@tokenguard/shared"
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts             # Barrel exports
│   │       ├── messages.ts          # Webview ↔ host message types
│   │       ├── models.ts            # Shared domain types
│   │       └── protocol.ts          # Message type guards & helpers
│   │
│   ├── extension/                   # Extension host (VS Code extension)
│   │   ├── package.json             # "@tokenguard/extension"
│   │   ├── tsconfig.json
│   │   ├── vitest.config.mts        # Unit test config
│   │   ├── esbuild.config.mts       # Node.js bundle config
│   │   ├── drizzle.config.ts        # Drizzle Kit config
│   │   └── src/
│   │       ├── extension.ts         # activate() / deactivate()
│   │       ├── context.ts           # ExtensionContext (DI container)
│   │       │
│   │       ├── commands/            # Command handlers
│   │       │   ├── index.ts         # registerCommands()
│   │       │   └── open-settings.ts
│   │       │
│   │       ├── providers/           # VS Code API providers
│   │       │   └── chat-model-provider.ts  # languageModelChatProvider
│   │       │
│   │       ├── ui/                  # UI layer
│   │       │   ├── panels/          # Webview panel providers
│   │       │   │   ├── index.ts     # Barrel exports
│   │       │   │   └── settings-panel.ts
│   │       │   └── status-bar/      # Status bar item
│   │       │       └── index.ts     # Module barrel
│   │       │
│   │       ├── services/            # Business logic layer
│   │       │   └── model-defaults/  # Model defaults lookup
│   │       │       └── index.ts     # Module barrel
│   │       │
│   │       ├── repositories/        # Data access layer
│   │       │   ├── provider-repository.ts
│   │       │   ├── model-repository.ts
│   │       │   └── usage-repository.ts
│   │       │
│   │       ├── db/                  # Database layer
│   │       │   ├── connection.ts    # createDb() factory
│   │       │   ├── schema.ts        # Drizzle ORM table definitions
│   │       │   ├── migrate.ts       # runMigrations()
│   │       │   ├── index.ts         # Barrel exports
│   │       │   └── migrations/      # Generated SQL migrations
│   │       │
│   │       │
│   │       └── test/                # Test helpers (not tests themselves)
│   │           └── db-setup.ts      # createTestDb() helper
│   │
│   └── webview-ui/                  # React webview app
│       ├── package.json             # "@tokenguard/webview-ui"
│       ├── tsconfig.json
│       ├── esbuild.config.mts       # Browser bundle config
│       ├── vitest.config.mts        # Component test config
│       └── src/
│           ├── index.tsx             # React entry point
│           ├── App.tsx               # Root component
│           ├── App.test.tsx          # Tests colocated with source
│           ├── hooks/                # React hooks
│           │   ├── use-vscode-api.ts # acquireVsCodeApi wrapper
│           │   └── use-vscode-api.test.ts
│           └── components/           # UI components
│               ├── providers/        # Provider management
│               │   ├── ProviderForm.tsx
│               │   └── ProviderForm.test.tsx
│               ├── models/           # Model configuration
│               │   ├── ModelDialog.tsx
│               │   └── ModelDialog.test.tsx
│               └── stats/            # Usage stats & charts
│                   ├── UsageChart.tsx
│                   └── UsageChart.test.tsx
│
├── out/                             # Compiled JS (gitignored)
├── dist/                            # Packaged .vsix (gitignored)
└── docs/                            # Documentation
```

## Packages

### packages/shared

> `@tokenguard/shared`

**Purpose**: Type definitions and message protocol shared between
the extension host and the webview UI.

**Contents**:

- `messages.ts` — discriminated union types for all
  `postMessage` communication (host → webview and
  webview → host).
- `models.ts` — shared domain types (provider, model config,
  usage stats, reasoning effort levels, model defaults).
- `protocol.ts` — type guards and helper functions for message
  handling.

**Rules**:

- Zero runtime dependencies. Types only (plus lightweight
  helpers).
- No `vscode` imports — this package is consumed by both
  Node.js and browser targets.
- No side effects. Pure type definitions and utility functions.

### packages/extension

> `@tokenguard/extension`

**Purpose**: The VS Code extension itself — activation,
commands, providers, database, services, and the chat
completion handler.

**Source directory layout**:

| Directory | Responsibility |
| --- | --- |
| `commands/` | VS Code command handlers (one file per command) |
| `providers/` | VS Code API providers (`languageModelChatProvider`) |
| `ui/` | UI layer (webview panels, status bar) |
| `services/` | Business logic (provider mgmt, model registry, usage tracking, chat completion, model defaults) |
| `repositories/` | Data access layer (Drizzle queries, one per table group) |
| `db/` | Database connection, schema, migrations |
| `test/` | Test helpers only (e.g., `db-setup.ts`); actual tests are colocated as `*.test.ts` |

**Layered architecture** (unchanged from AGENTS.md):

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
Database (packages/extension/src/db/)
```

**Rules**:

- Node.js-only code. Uses `vscode` API and `node:sqlite`.
- Depends on `@tokenguard/shared` for message types and domain
  types.
- Bundled with esbuild (`platform: 'node'`,
  `external: ['vscode']`).
- Contains its own `vitest.config.mts`, `esbuild.config.mts`,
  and `drizzle.config.ts`.
- Unit tests are colocated (`foo.test.ts` next to `foo.ts`).

### packages/webview-ui

> `@tokenguard/webview-ui`

**Purpose**: React application for the settings panel webview.

**Contents**:

- Provider management UI (add, edit, remove providers).
- Model configuration dialogs (add, edit models with basic and
  advanced parameters).
- Usage stats display (bar charts, filters, cost breakdown).
- Communication layer that sends/receives typed messages to/from
  the extension host.

**Rules**:

- Browser-only code. No Node.js APIs.
- Depends on `@tokenguard/shared` for message types.
- Bundled separately from the extension host (esbuild with
  `platform: 'browser'`).
- Uses `acquireVsCodeApi()` for VS Code webview communication.
- Unit tests are colocated (`Component.test.tsx` next to
  `Component.tsx`).

## Dependency Graph

```text
packages/shared              ← no dependencies (types only)
     ↑            ↑
     │            │
packages/     packages/
extension     webview-ui
 (Node.js)     (browser)
```

- `packages/shared` has no internal dependencies.
- `packages/extension` depends on `@tokenguard/shared`.
- `packages/webview-ui` depends on `@tokenguard/shared`.
- `extension` and `webview-ui` never import from each other
  — they communicate only via `postMessage`.

## TypeScript Configuration

**Base config** (`tsconfig.json` at root):

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

**Extension host** (`packages/extension/tsconfig.json`):

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/db/migrations"],
  "references": [
    { "path": "../shared" }
  ]
}
```

**Shared** (`packages/shared/tsconfig.json`):

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  },
  "include": ["src"]
}
```

Key points:

- The base `tsconfig.json` holds shared compiler options.
- Each package extends the base and configures its own module
  system and output directory.
- `references` enable TypeScript project references so the
  compiler understands cross-package dependencies.
- The webview uses `"moduleResolution": "bundler"` since esbuild
  resolves its imports.

**Webview UI** (`packages/webview-ui/tsconfig.json`):

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

## Message Passing Protocol

The extension host and webview communicate via `postMessage`.
All messages are defined as discriminated unions in
`packages/shared/src/messages.ts`:

```typescript
// Host → Webview
export type HostMessage =
  | { type: "providers:updated"; providers: Provider[] }
  | { type: "models:updated"; models: Model[] }
  | { type: "stats:updated"; stats: UsageStats }
  | { type: "error"; message: string };

// Webview → Host
export type WebviewMessage =
  | { type: "provider:add"; name: string; baseUrl: string;
      apiKey: string }
  | { type: "provider:edit"; id: string; changes: Partial<…> }
  | { type: "provider:remove"; id: string }
  | { type: "models:fetch"; providerId: string }
  | { type: "model:add"; providerId: string; modelId: string;
      config: ModelConfig }
  | { type: "model:edit"; providerId: string; modelId: string;
      changes: Partial<…> }
  | { type: "model:remove"; providerId: string;
      modelId: string }
  | { type: "stats:reset"; scope: ResetScope }
  | { type: "reset:all" };
```

**Extension host** posts messages to the webview panel:

```typescript
panel.webview.postMessage(msg satisfies HostMessage);
```

**Extension host** receives messages from the webview:

```typescript
panel.webview.onDidReceiveMessage(
  (msg: WebviewMessage) => { … }
);
```

**Webview** sends messages to the host:

```typescript
const vscode = acquireVsCodeApi();
vscode.postMessage(msg satisfies WebviewMessage);
```

**Webview** receives messages from the host:

```typescript
window.addEventListener("message", (event) => {
  const msg = event.data as HostMessage;
  // handle by msg.type
});
```

This pattern gives full type safety on both sides with zero
runtime overhead — the shared types are erased at compile time
and inlined by the bundler.

## Build Pipeline

### Extension Bundle

**Tool**: esbuild
**Config**: `packages/extension/esbuild.config.mts`

```typescript
{
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outdir: "../../out",
  format: "cjs",
  platform: "node",
  target: "es2022",
  external: ["vscode"],
  sourcemap: true,
  minify: isProduction,
}
```

Key points:

- `vscode` is always externalized — it is provided by the
  extension host at runtime.
- `node:sqlite` and other Node.js built-ins are external by
  default when `platform: "node"`.
- `@tokenguard/shared` is inlined (bundled) — no runtime
  workspace dependency.
- `drizzle-orm` is bundled into the output.
- The CJS format is required for VS Code extension `main`.

### Webview Bundle

**Tool**: esbuild
**Config**: `packages/webview-ui/esbuild.config.mts`

```typescript
{
  entryPoints: ["src/index.tsx"],
  bundle: true,
  outdir: "../../out/webview",
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  sourcemap: true,
  minify: isProduction,
}
```

Key points:

- Output goes to the root `out/webview/` directory so the
  extension host can reference it when creating the webview.
- `@tokenguard/shared` is inlined (bundled).
- React and React DOM are bundled into the output.
- IIFE format for direct `<script>` inclusion in the webview
  HTML template.

### Database Migrations

SQL migration files from `packages/extension/src/db/migrations/`
are copied to `out/db/migrations/` during the build step. This is a simple
file copy (not bundled by esbuild) because Drizzle's `migrate()`
reads them from disk at runtime.

### Build Scripts

```jsonc
{
  "scripts": {
    // One-time full build
    "compile": "pnpm run compile:extension && pnpm run compile:webview && pnpm run compile:migrations",
    "compile:extension": "pnpm --filter @tokenguard/extension run build",
    "compile:webview": "pnpm --filter @tokenguard/webview-ui run build",
    "compile:migrations": "cp -r packages/extension/src/db/migrations out/db/migrations",

    // Watch mode (two terminals)
    "watch": "pnpm --filter @tokenguard/extension run watch",
    "watch:webview": "pnpm --filter @tokenguard/webview-ui run watch",

    // Type check only (no emit)
    "typecheck": "pnpm -r run typecheck",

    // Lint & format
    "lint": "eslint",
    "lint:fix": "eslint --fix",
    "format:check": "prettier --check . && markdownlint-cli2 '**/*.md'",
    "format:fix": "prettier --write . && markdownlint-cli2 --fix '**/*.md'",

    // Tests
    "test": "pnpm -r run test",
    "test:extension": "pnpm --filter @tokenguard/extension run test",
    "test:webview": "pnpm --filter @tokenguard/webview-ui run test",
    "test:e2e": "pnpm run compile && vscode-test",

    // Package
    "vscode:prepublish": "pnpm run compile",
    "package": "vsce package --no-dependencies -o dist/"
  }
}
```

## Testing

### Unit Tests (Vitest)

**Scope**: Extension host business logic, repositories, services,
utilities.

**Location**: Colocated with source files — each module has a
corresponding `*.test.ts` file in the same directory (e.g.,
`services/provider-service.test.ts` next to
`services/provider-service.ts`).

**Runner**: Vitest (configured at
`packages/extension/vitest.config.mts`).

**Mocking rules**:

- Mock `vscode` module — unit tests run outside the extension
  host.
- Mock network calls (HTTP requests to provider endpoints).
- Do NOT mock internal modules (repositories, services, etc.)
  unless truly necessary.
- Use real SQLite databases for repository tests (via
  `packages/extension/src/test/db-setup.ts` in-memory
  helper).
- Test helpers live in `src/test/` (e.g., `db-setup.ts`).
  This directory contains only helpers, not test files.

**Config** (`packages/extension/vitest.config.mts`):

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/test/e2e/**"],
  },
});
```

### Webview Component Tests

**Scope**: React components, hooks, and UI logic in the webview.

**Location**: Colocated with source files — each component has
a corresponding `*.test.tsx` file in the same directory (e.g.,
`components/providers/ProviderForm.test.tsx` next to
`ProviderForm.tsx`).

**Runner**: Vitest (configured at
`packages/webview-ui/vitest.config.mts`).

**Environment**: `jsdom` (simulates browser DOM).

**Mocking rules**:

- Mock `acquireVsCodeApi()` — not available outside the webview.
- Mock `postMessage` / `addEventListener("message", …)` to test
  message handling.
- Use `@testing-library/react` for component assertions.

**Config** (`packages/webview-ui/vitest.config.mts`):

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

### E2E Tests

**Scope**: Extension activation, command registration, status bar,
model registration, webview panel creation — anything that
requires a real VS Code instance.

**Location**: `test-e2e/` at the repository root — separate
from the workspace packages because E2E tests depend on the
fully compiled and bundled extension, not on individual
package source.

**Runner**: `@vscode/test-cli` + `@vscode/test-electron` with
Mocha.

**Config** (`.vscode-test.mjs`):

```javascript
import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test-e2e/**/*.test.js",
  mocha: { timeout: 20000 },
});
```

**Rules**:

- The extension MUST be compiled first (`pnpm run compile`).
- No mocking — tests run inside the extension host with full
  VS Code API access.
- Tests verify integration behaviors that cannot be tested with
  unit tests alone.

## Packaging

The extension is packaged into a single `.vsix` file using
`@vscode/vsce`.

**Steps**:

1. `vscode:prepublish` runs the full build (extension host +
   webview + migrations copy).
2. `vsce package --no-dependencies` produces the `.vsix`.
   The `--no-dependencies` flag skips `npm install` during
   packaging because all dependencies are already bundled by
   esbuild.

**`.vscodeignore`** excludes everything except the final output:

```text
**/*
!out/**
!assets/**
!package.json
!README.md
!CHANGELOG.md
!LICENSE
```

The `.vsix` contains:

- `out/extension.js` — bundled extension host (single file).
- `out/webview/` — bundled webview React app.
- `out/db/migrations/` — SQL migration files.
- `assets/` — static assets (model defaults JSON, webview HTML
  template).
- `package.json` — extension manifest.
- `README.md`, `CHANGELOG.md` — documentation.

**What is NOT in the `.vsix`**:

- `node_modules/` — all deps are bundled.
- `packages/` — source code; bundled into `out/`.
- `src/` — TypeScript source; compiled into `out/`.
- Test files, configs, docs (other than README/CHANGELOG).

## Development Workflow

**First-time setup**:

```sh
pnpm install
```

**Day-to-day development** (two watch terminals):

```sh
# Terminal 1: watch extension host
pnpm run watch

# Terminal 2: watch webview
pnpm run watch:webview
```

Then press F5 in VS Code to launch the Extension Development Host.

**Before committing**:

```sh
pnpm run typecheck       # TypeScript type errors
pnpm run lint            # ESLint
pnpm run format:check    # Prettier + Markdownlint
pnpm run test            # Unit tests (all packages)
pnpm run test:extension   # Unit tests (extension host only)
pnpm run test:webview    # Unit tests (webview only)
```

**Running E2E tests**:

```sh
pnpm run test:e2e        # compiles first, then runs in VS Code
```

**Adding a database migration**:

```sh
# 1. Edit packages/extension/src/db/schema.ts
# 2. Generate migration
pnpm run db:generate
# 3. Commit both schema change and generated migration
```

**Packaging for distribution**:

```sh
pnpm run package         # produces dist/*.vsix
```
