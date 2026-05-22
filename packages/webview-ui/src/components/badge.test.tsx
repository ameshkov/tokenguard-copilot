import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Badge } from './badge.js';

afterEach(() => {
  cleanup();
});

describe('Badge', () => {
  it('renders text content', () => {
    render(<Badge>42</Badge>);

    expect(screen.getByText('42')).toBeDefined();
  });

  it('renders as vscode-badge element', () => {
    render(<Badge>tag</Badge>);

    expect(screen.getByText('tag').tagName.toLowerCase()).toBe('vscode-badge');
  });
});
