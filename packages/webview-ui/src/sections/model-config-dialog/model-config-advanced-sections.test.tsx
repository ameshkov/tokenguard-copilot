import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfigCachingSection,
  ModelConfigSamplingSection,
  ModelConfigCostSection,
} from './model-config-advanced-sections.js';

afterEach(() => {
  cleanup();
});

const prefillHint = () => null;

describe('ModelConfigCachingSection', () => {
  const baseProps = {
    cacheControlEnabled: false,
    cacheMaxMarkers: '4',
    cacheTtl: '' as const,
    loading: false,
    prefillHint,
    setCacheControlEnabled: vi.fn(),
    setCacheMaxMarkers: vi.fn(),
    setCacheTtl: vi.fn(),
  };

  it('renders Enable prompt caching checkbox', () => {
    render(<ModelConfigCachingSection {...baseProps} />);
    expect(screen.getByRole('checkbox', { name: /Enable prompt caching/ })).toBeDefined();
  });

  it('renders Max Markers input', () => {
    render(<ModelConfigCachingSection {...baseProps} />);
    expect(screen.getByLabelText('Max Markers')).toBeDefined();
  });

  it('renders TTL select', () => {
    const { container } = render(<ModelConfigCachingSection {...baseProps} />);
    const select = container.querySelector('#cache-ttl');
    expect(select).not.toBeNull();
  });

  it('disables Max Markers when caching is not enabled', () => {
    render(<ModelConfigCachingSection {...baseProps} />);
    expect(screen.getByLabelText('Max Markers')).toHaveProperty('disabled', true);
  });

  it('enables Max Markers when caching is enabled', () => {
    render(<ModelConfigCachingSection {...baseProps} cacheControlEnabled={true} />);
    expect(screen.getByLabelText('Max Markers')).toHaveProperty('disabled', false);
  });

  it('calls setCacheControlEnabled on checkbox toggle', async () => {
    const setCacheControlEnabled = vi.fn();
    const user = userEvent.setup();
    render(
      <ModelConfigCachingSection {...baseProps} setCacheControlEnabled={setCacheControlEnabled} />,
    );
    await user.click(screen.getByRole('checkbox', { name: /Enable prompt caching/ }));
    expect(setCacheControlEnabled).toHaveBeenCalled();
  });
});

describe('ModelConfigSamplingSection', () => {
  const baseProps = {
    temperature: '',
    topP: '',
    frequencyPenalty: '',
    presencePenalty: '',
    errors: {},
    loading: false,
    prefillHint,
    setTemperature: vi.fn(),
    setTopP: vi.fn(),
    setFrequencyPenalty: vi.fn(),
    setPresencePenalty: vi.fn(),
    clearError: vi.fn(),
  };

  it('renders all four sampling parameter inputs', () => {
    render(<ModelConfigSamplingSection {...baseProps} />);
    expect(screen.getByLabelText('Temperature')).toBeDefined();
    expect(screen.getByLabelText('Top P')).toBeDefined();
    expect(screen.getByLabelText('Frequency Penalty')).toBeDefined();
    expect(screen.getByLabelText('Presence Penalty')).toBeDefined();
  });

  it('renders descriptions for sampling parameters', () => {
    render(<ModelConfigSamplingSection {...baseProps} />);
    expect(screen.getByText(/Controls randomness/)).toBeDefined();
    expect(screen.getByText(/Nucleus sampling/)).toBeDefined();
    expect(screen.getByText(/Reduces repetition/)).toBeDefined();
    expect(screen.getByText(/Encourages topic diversity/)).toBeDefined();
  });

  it('shows error message on temperature field', () => {
    render(
      <ModelConfigSamplingSection
        {...baseProps}
        errors={{ temperature: 'Must be between 0 and 2' }}
      />,
    );
    expect(screen.getByText('Must be between 0 and 2')).toBeDefined();
  });
});

describe('ModelConfigCostSection', () => {
  const baseProps = {
    inputCostPer1m: '',
    outputCostPer1m: '',
    cachedInputCostPer1m: '',
    loading: false,
    prefillHint,
    setInputCostPer1m: vi.fn(),
    setOutputCostPer1m: vi.fn(),
    setCachedInputCostPer1m: vi.fn(),
  };

  it('renders all three cost inputs', () => {
    render(<ModelConfigCostSection {...baseProps} />);
    expect(screen.getByLabelText('Input Cost per 1M Tokens (USD)')).toBeDefined();
    expect(screen.getByLabelText('Output Cost per 1M Tokens (USD)')).toBeDefined();
    expect(screen.getByLabelText('Cached Input Cost per 1M Tokens (USD)')).toBeDefined();
  });

  it('renders prefill hints when provided', () => {
    const hint = (field: string) => (field === 'inputCostPer1m' ? <small>prefilled</small> : null);
    render(<ModelConfigCostSection {...baseProps} prefillHint={hint} />);
    expect(screen.getByText('prefilled')).toBeDefined();
  });
});
