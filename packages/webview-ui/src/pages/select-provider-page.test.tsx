import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectProviderPage } from './select-provider-page.js';

afterEach(() => {
  cleanup();
});

describe('SelectProviderPage', () => {
  const providers = [
    { id: 'p1', name: 'OpenRouter', baseUrl: 'https://openrouter.ai' },
    { id: 'p2', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  ];

  it('renders heading and subtitle', () => {
    render(<SelectProviderPage providers={providers} onSelect={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Add Model' })).toBeDefined();
    expect(screen.getByText('Select a provider to fetch available models from.')).toBeDefined();
  });

  it('renders a dropdown with sorted provider options', () => {
    const { container } = render(
      <SelectProviderPage providers={providers} onSelect={vi.fn()} onCancel={vi.fn()} />,
    );

    const select = container.querySelector('vscode-single-select');
    expect(select).not.toBeNull();

    const options = container.querySelectorAll('vscode-option');
    expect(options).toHaveLength(2);
    // Sorted alphabetically: DeepSeek before OpenRouter
    expect(options[0]!.textContent).toBe('DeepSeek');
    expect(options[1]!.textContent).toBe('OpenRouter');
  });

  it('selects first provider by default on Continue', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SelectProviderPage providers={providers} onSelect={onSelect} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // First alphabetically is DeepSeek (p2)
    expect(onSelect).toHaveBeenCalledWith('p2');
  });

  it('selects chosen provider on Continue', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <SelectProviderPage providers={providers} onSelect={onSelect} onCancel={vi.fn()} />,
    );

    const select = container.querySelector('vscode-single-select')!;
    Object.defineProperty(select, 'value', {
      value: 'p1',
      writable: true,
    });
    fireEvent.change(select);

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSelect).toHaveBeenCalledWith('p1');
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<SelectProviderPage providers={providers} onSelect={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
