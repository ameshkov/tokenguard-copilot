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

  it('applies vscode-badge class', () => {
    render(<Badge>tag</Badge>);

    expect(screen.getByText('tag').className).toContain('vscode-badge');
  });

  it('merges additional class names', () => {
    render(<Badge className="extra">tag</Badge>);

    const el = screen.getByText('tag');
    expect(el.className).toContain('vscode-badge');
    expect(el.className).toContain('extra');
  });
});
