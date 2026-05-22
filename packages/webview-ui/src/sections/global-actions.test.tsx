import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../vscode-api.js', () => ({
  sendRequest: vi.fn(),
}));

import { GlobalActions } from './global-actions.js';
import { sendRequest } from '../vscode-api.js';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GlobalActions', () => {
  it('renders Reset Statistics button as disabled', () => {
    render(<GlobalActions onReset={vi.fn()} />);
    const btn = screen.getByRole('button', {
      name: 'Reset Statistics',
    });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('renders Reset All Settings button', () => {
    render(<GlobalActions onReset={vi.fn()} />);
    expect(
      screen.getByRole('button', {
        name: 'Reset All Settings',
      }),
    ).toBeDefined();
  });

  it('shows confirmation dialog on click', async () => {
    const user = userEvent.setup();
    render(<GlobalActions onReset={vi.fn()} />);

    await user.click(
      screen.getByRole('button', {
        name: 'Reset All Settings',
      }),
    );

    expect(screen.getByText(/permanently delete/)).toBeDefined();
  });

  it('hides confirmation dialog on cancel', async () => {
    const user = userEvent.setup();
    render(<GlobalActions onReset={vi.fn()} />);

    await user.click(
      screen.getByRole('button', {
        name: 'Reset All Settings',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/permanently delete/)).toBeNull();
  });

  it('calls sendRequest on confirm', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    vi.mocked(sendRequest).mockResolvedValue({
      type: 'resetSettingsResult',
      requestId: 'r1',
      success: true,
    });

    render(<GlobalActions onReset={onReset} />);

    await user.click(
      screen.getByRole('button', {
        name: 'Reset All Settings',
      }),
    );

    // After the dialog opens, there are two "Reset All Settings"
    // buttons: the trigger and the confirm. Click the confirm one
    // (inside the dialog).
    const buttons = screen.getAllByRole('button', {
      name: 'Reset All Settings',
    });
    await user.click(buttons[1]);

    expect(sendRequest).toHaveBeenCalledWith({
      type: 'resetSettings',
    });
    expect(onReset).toHaveBeenCalled();
  });
});
