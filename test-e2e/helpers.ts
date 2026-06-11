/// <reference types="mocha" />

import * as assert from 'node:assert';
import { commands, extensions, type Extension } from 'vscode';

/** The extension identifier used for lookups. */
const EXTENSION_ID = 'adguard.tokenguard-copilot';

/**
 * Gets the extension instance, asserts it exists, and
 * activates it if not already active.
 *
 * @returns The activated extension instance.
 */
export async function getExtension(): Promise<Extension<unknown>> {
  const extension = extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Extension ${EXTENSION_ID} should be available`);

  if (!extension.isActive) {
    await extension.activate();
  }

  return extension;
}

/**
 * Polls a predicate function every 100ms until it returns
 * a truthy value or the timeout is reached.
 *
 * @param predicate - A function that returns a value or a
 *   promise. Polling stops when the result is truthy.
 * @param timeout - Maximum time to wait in milliseconds.
 *   Defaults to 10000.
 * @returns The truthy value returned by the predicate.
 * @throws If the timeout is reached before the predicate
 *   returns a truthy value.
 */
export async function waitForCondition<T>(
  predicate: () => T | Promise<T>,
  timeout = 10000,
): Promise<T> {
  const start = Date.now();
  const pollInterval = 100;

  while (Date.now() - start < timeout) {
    const result = await predicate();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`waitForCondition timed out after ${timeout}ms`);
}

/**
 * Executes a VS Code command by ID and returns the result.
 * Rethrows any error with a descriptive message.
 *
 * @param id - The command identifier to execute.
 * @param args - Optional arguments to pass to the command.
 * @returns The result of the command execution.
 * @throws If the command execution fails.
 */
export async function executeCommand<T = unknown>(
  id: string,
  ...args: unknown[]
): Promise<T | undefined> {
  try {
    return await commands.executeCommand<T>(id, ...args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Command "${id}" failed: ${message}`);
  }
}
