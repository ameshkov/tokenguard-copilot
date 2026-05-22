import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './confirm-dialog.js';

afterEach(() => {
  cleanup();
});

describe('ConfirmDialog', () => {
  it('renders the message', () => {
    render(
      <ConfirmDialog
        message="Are you sure?"
        confirmLabel="Yes"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Are you sure?')).toBeDefined();
  });

  it('calls onConfirm when confirm is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        message="Sure?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message="Sure?"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables confirm and hides cancel when loading', () => {
    render(
      <ConfirmDialog message="Sure?" confirmLabel="Removing…" onConfirm={vi.fn()} loading={true} />,
    );

    expect(screen.getByRole('button', { name: 'Removing…' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
