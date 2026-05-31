import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContentRulesSection } from './content-rules-section.js';
import type { ContentRuleInfo } from '@tokenguard/shared';

// Mock sendRequest from vscode-api
vi.mock('../vscode-api.js', () => ({
  sendRequest: vi.fn(),
}));

import { sendRequest } from '../vscode-api.js';

const mockSendRequest = sendRequest as ReturnType<typeof vi.fn>;

const sampleRules: ContentRuleInfo[] = [
  {
    id: 'rule-001',
    name: 'Strip skills',
    enabled: true,
    matchRole: 'system',
    matchMessageNumber: null,
    matchModelPattern: null,
    matchContentPattern: null,
    matchToolPresent: null,
    matchToolAbsent: null,
    regexPattern: '<skills>[\\s\\S]*?</skills>',
    regexFlags: 'gi',
    substitution: '',
    sortOrder: 0,
    createdAt: '2026-05-29T10:00:00.000Z',
    updatedAt: '2026-05-29T10:00:00.000Z',
  },
  {
    id: 'rule-002',
    name: 'Remove memory',
    enabled: false,
    matchRole: 'system',
    matchMessageNumber: null,
    matchModelPattern: null,
    matchContentPattern: null,
    matchToolPresent: null,
    matchToolAbsent: ['memory'],
    regexPattern: '<memoryInstructions>[\\s\\S]*?</memoryInstructions>',
    regexFlags: 'gi',
    substitution: '',
    sortOrder: 1,
    createdAt: '2026-05-29T10:15:00.000Z',
    updatedAt: '2026-05-29T10:15:00.000Z',
  },
];

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('ContentRulesSection', () => {
  const onAdd = vi.fn();
  const onEdit = vi.fn();

  beforeEach(() => {
    onAdd.mockReset();
    onEdit.mockReset();
  });

  it('renders loading state on mount', () => {
    // sendRequest hasn't resolved yet
    mockSendRequest.mockImplementationOnce(() => new Promise(() => {}));
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  it('renders rules table with fixture data', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Strip skills')).toBeDefined();
    });
    expect(screen.getByText('Remove memory')).toBeDefined();
  });

  it('renders empty state when no rules exist', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: [] });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText(/no content rules/i)).toBeDefined();
    });
  });

  it('dispatches updateContentRule on toggle', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Strip skills')).toBeDefined();
    });

    // Find the checkbox for "Strip skills" (enabled) and click it
    const checkboxes = screen.getAllByRole('checkbox');
    // The enabled rule's checkbox should be checked
    const enabledCheckbox = checkboxes[0]!;
    expect(enabledCheckbox).toBeDefined();
    // Reset mock before toggle action
    mockSendRequest.mockClear();
    mockSendRequest.mockResolvedValueOnce({
      type: 'updateContentRuleResult',
      success: true,
      rule: { ...sampleRules[0]!, enabled: false },
    });

    await userEvent.click(enabledCheckbox);

    expect(mockSendRequest).toHaveBeenCalledWith({
      type: 'updateContentRule',
      id: 'rule-001',
      params: { enabled: false },
    });
  });

  it('dispatches deleteContentRule on remove confirmation', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Strip skills')).toBeDefined();
    });

    // Click the Remove button for the first rule
    const removeButtons = screen.getAllByText('Remove');
    mockSendRequest.mockClear();
    mockSendRequest.mockResolvedValueOnce({
      type: 'deleteContentRuleResult',
      success: true,
    });
    // After successful delete, re-fetch
    mockSendRequest.mockResolvedValueOnce({
      type: 'getContentRulesResult',
      rules: [sampleRules[1]!],
    });

    await userEvent.click(removeButtons[0]!);

    // Confirm dialog should appear
    await waitFor(() => {
      expect(screen.getByText(/permanently delete/i)).toBeDefined();
    });

    // Click confirm
    mockSendRequest.mockClear();
    mockSendRequest.mockResolvedValueOnce({
      type: 'deleteContentRuleResult',
      success: true,
    });
    mockSendRequest.mockResolvedValueOnce({
      type: 'getContentRulesResult',
      rules: [sampleRules[1]!],
    });

    const confirmButton = screen.getByText('Delete Rule');
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockSendRequest).toHaveBeenCalledWith({
        type: 'deleteContentRule',
        id: 'rule-001',
      });
    });
  });

  it('navigates to add page on Add Rule button click', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Add Rule')).toBeDefined();
    });

    await userEvent.click(screen.getByText('Add Rule'));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('navigates to edit page on Edit button click', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Strip skills')).toBeDefined();
    });

    const editButtons = screen.getAllByText('Edit');
    await userEvent.click(editButtons[0]!);
    expect(onEdit).toHaveBeenCalledWith(sampleRules[0]);
  });

  it('dispatches reorderContentRules on up button click', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Remove memory')).toBeDefined();
    });

    // Click the up button on rule-002 (second rule)
    const upButtons = screen.getAllByLabelText('Move up');
    mockSendRequest.mockClear();
    mockSendRequest.mockResolvedValueOnce({
      type: 'reorderContentRulesResult',
      success: true,
      rules: [
        { ...sampleRules[1]!, sortOrder: 0 },
        { ...sampleRules[0]!, sortOrder: 1 },
      ],
    });

    await userEvent.click(upButtons[1]!);

    await waitFor(() => {
      expect(mockSendRequest).toHaveBeenCalledWith({
        type: 'reorderContentRules',
        orderedIds: ['rule-002', 'rule-001'],
      });
    });
  });

  it('does not render up button for first rule', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Strip skills')).toBeDefined();
    });

    const upButtons = screen.getAllByLabelText('Move up');
    // Both rules have up buttons, but the first one should be disabled
    expect(upButtons.length).toBe(2);
    expect(upButtons[0]).toHaveProperty('disabled', true);
    expect(upButtons[1]).toHaveProperty('disabled', false);
  });

  it('does not render down button for last rule', async () => {
    mockSendRequest.mockResolvedValueOnce({ type: 'getContentRulesResult', rules: sampleRules });
    render(<ContentRulesSection onAdd={onAdd} onEdit={onEdit} />);
    await waitFor(() => {
      expect(screen.getByText('Remove memory')).toBeDefined();
    });

    const downButtons = screen.getAllByLabelText('Move down');
    // Both rules have down buttons, but the last one should be disabled
    expect(downButtons.length).toBe(2);
    expect(downButtons[0]).toHaveProperty('disabled', false);
    expect(downButtons[1]).toHaveProperty('disabled', true);
  });
});
