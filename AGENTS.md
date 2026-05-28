# AGENTS.md

VS Code extension that provides third-party OpenAI-compatible language
models to VS Code Copilot Chat via the `languageModelChatProvider` API.
Registers as a chat model provider so any OpenAI-compatible endpoint can
be used as a backend for Copilot Chat.

## Table of Contents

- [Project Overview](#project-overview)
- [Technical Context](#technical-context)
- [Project Structure](#project-structure)
- [Build and Test Commands](#build-and-test-commands)
- [Contribution Instructions](#contribution-instructions)
- [Code Guidelines](#code-guidelines)
    - [Architecture](#architecture)
    - [Code Quality](#code-quality)
    - [Testing](#testing)
    - [Dependency Management](#dependency-management)
    - [Configuration & Documentation](#configuration--documentation)
    - [Markdown Formatting](#markdown-formatting)

## Project Overview

A VS Code extension that bridges third-party OpenAI-compatible language
model endpoints into VS Code Copilot Chat. It uses the proposed
`languageModelChatProvider` API to register external models so they
appear alongside built-in Copilot models.

What you get out of the box:

- **Chat model provider** — registers OpenAI-compatible models as
  VS Code language model chat providers.
- **Copilot Chat integration** — models appear in the Copilot Chat
  model picker and can be used by any chat participant.
- **Code quality** — ESLint (flat config), Prettier, Markdownlint,
  Husky pre-commit hooks.

## Technical Context

| Field | Value |
| --- | --- |
| Language | TypeScript 5.9, ES2022 target, strict mode |
| Runtime | VS Code Extension Host (Node.js) |
| Package Manager | pnpm |
| VS Code API | `^1.116.0` (proposed `chatProvider` API) |
| Linting | ESLint 9.x + typescript-eslint |
| Formatting | Prettier 3.x, Markdownlint (markdownlint-cli2) |
| Testing | Vitest 4.x (unit), @vscode/test-cli (E2E) |
| Project Type | VS Code extension |

## Project Structure

The extension has two distinct runtime targets that share types:

1. **Extension host** — Node.js code running in the VS Code
   extension host (providers, models, database, chat completion).
2. **Webview UI** — browser code (React) running inside a VS Code
   webview panel (settings, model configuration).

A pnpm monorepo lets us share TypeScript types between host and
webview, run separate bundlers per target, and produce a single
`.vsix`. The root `package.json` doubles as the VS Code extension
manifest (`main`, `contributes`, `publisher`).

### Packages

- **`packages/shared`** (`@tokenguard/shared`) — shared
  TypeScript types and message protocol definitions used by both
  the extension host and the webview.
- **`packages/extension`** (`@tokenguard/extension`) — extension
  host code: activation, providers, services, database layer.
  Bundled with esbuild into `out/extension.js` (CJS, Node.js).
- **`packages/webview-ui`** (`@tokenguard/webview-ui`) — React
  settings UI. Bundled with esbuild into `out/webview/` (IIFE,
  browser).
- **`packages/webview-playground`**
  (`@tokenguard/webview-playground`) — Vite dev server with
  `@vscode-elements/webview-playground` toolbar and mock
  VS Code API for developing the settings page in a browser.

### Directory Layout

```text
tokenguard-copilot/
├── pnpm-workspace.yaml          # Workspace: packages/*
├── package.json                 # Extension manifest + root scripts
├── tsconfig.json                # Base TS config (shared settings)
├── eslint.config.mjs            # ESLint flat config
├── knip.config.ts               # Knip unused-export config
├── .vscode-test.mjs             # E2E test runner config
├── assets/                      # Static assets shipped with extension
│   ├── model-defaults.json      # Bundled model defaults database
│   └── webview/
│       └── settings.html        # Webview HTML shell template
├── test-e2e/                    # E2E tests (separate from packages)
│   ├── tsconfig.json
│   └── extension.test.ts        # Extension activation, commands
├── packages/
│   ├── shared/                  # Shared types & protocol
│   │   ├── package.json         # @tokenguard/shared
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts         # Barrel exports
│   │       └── messages.ts      # Host ↔ webview message protocol
│   ├── extension/               # Extension host (VS Code extension)
│   │   ├── package.json         # @tokenguard/extension
│   │   ├── tsconfig.json
│   │   ├── vitest.config.mts    # Unit test config
│   │   ├── esbuild.config.mts   # Node.js bundle config
│   │   ├── drizzle.config.ts    # Drizzle Kit config
│   │   └── src/
│   │       ├── extension.ts     # activate() / deactivate()
│   │       ├── context.ts       # ExtensionContext (DI container)
│   │       ├── commands/        # Command handlers
│   │       │   └── index.ts     # Barrel — all commands
│   │       ├── providers/       # VS Code API providers
│   │       │   ├── index.ts     # Barrel — re-exports subdirectories
│   │       │   └── chat-model-provider/
│   │       │       ├── index.ts               # Barrel
│   │       │       ├── chat-model-provider.ts  # LM chat provider registration
│   │       │       └── chat-model-provider.test.ts
│   │       ├── repositories/    # Data access layer
│   │       │   ├── index.ts     # Barrel exports
│   │       │   └── provider-repository.ts
│   │       ├── ui/              # UI layer
│   │       │   ├── panels/      # Webview panel providers
│   │       │   │   ├── index.ts # Barrel exports
│   │       │   │   └── settings-panel.ts
│   │       │   ├── tree-views/  # Tree data providers
│   │       │   │   ├── index.ts # Barrel exports
│   │       │   │   └── chat-debug-tree-view.ts
│   │       │   └── status-bar/  # Status bar item
│   │       │       └── index.ts # Module barrel
│   │       ├── services/        # Business logic layer
│   │       │   ├── chat-handler/  # Chat completion handler
│   │       │   │   └── index.ts # Module barrel
│   │       │   ├── model-defaults/ # Model defaults lookup
│   │       │   │   └── index.ts # Module barrel
│   │       │   └── provider-manager/ # Provider CRUD
│   │       │       ├── index.ts # Module barrel
│   │       │       └── provider-manager.ts
│   │       ├── db/              # Database layer (SQLite + Drizzle)
│   │       │   ├── connection.ts # createDb() factory + Database type
│   │       │   ├── index.ts     # Barrel exports
│   │       │   ├── migrate.ts   # runMigrations() function
│   │       │   ├── schema.ts    # Drizzle ORM table definitions
│   │       │   └── migrations/  # Generated SQL migrations
│   │       └── test/            # Test helpers (not tests)
│   │           └── db-setup.ts  # createTestDb() helper
│   ├── webview-ui/              # React webview app
│   │   ├── package.json         # @tokenguard/webview-ui
│   │   ├── tsconfig.json
│   │   ├── vitest.config.mts    # Component test config
│   │   ├── esbuild.config.mts   # Browser bundle config
│   │   └── src/
│   │       ├── index.tsx        # Entry: side-effect imports, re-exports
│   │       ├── settings-app.tsx # Root SettingsApp component + router
│   │       ├── settings.css     # Global styles
│   │       ├── vscode-api.ts    # postMessage bridge
│   │       ├── vscode-elements.d.ts # JSX types for web components
│   │       ├── components/      # Reusable UI primitives
│   │       │   └── index.ts     # Barrel exports
│   │       ├── pages/           # Full-page views (routed by Page union)
│   │       │   └── index.ts     # Barrel exports
│   │       ├── sections/        # Settings page sections
│   │       │   └── index.ts     # Barrel exports
│   │       └── test/            # Test helpers (not tests)
│   └── webview-playground/      # Vite dev server + mocks
│       ├── package.json         # @tokenguard/webview-playground
│       ├── tsconfig.json
│       ├── vite.config.mts      # Vite dev server config
│       ├── index.html           # Vite HTML entry
│       └── src/
│           ├── main.tsx         # Dev entry (playground toolbar)
│           ├── mock-vscode-api.ts # Mock acquireVsCodeApi()
│           └── fixtures.ts      # Sample data for mock API
├── out/                         # Compiled output (gitignored)
├── .vscode/                     # Launch configs, tasks, helper scripts
└── docs/                        # Documentation
```

## Build and Test Commands

- `pnpm install` — install dependencies
- `pnpm run compile` — full build (extension + webview +
  migrations + E2E)
- `pnpm run typecheck` — type-check all packages (no emit)
- `pnpm run watch` — watch extension host (esbuild)
- `pnpm run watch:webview` — watch webview (esbuild)
- `pnpm run dev:webview` — start Vite dev server for webview
  playground
- `pnpm run lint` — lint source files (ESLint + Knip)
- `pnpm run lint:fix` — lint and auto-fix issues (ESLint)
- `pnpm run format:check` — check formatting (Prettier and
  Markdownlint)
- `pnpm run format:fix` — fix formatting issues
- `pnpm run test` — run all unit tests once
- `pnpm run test:extension` — run extension unit tests only
- `pnpm run test:webview` — run webview unit tests only
- `pnpm run test:e2e` — run E2E tests inside VS Code
- `pnpm run package` — package extension into `.vsix`
- `pnpm run clean` — remove compiled output

## Contribution Instructions

You MUST follow the following rules for EVERY task that you perform:

- You MUST verify it with linter, formatter, and TypeScript compiler.

  Use the following commands:
    - `pnpm run typecheck` to check for TypeScript type errors
    - `pnpm run lint` to run the linter (ESLint + Knip)
    - `pnpm run lint:fix` to fix linting issues automatically
    - `pnpm run format:check` to check formatting (Prettier and
      Markdownlint)
    - `pnpm run format:fix` to fix formatting issues

- You MUST update the unit tests for changed code.

- You MUST run tests with `pnpm run test` to verify that your
  changes do not break existing functionality.

- When making changes to the project structure, ensure the Project
  Structure section in `AGENTS.md` is updated and remains valid.

- If the prompt essentially asks you to refactor or improve existing
  code, check if you can phrase it as a code guideline. If it's
  possible, add it to the relevant Code Guidelines section in
  `AGENTS.md`.

- After completing the task you MUST verify that the code you've
  written follows the Code Guidelines in this file.

## Code Guidelines

### Architecture

- **Separation of Concerns** — each module handles one aspect of the
  system (e.g. routing, business logic, data access).
- **Single Responsibility Principle** — every file, class, or function
  has one reason to change.
- **Dependency Direction** — dependencies point inward / downward; never
  from lower layers to higher ones.
- **Explicit Boundaries** — module interfaces are intentional; external
  code imports MUST be from barrel `index.js` files only.
- **Explicit Exports** — only export symbols that are part of the
  public API.
- **Minimize Coupling, Maximize Cohesion** — modules are self-contained
  and interact through narrow interfaces.
- **Make Invalid States Impossible** — use types and validation to prevent
  illegal combinations at compile time (shared types in
  `@tokenguard/shared`).
- **Keep It Boring** — prefer well-understood patterns over clever or
  novel solutions.
- **Extension Lifecycle** — all disposables MUST be pushed to
  `context.subscriptions` in `activate()`. Clean up resources in
  `deactivate()`.
- **VS Code API** — use the VS Code API directly. Do not wrap it in
  unnecessary abstractions unless reuse is needed.
- **Dependency Flow** — the extension follows a layered architecture
  with manual constructor injection:

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

  Rules:
    - `ExtensionContext` wires repositories and services. It
      exposes only services — repositories and the database
      connection are internal wiring details.
    - Services receive repositories via constructor. No raw
      database calls in services.
    - Repositories receive the Drizzle `Database` instance via
      constructor. They encapsulate all SQL queries. No caching
      or business logic in repositories.
    - No upward dependencies — lower layers never import from
      upper layers.
    - Services never import from Providers or Commands.
    - Providers and Commands never import from each other.
    - Providers follow the same pattern as Commands: they sit
      at the top layer, receive service instances from
      `ExtensionContext`, and register VS Code APIs.
    - `activate()` creates the database connection, runs
      migrations, builds the `ExtensionContext`, and passes it
      to commands and handlers.
    - `deactivate()` closes the database connection.

### Code Quality

All code MUST meet documentation and style requirements before merge:

- **Public API documentation**: Exported functions, classes,
  interfaces, and their properties MUST have JSDoc comments
  describing purpose, arguments, return values, and thrown
  errors (use `@throws` only for specific errors).
- **Static analysis gates**: Every change MUST pass TypeScript
  type checking (`pnpm run typecheck`), ESLint + Knip
  (`pnpm run lint`), and Prettier/Markdownlint
  (`pnpm run format:check`) before merge.
- **Knip unused-export analysis**: The project uses Knip
  (`knip.config.ts`) to detect unused exports. All Knip
  findings MUST be resolved — either remove the unused export
  or, when the export is genuinely needed but not reachable
  through the public dependency graph, mark it with the JSDoc
  `@internal` tag. The `@internal` tag is allowed **only**
  when a symbol is exported solely for test files and is
  intentionally **not** re-exported from the module barrel.
  Every `@internal` tag MUST include a short explanation of
  why the export is excluded (e.g., "Exported for tests only;
  not part of the public module API"). Do NOT use `@internal`
  to silence legitimate unused-export warnings — remove the
  export instead.
- **Do not modify linter or formatter configurations**: Never
  change ESLint, Prettier, Markdownlint, Knip, or TypeScript
  configuration files (`eslint.config.mjs`, `.prettierrc`,
  `.prettierignore`, `.markdownlint-cli2.yaml`,
  `knip.config.ts`, `tsconfig.json`) to work around lint or
  formatting errors. Fix the source code instead. If the issue cannot
  be resolved after a few attempts, ask the human for help.
- **File naming**: Use kebab-case for all file names. TypeScript source
  files MUST use lower-case kebab-case (e.g., `model-provider.ts`).
  Do NOT use PascalCase or camelCase file names.

### Testing

Every exported function and class MUST have unit test coverage:

- **Test file placement**: Every source file with exported logic
  MUST have a corresponding `.test.ts` file in the same directory.
  Every exported function MUST have at least one test case.
- **Test runner**: Use Vitest for all unit tests. Run with
  `pnpm run test`.
- **Mock VS Code API**: Since unit tests run outside the extension
  host, mock `vscode` module imports as needed.
- **Mock only external dependencies**: The only things that should
  be mocked are true external dependencies — the `vscode` module
  and services that make network calls outside the system (e.g.,
  third-party APIs). Do NOT mock internal modules unless necessary.
- **Test verification mandatory**: All changes MUST pass
  `pnpm run test` before merge. Tests MUST NOT be deleted or
  weakened without explicit justification.

#### E2E Testing

E2E tests run inside a real VS Code instance using
`@vscode/test-cli` and `@vscode/test-electron`:

- **Test location**: E2E tests live in `test-e2e/` and use
  Mocha as the test runner (required by `@vscode/test-cli`).
- **Configuration**: The test runner is configured via
  `.vscode-test.mjs` in the project root.
- **Run E2E tests**: Use `pnpm run test:e2e`. The extension MUST
  be compiled first (`pnpm run compile`).
- **No mocking**: E2E tests run inside the extension host with
  full access to the VS Code API. Do NOT mock `vscode` in E2E
  tests.
- **Test scope**: E2E tests verify extension activation, command
  registration, and integration with VS Code APIs.

### Dependency Management

- **Pin all dependency versions explicitly**: Do not use `^` or `~` in
  `package.json`.

External dependencies MUST be carefully evaluated before adoption:

- **Prefer vanilla solutions**: Use Node.js built-in APIs, VS Code API,
  and standard language features when they adequately solve the problem.
  Only add a dependency when it provides significant value over a
  vanilla implementation.
- **Reputable sources only**: Dependencies MUST come from
  well-established, actively maintained projects.
- **Minimize dependency count**: Each new dependency increases attack
  surface, bundle size, and maintenance burden. Justify every addition.
- **Use the latest stable version**: When adding a new dependency,
  explicitly check the package registry for the latest stable release
  and use it.

### Configuration & Documentation

Configuration and documentation MUST stay synchronized with code:

- **Documentation updates required**: Changes to build process or
  configuration MUST update `DEVELOPMENT.md`.
- **Structure tracking**: Changes to project structure MUST update the
  Project Structure section in `AGENTS.md`.

### Webview Theming

The webview uses the
[VSCode Elements](https://vscode-elements.github.io/) web
component library (`@vscode-elements/elements`) for UI
primitives. These components automatically adapt to the
active VS Code color theme — **never hard-code color
values or re-implement component styles in CSS.**

- **Prefer web components**: Use `<vscode-button>`,
  `<vscode-badge>`, `<vscode-table>`, `<vscode-form-group>`,
  `<vscode-checkbox>`, `<vscode-collapsible>`,
  `<vscode-divider>`, `<vscode-single-select>`, and other
  VSCode Elements tags instead of native HTML elements with
  custom CSS.
- **Component registration**: All web component side-effect
  imports live in `packages/webview-ui/src/index.tsx`. Do
  NOT import them from individual component files.
- **Type declarations**: JSX types for web component tags
  are declared in
  `packages/webview-ui/src/vscode-elements.d.ts`. Update
  this file when adding new VSCode Elements tags.
- **CSS custom properties**: For any remaining custom CSS,
  use `var(--vscode-<section>-<property>)` tokens. The
  variable name is derived from the theme color ID by
  replacing dots with dashes and prefixing with `--vscode-`.
  Always provide a fallback when the token may be absent,
  e.g. `var(--vscode-input-border, transparent)`.
- **Reference**: https://code.visualstudio.com/api/references/theme-color
- **Test mocks**: In the jsdom test environment, lightweight
  mock custom elements are registered via
  `packages/webview-ui/src/test/element-mocks.ts` (called
  from `test/setup.ts`). Update mocks when adding new web
  component tags that need roles or form behaviour in
  tests.

### Markdown Formatting

All Markdown files MUST follow these formatting rules:

- **Line length**: Keep lines at most 80 characters. This is not a
  hard lint gate, but SHOULD be followed for readability. Lines inside
  fenced code blocks are exempt from this limit.
- **Unordered lists**: Use dashes (`-`) for bullet points. Indent
  nested list items by 4 spaces.
- **Emphasis**: Use asterisks (`*`) for emphasis (`*italic*`,
  `**bold**`). Do NOT use underscores.
- **Trailing spaces**: Do NOT leave trailing whitespace on any line.
  Do NOT use two-space line breaks — use a blank line instead.
- **Bare URLs**: Bare URLs are permitted and do not need to be wrapped
  in angle brackets.
- **Table formatting**: Align table columns with padding when the
  table fits within 80 characters. If the table exceeds 80 characters,
  switch to a compact format using single spaces only.
