import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FormGroup } from './form-group.js';

afterEach(() => {
  cleanup();
});

describe('FormGroup', () => {
  it('renders children', () => {
    render(
      <FormGroup>
        <span>child</span>
      </FormGroup>,
    );

    expect(screen.getByText('child')).toBeDefined();
  });

  it('applies vscode-form-group class', () => {
    render(<FormGroup data-testid="group">content</FormGroup>);

    expect(screen.getByTestId('group').className).toContain('vscode-form-group');
  });

  it('merges additional class names', () => {
    render(
      <FormGroup data-testid="group" className="extra">
        content
      </FormGroup>,
    );

    const el = screen.getByTestId('group');
    expect(el.className).toContain('vscode-form-group');
    expect(el.className).toContain('extra');
  });
});
