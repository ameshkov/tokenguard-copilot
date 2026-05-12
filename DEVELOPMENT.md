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

### Test Database

Tests use real in-memory SQLite databases via the
`createTestDb()` helper from `src/test/db-setup.ts`. Each
call returns an independent, fully migrated database. No
mocking of the database layer is needed in tests.
