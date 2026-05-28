import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChannel = vi.hoisted(() => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => mockChannel),
  },
}));

import * as vscode from 'vscode';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createOutputChannel with correct name and log option', () => {
    createLogger();

    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('TokenGuard Copilot', {
      log: true,
    });
  });

  it('returns a logger with all five severity methods', () => {
    const { logger } = createLogger();

    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('returns the channel as a disposable', () => {
    const { channel } = createLogger();

    expect(typeof channel.dispose).toBe('function');
  });

  it('logger delegates to the output channel', () => {
    const { logger } = createLogger();

    logger.trace('trace msg');
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    expect(mockChannel.trace).toHaveBeenCalledWith('trace msg');
    expect(mockChannel.debug).toHaveBeenCalledWith('debug msg');
    expect(mockChannel.info).toHaveBeenCalledWith('info msg');
    expect(mockChannel.warn).toHaveBeenCalledWith('warn msg');
    expect(mockChannel.error).toHaveBeenCalledWith('error msg');
  });
});
