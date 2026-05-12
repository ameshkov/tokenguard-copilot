import type { Database } from './db/connection.js';

/**
 * Dependencies required to create an
 * {@link ExtensionContext}.
 */
export interface ExtensionContextDeps {
  /** Drizzle ORM database instance. */
  db: Database;
}

/**
 * Application context containing all shared services and
 * dependencies.
 *
 * Created once during `activate()` and passed to commands,
 * webview handlers, and other extension components.
 *
 * Future issues will add repositories and services here.
 * The context exposes only services to consumers —
 * repositories and the database are internal wiring details.
 *
 * Currently exposes `db` directly since no repositories
 * exist yet. Once repositories are added (future issues),
 * `db` will become private and only services will be
 * exposed.
 */
export class ExtensionContext {
  /** Drizzle ORM database instance. */
  readonly db: Database;

  /**
   * Creates a new ExtensionContext.
   *
   * @param deps - Infrastructure dependencies.
   */
  constructor(deps: ExtensionContextDeps) {
    this.db = deps.db;
  }
}
