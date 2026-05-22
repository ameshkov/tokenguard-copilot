import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { UsageStatsSection } from './usage-stats-section.js';

afterEach(() => {
  cleanup();
});

describe('UsageStatsSection', () => {
  it('renders the section header', () => {
    render(<UsageStatsSection />);
    expect(screen.getByText('Usage Stats')).toBeDefined();
  });

  it('renders disabled filter dropdowns', () => {
    const { container } = render(<UsageStatsSection />);
    const selects = container.querySelectorAll('vscode-single-select');
    expect(selects.length).toBe(3);
    for (const select of selects) {
      expect(select.hasAttribute('disabled')).toBe(true);
    }
  });

  it('renders placeholder text', () => {
    render(<UsageStatsSection />);
    expect(screen.getByText('No usage data available')).toBeDefined();
  });
});
