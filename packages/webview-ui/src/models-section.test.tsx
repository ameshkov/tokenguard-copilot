import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ModelsSection } from './models-section.js';

afterEach(() => {
  cleanup();
});

describe('ModelsSection', () => {
  it('renders the section header', () => {
    render(<ModelsSection />);
    expect(screen.getByText('Models')).toBeDefined();
  });

  it('renders a disabled Add Model button', () => {
    render(<ModelsSection />);
    const btn = screen.getByRole('button', {
      name: '+ Add Model',
    });
    expect(btn).toHaveProperty('disabled', true);
  });

  it('renders table headers', () => {
    render(<ModelsSection />);
    expect(screen.getByText('Model')).toBeDefined();
    expect(screen.getByText('Provider')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();
  });
});
