import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Label } from './label.js';

afterEach(() => {
  cleanup();
});

describe('Label', () => {
  it('renders a label with text', () => {
    render(<Label>Field name</Label>);

    expect(screen.getByText('Field name')).toBeDefined();
  });

  it('renders as a vscode-label element', () => {
    const { container } = render(<Label>Field</Label>);

    expect(container.querySelector('vscode-label')).not.toBeNull();
  });

  it('associates with an input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="my-input">Name</Label>
        <input id="my-input" />
      </>,
    );

    expect(screen.getByLabelText('Name')).toBeDefined();
  });
});
