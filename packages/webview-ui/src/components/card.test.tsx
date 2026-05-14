import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Card } from './card.js';

afterEach(() => {
  cleanup();
});

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <p>Card content</p>
      </Card>,
    );

    expect(screen.getByText('Card content')).toBeDefined();
  });

  it('applies vscode-card class', () => {
    render(<Card data-testid="card">content</Card>);

    expect(screen.getByTestId('card').className).toContain('vscode-card');
  });

  it('merges additional class names', () => {
    render(
      <Card data-testid="card" className="extra">
        content
      </Card>,
    );

    const el = screen.getByTestId('card');
    expect(el.className).toContain('vscode-card');
    expect(el.className).toContain('extra');
  });
});
