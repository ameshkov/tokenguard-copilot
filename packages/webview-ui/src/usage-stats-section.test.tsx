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
    render(<UsageStatsSection />);
    expect(screen.getByLabelText('Period')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Providers')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Models')).toHaveProperty('disabled', true);
  });

  it('renders placeholder text', () => {
    render(<UsageStatsSection />);
    expect(screen.getByText('No usage data available')).toBeDefined();
  });
});
