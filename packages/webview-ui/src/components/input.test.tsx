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
    const input = screen.getByRole('textbox', { name: 'test' });
    expect(input.className).toContain('vscode-input--error');
  });

  it('does not show error when errorMessage is empty', () => {
    render(<Input aria-label="test" errorMessage="" />);

    const input = screen.getByRole('textbox', { name: 'test' });
    expect(input.className).not.toContain('vscode-input--error');
  });

  it('merges additional class names', () => {
    render(<Input aria-label="test" className="extra" />);

    const input = screen.getByRole('textbox', { name: 'test' });
    expect(input.className).toContain('extra');
    expect(input.className).toContain('vscode-input');
  });

  it('passes through disabled attribute', () => {
    render(<Input aria-label="test" disabled />);

    expect(screen.getByRole('textbox', { name: 'test' })).toHaveProperty('disabled', true);
  });
});
