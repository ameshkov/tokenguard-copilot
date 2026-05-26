import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelConfigDialog } from './model-config-dialog.js';
import type { FetchedModel, ModelDefaultsResult, ModelInfo } from '@tokenguard/shared';

afterEach(() => {
  cleanup();
});

describe('ModelConfigDialog', () => {
  const baseProps = {
    loading: false,
    error: null,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders basic fields', () => {
    render(<ModelConfigDialog {...baseProps} />);

    expect(screen.getByLabelText('Display Name')).toBeDefined();
    expect(screen.getByLabelText('Max Context Window Tokens')).toBeDefined();
    expect(screen.getByLabelText('Max Output Tokens')).toBeDefined();
  });

  it('renders advanced sections inside a collapsible', () => {
    const { container } = render(<ModelConfigDialog {...baseProps} />);

    const collapsible = container.querySelector('vscode-collapsible');
    expect(collapsible).not.toBeNull();
    expect(collapsible?.getAttribute('title')).toBe('Advanced Settings');
  });

  it('renders advanced section headings', () => {
    render(<ModelConfigDialog {...baseProps} />);

    expect(screen.getByText('Capabilities')).toBeDefined();
    expect(screen.getByText('Reasoning')).toBeDefined();
    expect(screen.getByText('Sampling')).toBeDefined();
    expect(screen.getByText('Cost')).toBeDefined();
  });

  it('renders descriptions for capability checkboxes', () => {
    render(<ModelConfigDialog {...baseProps} />);

    expect(screen.getByText(/Stream responses token-by-token/)).toBeDefined();
    expect(screen.getByText('Allow the model to accept image inputs.')).toBeDefined();
  });

  it('renders description for preserve reasoning checkbox', () => {
    render(<ModelConfigDialog {...baseProps} />);

    expect(screen.getByText(/Pass reasoning tokens from previous turns/)).toBeDefined();
  });

  it('renders help text for token fields', () => {
    render(<ModelConfigDialog {...baseProps} />);

    expect(screen.getByText(/Maximum number of tokens the model can process/)).toBeDefined();
    expect(screen.getByText(/Maximum number of tokens the model can generate/)).toBeDefined();
  });

  it('renders descriptions for sampling parameters', () => {
    render(<ModelConfigDialog {...baseProps} />);

    expect(screen.getByText(/Controls randomness/)).toBeDefined();
    expect(screen.getByText(/Nucleus sampling/)).toBeDefined();
    expect(screen.getByText(/Reduces repetition/)).toBeDefined();
    expect(screen.getByText(/Encourages topic diversity/)).toBeDefined();
  });

  it('validates required max context window tokens', async () => {
    const user = userEvent.setup();
    render(<ModelConfigDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Add Model' }));

    expect(screen.getAllByText('Must be a positive number').length).toBeGreaterThanOrEqual(1);
  });

  it('validates max output tokens cannot exceed context window', async () => {
    const user = userEvent.setup();
    render(<ModelConfigDialog {...baseProps} />);

    await user.type(screen.getByLabelText('Max Context Window Tokens'), '1000');
    await user.type(screen.getByLabelText('Max Output Tokens'), '2000');
    await user.click(screen.getByRole('button', { name: 'Add Model' }));

    expect(screen.getByText('Cannot exceed max context window tokens')).toBeDefined();
  });

  it('clears validation error when user types in the field', async () => {
    const user = userEvent.setup();
    render(<ModelConfigDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Add Model' }));
    expect(screen.getAllByText('Must be a positive number').length).toBeGreaterThanOrEqual(1);

    await user.type(screen.getByLabelText('Max Context Window Tokens'), '128000');
    await user.type(screen.getByLabelText('Max Output Tokens'), '16384');

    expect(screen.queryByText('Must be a positive number')).toBeNull();
  });

  it('validates temperature range', async () => {
    const user = userEvent.setup();
    render(<ModelConfigDialog {...baseProps} />);

    await user.type(screen.getByLabelText('Max Context Window Tokens'), '128000');
    await user.type(screen.getByLabelText('Max Output Tokens'), '16384');
    await user.type(screen.getByLabelText('Temperature'), '3');
    await user.click(screen.getByRole('button', { name: 'Add Model' }));

    expect(screen.getByText('Must be between 0 and 2')).toBeDefined();
  });

  it('shows per-field provider hints when pre-filled from provider', () => {
    const fetchedModel: FetchedModel = {
      id: 'gpt-4o',
      name: 'GPT-4o',
      maxContextWindowTokens: 128000,
      maxOutputTokens: 16384,
      defaultReasoningEffort: null,
      vision: null,
    };

    render(<ModelConfigDialog {...baseProps} fetchedModel={fetchedModel} />);

    const hints = screen.getAllByText('Pre-filled from provider');
    // displayName, maxContextWindowTokens, maxOutputTokens
    expect(hints.length).toBe(3);
  });

  it('shows per-field defaults hints when pre-filled from defaults', () => {
    const defaults: ModelDefaultsResult = {
      contextSize: 128000,
      maxTokens: 16384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10,
      supportedCapabilities: [],
    };

    render(<ModelConfigDialog {...baseProps} defaults={defaults} />);

    const hints = screen.getAllByText('Pre-filled from known defaults for this model');
    // maxContextWindowTokens, maxOutputTokens, inputCostPer1m, outputCostPer1m
    expect(hints.length).toBe(4);
  });

  it('does not show prefill hints in edit mode', () => {
    const editingModel: ModelInfo = {
      id: 'gpt-4o',
      providerId: 'p1',
      displayName: 'My GPT-4o',
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
    };

    render(<ModelConfigDialog {...baseProps} editingModel={editingModel} />);

    expect(screen.queryByText('Pre-filled from provider')).toBeNull();
    expect(screen.queryByText('Pre-filled from known defaults for this model')).toBeNull();
  });

  it('pre-fills values in edit mode', () => {
    const editingModel: ModelInfo = {
      id: 'gpt-4o',
      providerId: 'p1',
      displayName: 'My GPT-4o',
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
    };

    render(<ModelConfigDialog {...baseProps} editingModel={editingModel} />);

    expect(screen.getByLabelText('Display Name')).toHaveProperty('value', 'My GPT-4o');
    expect(screen.getByLabelText('Max Context Window Tokens')).toHaveProperty('value', '128000');
    expect(screen.getByLabelText('Max Output Tokens')).toHaveProperty('value', '16384');
  });

  it('calls onSubmit with correct ModelConfig on valid submit', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<ModelConfigDialog {...baseProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Display Name'), 'Test Model');
    await user.type(screen.getByLabelText('Max Context Window Tokens'), '128000');
    await user.type(screen.getByLabelText('Max Output Tokens'), '16384');
    await user.click(screen.getByRole('button', { name: 'Add Model' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Test Model',
        maxContextWindowTokens: 128000,
        maxOutputTokens: 16384,
        streaming: true,
        vision: false,
      }),
    );
  });

  it('calls onCancel when cancel is clicked and confirmed', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(<ModelConfigDialog {...baseProps} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('Discard changes and go back to settings?')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not call onCancel when cancel confirmation is dismissed', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(<ModelConfigDialog {...baseProps} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Discard changes and go back to settings?')).toBeDefined();

    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows Save Changes button in edit mode', () => {
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
    };

    render(<ModelConfigDialog {...baseProps} editingModel={editingModel} />);

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDefined();
  });

  it('displays error message when error prop is set', () => {
    render(<ModelConfigDialog {...baseProps} error="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('shows "None" option in default effort dropdown when no reasoningEffortMap', async () => {
    const defaults: ModelDefaultsResult = {
      contextSize: 128000,
      maxTokens: 16384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10,
      supportedCapabilities: ['reasoning_effort'],
      defaultReasoningEffort: 'medium',
    };

    render(<ModelConfigDialog {...baseProps} defaults={defaults} />);

    // The "None" option (value="") should be present when the map is empty
    const select = document.querySelector('vscode-single-select');
    expect(select).not.toBeNull();
    expect(select!.querySelector('vscode-option[value=""]')?.textContent).toBe('None');
  });

  it('hides "None" option in default effort dropdown when reasoningEffortMap is present', () => {
    const defaults: ModelDefaultsResult = {
      contextSize: 1050000,
      maxTokens: 32768,
      inputCostPer1M: 0.435,
      outputCostPer1M: 0.87,
      supportedCapabilities: ['reasoning_effort'],
      reasoningEffortMap: {
        none: { thinking: { type: 'disabled' } },
        high: { reasoning_effort: 'high', thinking: { type: 'enabled' } },
        xhigh: { reasoning_effort: 'max', thinking: { type: 'enabled' } },
      },
      defaultReasoningEffort: 'high',
      preserveReasoning: true,
    };

    render(<ModelConfigDialog {...baseProps} defaults={defaults} />);

    // The "None" option should NOT be present
    const select = document.querySelector('vscode-single-select');
    expect(select).not.toBeNull();
    expect(select!.querySelector('vscode-option[value=""]')).toBeNull();
  });

  it('pre-fills defaultReasoningEffort from defaults with reasoningEffortMap', () => {
    const defaults: ModelDefaultsResult = {
      contextSize: 128000,
      maxTokens: 16384,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10,
      supportedCapabilities: ['reasoning_effort'],
      reasoningEffortMap: {
        low: { reasoning_effort: 'low' },
        medium: { reasoning_effort: 'medium' },
        high: { reasoning_effort: 'high' },
      },
      defaultReasoningEffort: 'medium',
    };

    render(<ModelConfigDialog {...baseProps} defaults={defaults} />);

    const select = document.querySelector('vscode-single-select');
    expect(select).not.toBeNull();
    expect(select!.getAttribute('value')).toBe('medium');
  });
});
