import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelsSection } from './models-section.js';
import type { ModelInfo, ProviderInfo } from '@tokenguard/shared';

afterEach(() => {
  cleanup();
});

const defaultProps = {
  models: [] as ModelInfo[],
  providers: [
    { id: 'p1', name: 'Test Provider', baseUrl: 'https://api.test.com' },
  ] as ProviderInfo[],
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onRemove: vi
    .fn<(providerId: string, modelId: string) => Promise<void>>()
    .mockResolvedValue(undefined),
};

const sampleModel: ModelInfo = {
  id: 'gpt-4o',
  providerId: 'p1',
  displayName: 'GPT-4o',
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

describe('ModelsSection', () => {
  it('renders the section header', () => {
    render(<ModelsSection {...defaultProps} />);
    expect(screen.getByText('Models')).toBeDefined();
  });

  it('renders table headers', () => {
    render(<ModelsSection {...defaultProps} models={[sampleModel]} />);
    expect(screen.getByText('Model')).toBeDefined();
    expect(screen.getByText('Provider')).toBeDefined();
    expect(screen.getByText('Actions')).toBeDefined();
  });

  it('shows empty state when no models', () => {
    render(<ModelsSection {...defaultProps} />);
    expect(screen.getByText('No models configured')).toBeDefined();
  });

  it('renders Add Model button', () => {
    render(<ModelsSection {...defaultProps} />);
    const btn = screen.getByRole('button', { name: 'Add Model' });
    expect(btn).toBeDefined();
    expect(btn).toHaveProperty('disabled', false);
  });

  it('calls onAdd when Add Model is clicked', async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<ModelsSection {...defaultProps} onAdd={onAdd} />);

    await user.click(screen.getByRole('button', { name: 'Add Model' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('shows model data in table', () => {
    render(<ModelsSection {...defaultProps} models={[sampleModel]} />);
    expect(screen.getByText('GPT-4o')).toBeDefined();
    expect(screen.getByText('Test Provider')).toBeDefined();
  });

  it('shows Edit and Remove buttons for each model', () => {
    render(<ModelsSection {...defaultProps} models={[sampleModel]} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDefined();
  });

  it('calls onEdit when Edit is clicked', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ModelsSection {...defaultProps} models={[sampleModel]} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(sampleModel);
  });

  it('shows confirm dialog on Remove click', async () => {
    const user = userEvent.setup();
    render(<ModelsSection {...defaultProps} models={[sampleModel]} />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
      screen.getByText(
        'Remove model "GPT-4o"? The model will no longer ' +
          'be available in Copilot Chat. Usage statistics ' +
          'will be kept.',
      ),
    ).toBeDefined();
  });

  it('calls onRemove on confirm', async () => {
    const onRemove = vi
      .fn<(providerId: string, modelId: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ModelsSection {...defaultProps} models={[sampleModel]} onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    const confirmBtn = removeButtons.find((btn) => btn.closest('.confirm-dialog__actions'));
    await user.click(confirmBtn!);

    expect(onRemove).toHaveBeenCalledWith('p1', 'gpt-4o');
  });
});
