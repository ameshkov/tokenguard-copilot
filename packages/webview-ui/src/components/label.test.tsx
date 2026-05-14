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

  it('applies vscode-label class', () => {
    render(<Label>Field</Label>);

    expect(screen.getByText('Field').className).toContain('vscode-label');
  });

  it('merges additional class names', () => {
    render(<Label className="extra">Field</Label>);

    const label = screen.getByText('Field');
    expect(label.className).toContain('vscode-label');
    expect(label.className).toContain('extra');
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
