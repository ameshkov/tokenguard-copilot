# Development

## Prerequisites

- Node.js >= 22
- npm
- VS Code >= 1.116.0

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
