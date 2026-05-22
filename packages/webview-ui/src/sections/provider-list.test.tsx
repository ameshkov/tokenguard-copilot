import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderList } from './provider-list.js';

afterEach(() => {
  cleanup();
});

describe('ProviderList', () => {
  it('renders empty message when no providers', () => {
    render(<ProviderList providers={[]} onEdit={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('No providers configured')).toBeDefined();
  });

  it('renders provider in table rows', () => {
    render(
      <ProviderList
        providers={[
          {
            id: 'p1',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com',
          },
        ]}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('OpenAI')).toBeDefined();
    expect(screen.getByText('https://api.openai.com')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDefined();
  });

  it('calls onEdit with provider when Edit clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <ProviderList
        providers={[
          {
            id: 'p1',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com',
          },
        ]}
        onEdit={onEdit}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith({
      id: 'p1',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com',
    });
  });

  it('shows confirmation dialog when Remove clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ProviderList
        providers={[
          {
            id: 'p1',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com',
          },
        ]}
        onEdit={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Remove provider "OpenAI"? All associated models will be permanently deleted. Usage statistics will be kept.',
      ),
    ).toBeDefined();
  });

  it('calls onRemove after confirming removal', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ProviderList
        providers={[
          {
            id: 'p1',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com',
          },
        ]}
        onEdit={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const confirmBtn = document.querySelector('.confirm-dialog__confirm') as HTMLElement;
    await user.click(confirmBtn);
    expect(onRemove).toHaveBeenCalledWith('p1');
  });

  it('does not call onRemove when cancelling removal', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <ProviderList
        providers={[
          {
            id: 'p1',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com',
          },
        ]}
        onEdit={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        'Remove provider "OpenAI"? All associated models will be permanently deleted. Usage statistics will be kept.',
      ),
    ).toBeNull();
  });
});
