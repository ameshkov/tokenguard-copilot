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

```text
oai-copilot/
├── src/                      # TypeScript source files
│   ├── extension.ts          # Extension entry point (activate/deactivate)
│   └── test/
│       └── e2e/              # E2E tests (run inside VS Code)
├── out/                      # Compiled JavaScript output (gitignored)
├── .vscode/                  # Launch configs, tasks, helper scripts
├── .vscode-test.mjs          # E2E test runner configuration
├── vitest.config.mts         # Vitest unit test configuration
├── eslint.config.mjs         # ESLint flat config
├── tsconfig.json             # TypeScript configuration
└── package.json              # Extension manifest and scripts
```

## Build and Test Commands

- `pnpm install` — install dependencies
- `pnpm run compile` — one-time TypeScript build
- `pnpm run watch` — incremental watch mode
- `pnpm run lint` — lint source files with ESLint
- `pnpm run lint:fix` — lint and auto-fix issues
- `pnpm run format:check` — check formatting (Prettier and Markdownlint)
- `pnpm run format:fix` — fix formatting issues
- `pnpm run test` — run all unit tests once
- `pnpm run test:watch` — run unit tests in watch mode
- `pnpm run test:coverage` — run unit tests with coverage report
- `pnpm run test:e2e` — run E2E tests inside VS Code
- `pnpm run package` — package extension into `.vsix`
- `pnpm run clean` — remove compiled output

## Contribution Instructions

You MUST follow the following rules for EVERY task that you perform:

- You MUST verify it with linter, formatter, and TypeScript compiler.

  Use the following commands:
    - `pnpm run compile` to check for TypeScript type errors
    - `pnpm run lint` to run the linter (ESLint)
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

- **Single Responsibility Principle** — every file, class, or function
  has one reason to change.
- **Explicit Exports** — only export symbols that are part of the
  public API.
- **Keep It Boring** — prefer well-understood patterns over clever or
  novel solutions.
- **Extension Lifecycle** — all disposables MUST be pushed to
  `context.subscriptions` in `activate()`. Clean up resources in
  `deactivate()`.
- **VS Code API** — use the VS Code API directly. Do not wrap it in
  unnecessary abstractions unless reuse is needed.

### Code Quality

All code MUST meet documentation and style requirements before merge:

- **Public API documentation**: Exported functions, classes,
  interfaces, and their properties MUST have JSDoc comments describing
  purpose, arguments, return values, and thrown errors.
- **Static analysis gates**: Every change MUST pass TypeScript
  compilation (`pnpm run compile`), ESLint (`pnpm run lint`), and
  Prettier/Markdownlint (`pnpm run format:check`) before merge.
- **Do not modify linter or formatter configurations**: Never change
  ESLint, Prettier, Markdownlint, or TypeScript configuration files
  (`eslint.config.mjs`, `.prettierrc`, `.prettierignore`,
  `.markdownlint-cli2.yaml`, `tsconfig.json`) to work around lint or
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

- **Test location**: E2E tests live in `src/test/e2e/` and use
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
