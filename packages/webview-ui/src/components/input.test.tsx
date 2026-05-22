import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Input } from './input.js';

afterEach(() => {
  cleanup();
});

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input aria-label="test" />);

    expect(screen.getByRole('textbox', { name: 'test' })).toBeDefined();
  });

  it('shows error message when errorMessage is set', () => {
    render(<Input aria-label="test" errorMessage="Required" />);

    expect(screen.getByText('Required')).toBeDefined();
    const textfield = screen.getByRole('textbox', { name: 'test' }).closest('vscode-textfield');
    expect(textfield?.getAttribute('invalid')).not.toBeNull();
  });

  it('does not show error when errorMessage is empty', () => {
    render(<Input aria-label="test" errorMessage="" />);

    const textfield = screen.getByRole('textbox', { name: 'test' }).closest('vscode-textfield');
    expect(textfield?.getAttribute('invalid')).toBeNull();
  });

  it('passes through disabled attribute', () => {
    render(<Input aria-label="test" disabled />);

    expect(screen.getByRole('textbox', { name: 'test' })).toHaveProperty('disabled', true);
  });
});
