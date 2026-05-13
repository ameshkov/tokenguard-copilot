/**
 * Database barrel — re-exports all public database symbols.
 *
 * @internal Exported for module structure only; not yet
 * consumed by other modules. Will be used once upper layers
 * import from the db module barrel.
 */
export * from './schema.js';
export * from './connection.js';
export * from './migrate.js';
