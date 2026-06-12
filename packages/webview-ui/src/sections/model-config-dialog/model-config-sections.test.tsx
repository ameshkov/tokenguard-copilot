import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FetchedModel, ModelInfo } from '@tokenguard/shared';
import {
  ModelConfigBasicFields,
  ModelConfigCapabilitiesSection,
  ModelConfigReasoningSection,
} from './model-config-sections.js';

afterEach(() => {
  cleanup();
});

const prefillHint = () => null;

describe('ModelConfigBasicFields', () => {
  const baseProps = {
    displayName: '',
    maxContextWindowTokens: '',
    maxOutputTokens: '',
    errors: {},
    loading: false,
    prefillHint,
    setDisplayName: vi.fn(),
    setMaxContextWindowTokens: vi.fn(),
    setMaxOutputTokens: vi.fn(),
    clearError: vi.fn(),
  };

  it('renders display name input', () => {
    render(<ModelConfigBasicFields {...baseProps} />);
    expect(screen.getByLabelText('Display Name')).toBeDefined();
  });

  it('renders max context window tokens input', () => {
    render(<ModelConfigBasicFields {...baseProps} />);
    expect(screen.getByLabelText('Max Context Window Tokens')).toBeDefined();
  });

  it('renders max output tokens input', () => {
    render(<ModelConfigBasicFields {...baseProps} />);
    expect(screen.getByLabelText('Max Output Tokens')).toBeDefined();
  });

  it('renders helper text for token fields', () => {
    render(<ModelConfigBasicFields {...baseProps} />);
    expect(screen.getByText(/Maximum number of tokens the model can process/)).toBeDefined();
    expect(screen.getByText(/Maximum number of tokens the model can generate/)).toBeDefined();
  });

  it('shows error message on max context window tokens field', () => {
    render(
      <ModelConfigBasicFields {...baseProps} errors={{ maxContextWindowTokens: 'Required' }} />,
    );
    expect(screen.getByText('Required')).toBeDefined();
  });

  it('shows provider placeholder when providerName and fetchedModel are provided', () => {
    const fetchedModel: FetchedModel = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      maxContextWindowTokens: null,
      maxOutputTokens: null,
      defaultReasoningEffort: null,
      vision: null,
      supportedReasoningEfforts: null,
      inputCostPer1M: null,
      outputCostPer1M: null,
      cachedInputCostPer1M: null,
    };
    render(
      <ModelConfigBasicFields {...baseProps} providerName="openai" fetchedModel={fetchedModel} />,
    );
    const input = screen.getByLabelText('Display Name') as HTMLInputElement;
    expect(input.placeholder).toBe('openai/gpt-4o');
  });

  it('shows placeholder for edit mode', () => {
    const editingModel: ModelInfo = {
      id: 'gpt-4o',
      providerId: 'p1',
      displayName: null,
      maxContextWindowTokens: 128000,
      maxOutputTokens: 16384,
      streaming: true,
      vision: false,
      temperature: null,
      topP: null,
      frequencyPenalty: null,
      presencePenalty: null,
      defaultReasoningEffort: null,
      reasoningEffortMap: null,
      preserveReasoning: false,
      inputCostPer1m: null,
      outputCostPer1m: null,
      cachedInputCostPer1m: null,
      cacheControl: null,
      customFields: null,
    };
    render(
      <ModelConfigBasicFields {...baseProps} providerName="openai" editingModel={editingModel} />,
    );
    const input = screen.getByLabelText('Display Name') as HTMLInputElement;
    expect(input.placeholder).toBe('openai/gpt-4o');
  });

  it('renders prefill hints', () => {
    const hint = (field: string) => (field === 'displayName' ? <small>hint</small> : null);
    render(<ModelConfigBasicFields {...baseProps} prefillHint={hint} />);
    expect(screen.getByText('hint')).toBeDefined();
  });
});

describe('ModelConfigCapabilitiesSection', () => {
  const baseProps = {
    streaming: true,
    vision: false,
    loading: false,
    prefillHint,
    setStreaming: vi.fn(),
    setVision: vi.fn(),
  };

  it('renders Streaming and Vision checkboxes', () => {
    render(<ModelConfigCapabilitiesSection {...baseProps} />);
    expect(screen.getByRole('checkbox', { name: /Streaming/ })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /Vision/ })).toBeDefined();
  });

  it('renders descriptions', () => {
    render(<ModelConfigCapabilitiesSection {...baseProps} />);
    expect(screen.getByText(/Stream responses token-by-token/)).toBeDefined();
    expect(screen.getByText('Allow the model to accept image inputs.')).toBeDefined();
  });

  it('calls setStreaming on toggle', async () => {
    const setStreaming = vi.fn();
    const user = userEvent.setup();
    render(<ModelConfigCapabilitiesSection {...baseProps} setStreaming={setStreaming} />);
    await user.click(screen.getByRole('checkbox', { name: /Streaming/ }));
    expect(setStreaming).toHaveBeenCalled();
  });

  it('calls setVision on toggle', async () => {
    const setVision = vi.fn();
    const user = userEvent.setup();
    render(<ModelConfigCapabilitiesSection {...baseProps} setVision={setVision} />);
    await user.click(screen.getByRole('checkbox', { name: /Vision/ }));
    expect(setVision).toHaveBeenCalled();
  });
});

describe('ModelConfigReasoningSection', () => {
  const baseProps = {
    reasoningEffortMap: {} as Record<string, string>,
    newEffortName: '',
    newEffortParams: '',
    defaultReasoningEffort: '',
    preserveReasoning: false,
    errors: {},
    loading: false,
    prefillHint,
    setReasoningEffortMap: vi.fn(),
    setNewEffortName: vi.fn(),
    setNewEffortParams: vi.fn(),
    setDefaultReasoningEffort: vi.fn(),
    setPreserveReasoning: vi.fn(),
    clearError: vi.fn(),
    addEffort: vi.fn(),
    removeEffort: vi.fn(),
  };

  it('renders effort name and params inputs', () => {
    render(<ModelConfigReasoningSection {...baseProps} />);
    expect(screen.getByPlaceholderText('Effort name')).toBeDefined();
    expect(screen.getByPlaceholderText('Body params JSON (optional)')).toBeDefined();
  });

  it('renders Add button', () => {
    render(<ModelConfigReasoningSection {...baseProps} />);
    const addButtons = screen.getAllByRole('button', { name: /^Add$/ });
    expect(addButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Default Reasoning Effort select', () => {
    const { container } = render(<ModelConfigReasoningSection {...baseProps} />);
    expect(screen.getByText('Default Reasoning Effort')).toBeDefined();
    expect(container.querySelector('#model-default-effort')).toBeDefined();
  });

  it('renders Preserve Reasoning checkbox', () => {
    render(<ModelConfigReasoningSection {...baseProps} />);
    expect(screen.getByRole('checkbox', { name: /Preserve Reasoning/ })).toBeDefined();
  });

  it('renders "None" option when effort map is empty', () => {
    const { container } = render(<ModelConfigReasoningSection {...baseProps} />);
    const select = container.querySelector('vscode-single-select');
    expect(select?.querySelector('vscode-option[value=""]')?.textContent).toBe('None');
  });

  it('renders effort table rows when map has entries', () => {
    const { container } = render(
      <ModelConfigReasoningSection {...baseProps} reasoningEffortMap={{ low: '{}', high: '{}' }} />,
    );
    // Effort names should appear as table cell text — scope to the table
    // body to avoid matching the same text in the select dropdown options.
    const tableBody = container.querySelector('vscode-table-body');
    expect(tableBody).toBeDefined();
    expect(tableBody!.textContent).toContain('low');
    expect(tableBody!.textContent).toContain('high');
  });

  it('renders error for effort map params', () => {
    render(
      <ModelConfigReasoningSection
        {...baseProps}
        reasoningEffortMap={{ low: '{}' }}
        errors={{ effortMap_low: 'Invalid JSON' }}
      />,
    );
    expect(screen.getByText('Invalid JSON')).toBeDefined();
  });

  it('calls addEffort when Add button is clicked', async () => {
    const addEffort = vi.fn();
    const user = userEvent.setup();
    render(<ModelConfigReasoningSection {...baseProps} addEffort={addEffort} />);
    const addBtn = screen.getAllByRole('button', { name: /^Add$/ })[0];
    await user.click(addBtn);
    expect(addEffort).toHaveBeenCalled();
  });
});
