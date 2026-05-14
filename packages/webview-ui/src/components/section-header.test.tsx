import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SectionHeader } from './section-header.js';

afterEach(() => {
  cleanup();
});

describe('SectionHeader', () => {
  it('renders the title text', () => {
    render(<SectionHeader title="Providers" />);
    expect(screen.getByText('Providers')).toBeDefined();
  });

  it('applies default class name', () => {
    const { container } = render(<SectionHeader title="Test" />);
    expect(container.querySelector('.section-header')).not.toBeNull();
  });

  it('merges custom class name', () => {
    const { container } = render(<SectionHeader title="Test" className="extra" />);
    const el = container.firstElementChild!;
    expect(el.className).toBe('section-header extra');
  });
});
