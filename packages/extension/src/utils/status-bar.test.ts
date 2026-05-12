import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const mockItem = {
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    dispose: vi.fn(),
  };

  return {
    window: {
      createStatusBarItem: vi.fn(() => mockItem),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    _mockItem: mockItem,
  };
});

import * as vscode from 'vscode';
import { createStatusBarItem } from './status-bar.js';

const mockVscode = vscode as unknown as {
  _mockItem: {
    text: string;
    tooltip: string;
    command: string;
    show: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
};

describe('createStatusBarItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a status bar item aligned to the right', () => {
    createStatusBarItem();

    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Right,
      100,
    );
  });

  it('should set text with sparkle icon', () => {
    createStatusBarItem();

    expect(mockVscode._mockItem.text).toBe('$(sparkle) TokenGuard Copilot');
  });

  it('should set tooltip', () => {
    createStatusBarItem();

    expect(mockVscode._mockItem.tooltip).toBe('TokenGuard Copilot — click to open settings');
  });

  it('should set command to openSettings', () => {
    createStatusBarItem();

    expect(mockVscode._mockItem.command).toBe('tokenguard-copilot.openSettings');
  });

  it('should call show on the item', () => {
    createStatusBarItem();

    expect(mockVscode._mockItem.show).toHaveBeenCalled();
  });

  it('should return the status bar item', () => {
    const item = createStatusBarItem();

    expect(item).toBe(mockVscode._mockItem);
  });
});
