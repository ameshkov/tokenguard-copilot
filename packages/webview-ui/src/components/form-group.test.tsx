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

  it('renders as vscode-form-group element', () => {
    render(<FormGroup data-testid="group">content</FormGroup>);

    expect(screen.getByTestId('group').tagName.toLowerCase()).toBe('vscode-form-group');
  });
});
