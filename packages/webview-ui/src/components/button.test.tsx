import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Button } from './button.js';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('renders with primary variant by default', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button.tagName.toLowerCase()).toBe('vscode-button');
    expect(button.hasAttribute('secondary')).toBe(false);
  });

  it('renders with secondary variant', () => {
    render(<Button variant="secondary">Cancel</Button>);

    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button.hasAttribute('secondary')).toBe(true);
  });

  it('passes through disabled attribute', () => {
    render(<Button disabled>Disabled</Button>);

    expect(screen.getByRole('button', { name: 'Disabled' })).toHaveProperty('disabled', true);
  });
});
