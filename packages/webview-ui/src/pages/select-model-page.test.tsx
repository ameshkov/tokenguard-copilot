import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectModelPage } from './select-model-page.js';
import type { FetchedModel } from '@tokenguard/shared';

afterEach(() => {
  cleanup();
});

describe('SelectModelPage', () => {
  const models: FetchedModel[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      maxContextWindowTokens: null,
      maxOutputTokens: null,
      defaultReasoningEffort: null,
      vision: null,
    },
    {
      id: 'gpt-3.5-turbo',
      name: null,
      maxContextWindowTokens: null,
      maxOutputTokens: null,
      defaultReasoningEffort: null,
      vision: null,
    },
  ];

  it('renders heading and subtitle', () => {
    render(
      <SelectModelPage
        loading={false}
        error={null}
        models={models}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Add Model' })).toBeDefined();
    expect(screen.getByText('Select a model to configure.')).toBeDefined();
  });

  it('renders a dropdown with sorted model options', () => {
    const { container } = render(
      <SelectModelPage
        loading={false}
        error={null}
        models={models}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const select = container.querySelector('vscode-single-select');
    expect(select).not.toBeNull();

    const options = container.querySelectorAll('vscode-option');
    expect(options).toHaveLength(2);
    // Sorted alphabetically: gpt-3.5-turbo before GPT-4o
    expect(options[0]!.textContent).toBe('gpt-3.5-turbo');
    expect(options[1]!.textContent).toBe('GPT-4o');
  });

  it('shows loading state with progress ring', () => {
    const { container } = render(
      <SelectModelPage
        loading={true}
        error={null}
        models={[]}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector('vscode-progress-ring')).not.toBeNull();
    expect(screen.getByText('Loading models…')).toBeDefined();
  });

  it('does not show Continue button while loading', () => {
    render(
      <SelectModelPage
        loading={true}
        error={null}
        models={[]}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });

  it('shows error message', () => {
    render(
      <SelectModelPage
        loading={false}
        error="401 Unauthorized"
        models={[]}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('401 Unauthorized')).toBeDefined();
  });

  it('shows empty state', () => {
    render(
      <SelectModelPage
        loading={false}
        error={null}
        models={[]}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('No new models available')).toBeDefined();
  });

  it('selects first model by default on Continue', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectModelPage
        loading={false}
        error={null}
        models={models}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // First alphabetically is gpt-3.5-turbo
    expect(onSelect).toHaveBeenCalledWith(models[1]);
  });

  it('selects chosen model on Continue', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <SelectModelPage
        loading={false}
        error={null}
        models={models}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />,
    );

    const select = container.querySelector('vscode-single-select')!;
    // Simulate selecting the second option (GPT-4o)
    Object.defineProperty(select, 'value', {
      value: 'gpt-4o',
      writable: true,
    });
    fireEvent.change(select);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSelect).toHaveBeenCalledWith(models[0]);
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <SelectModelPage
        loading={false}
        error={null}
        models={models}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
