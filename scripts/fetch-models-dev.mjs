#!/usr/bin/env node
/**
 * Fetches the models.dev API snapshot bundled with the extension.
 *
 * Run manually to sync `assets/models.dev.json` with the latest
 * models.dev data; `compile` and `test:e2e` use the committed
 * snapshot as-is.
 *
 * The snapshot powers {@link ModelDefaultsService}: model context,
 * output limits, costs, and capabilities are looked up from this file
 * at runtime. Models.dev entries do not guarantee every provider/model
 * combination, so runtime lookups must tolerate missing fields.
 *
 * Behavior:
 * - Writes the snapshot atomically (temp file + rename).
 * - If the fetch fails and a snapshot already exists, keeps the
 *   existing file and warns.
 * - If the fetch fails and no snapshot exists, exits with an error.
 *
 * @example
 * node scripts/fetch-models-dev.mjs
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

/** models.dev public API URL. */
const MODELS_DEV_URL = 'https://models.dev/api.json';

/** Output path for the bundled snapshot. */
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'assets',
  'models.dev.json',
);

/**
 * Checks whether a file exists.
 *
 * @param filePath - Path to check.
 * @returns True when the file exists.
 */
async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Runs the fetch and writes the snapshot. */
async function main() {
  let raw;
  try {
    const response = await fetch(MODELS_DEV_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    raw = await response.text();
  } catch (error) {
    const hadExisting = await exists(OUTPUT_PATH);
    if (!hadExisting) {
      console.error(
        `[fetch:models-dev] Failed to fetch ${MODELS_DEV_URL}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      console.error(`[fetch:models-dev] No existing snapshot at ${OUTPUT_PATH}.`);
      process.exit(1);
    }
    console.warn(
      `[fetch:models-dev] Fetch failed (${
        error instanceof Error ? error.message : String(error)
      }); keeping existing snapshot at ${OUTPUT_PATH}.`,
    );
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    if (await exists(OUTPUT_PATH)) {
      console.warn(
        `[fetch:models-dev] Downloaded data is not valid JSON (${
          error instanceof Error ? error.message : String(error)
        }); keeping existing snapshot.`,
      );
      return;
    }
    console.error(
      `[fetch:models-dev] Downloaded data is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }

  const tempPath = `${OUTPUT_PATH}.tmp-${process.pid}`;
  try {
    // Reformat with Prettier (project config) so the committed
    // snapshot stays consistent with `format:check` (e.g. short
    // arrays collapse).
    const projectRoot = dirname(fileURLToPath(import.meta.url));
    const prettierConfig = await resolveConfig(projectRoot);
    const formatted = await format(JSON.stringify(data), {
      ...prettierConfig,
      parser: 'json',
    });
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(tempPath, formatted, 'utf-8');
    await rename(tempPath, OUTPUT_PATH);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    console.error(
      `[fetch:models-dev] Failed to write snapshot: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }

  const providerCount = Object.keys(data).length;
  const modelCount = Object.values(data).reduce(
    (count, provider) => count + Object.keys(provider.models ?? {}).length,
    0,
  );
  console.log(
    `[fetch:models-dev] Snapshot written to ${OUTPUT_PATH} (${providerCount} providers, ${modelCount} models).`,
  );
}

await main();
