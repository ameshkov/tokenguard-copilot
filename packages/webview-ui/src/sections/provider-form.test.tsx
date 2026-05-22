import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderForm } from './provider-form.js';

afterEach(() => {
  cleanup();
});

describe('ProviderForm', () => {
  it('renders three inputs and a submit button', () => {
    render(<ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={true} />);

    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(screen.getByLabelText('Base URL')).toBeDefined();
    expect(screen.getByLabelText('API Key')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDefined();
  });

  it('shows validation error when submitting with empty name', async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={true} />);

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(screen.getByText('Name is required')).toBeDefined();
  });

  it('clears validation error when user types in the field', async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={true} />);

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));
    expect(screen.getByText('Name is required')).toBeDefined();

    await user.type(screen.getByLabelText('Name'), 'T');
    expect(screen.queryByText('Name is required')).toBeNull();
  });

  it('shows validation error for invalid URL', async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={true} />);

    await user.type(screen.getByLabelText('Name'), 'Test');
    await user.type(screen.getByLabelText('Base URL'), 'not-a-url');
    await user.type(screen.getByLabelText('API Key'), 'sk-key');
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(screen.getByText('Invalid URL')).toBeDefined();
  });

  it('shows validation error for empty API key', async () => {
    const user = userEvent.setup();
    render(<ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={true} />);

    await user.type(screen.getByLabelText('Name'), 'Test');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.example.com');
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(screen.getByText('API key is required')).toBeDefined();
  });

  it('calls onSubmit with values when valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProviderForm onSubmit={onSubmit} loading={false} error={null} visible={true} />);

    await user.type(screen.getByLabelText('Name'), 'OpenAI');
    await user.type(screen.getByLabelText('Base URL'), 'https://api.openai.com');
    await user.type(screen.getByLabelText('API Key'), 'sk-key');
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(onSubmit).toHaveBeenCalledWith('OpenAI', 'https://api.openai.com', 'sk-key');
  });

  it('disables inputs and button when loading is true', () => {
    render(<ProviderForm onSubmit={vi.fn()} loading={true} error={null} visible={true} />);

    expect(screen.getByLabelText('Name')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Base URL')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('API Key')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Adding...' })).toHaveProperty('disabled', true);
  });

  it('shows error message when error prop is set', () => {
    render(
      <ProviderForm onSubmit={vi.fn()} loading={false} error="Connection failed" visible={true} />,
    );

    expect(screen.getByText('Connection failed')).toBeDefined();
  });

  it('clears fields after successful submit', async () => {
    const { rerender } = render(
      <ProviderForm onSubmit={vi.fn()} loading={true} error={null} visible={true} />,
    );

    // Simulate loading finished with no error
    rerender(<ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={true} />);

    expect(screen.getByLabelText('Name')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Base URL')).toHaveProperty('value', '');
    expect(screen.getByLabelText('API Key')).toHaveProperty('value', '');
  });

  it('does not render when visible is false', () => {
    const { container } = render(
      <ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={false} />,
    );
    expect(container.querySelector('form')).toBeNull();
  });

  it('pre-fills fields in edit mode', () => {
    render(
      <ProviderForm
        onSubmit={vi.fn()}
        loading={false}
        error={null}
        visible={true}
        editingProvider={{
          id: 'p1',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com',
        }}
      />,
    );

    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'OpenAI');
    expect(screen.getByLabelText('Base URL')).toHaveProperty('value', 'https://api.openai.com');
  });

  it('shows "Save" button in edit mode', () => {
    render(
      <ProviderForm
        onSubmit={vi.fn()}
        loading={false}
        error={null}
        visible={true}
        editingProvider={{
          id: 'p1',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined();
  });

  it('does not require API key in edit mode', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ProviderForm
        onSubmit={onSubmit}
        loading={false}
        error={null}
        visible={true}
        editingProvider={{
          id: 'p1',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith('OpenAI', 'https://api.openai.com', '');
  });

  it('calls onCancel when Cancel button clicked and confirmed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ProviderForm
        onSubmit={vi.fn()}
        loading={false}
        error={null}
        visible={true}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('Discard changes and go back to settings?')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not call onCancel when cancel confirmation is dismissed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ProviderForm
        onSubmit={vi.fn()}
        loading={false}
        error={null}
        visible={true}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Discard changes and go back to settings?')).toBeDefined();

    // The ConfirmDialog has its own Cancel button
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders page title for add mode', () => {
    render(<ProviderForm onSubmit={vi.fn()} loading={false} error={null} visible={true} />);

    expect(screen.getByRole('heading', { name: 'Add Provider' })).toBeDefined();
    expect(screen.getByText('Configure a new OpenAI-compatible provider.')).toBeDefined();
  });

  it('renders page title for edit mode', () => {
    render(
      <ProviderForm
        onSubmit={vi.fn()}
        loading={false}
        error={null}
        visible={true}
        editingProvider={{
          id: 'p1',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Edit Provider' })).toBeDefined();
    expect(screen.getByText('Update the provider configuration below.')).toBeDefined();
  });
});
