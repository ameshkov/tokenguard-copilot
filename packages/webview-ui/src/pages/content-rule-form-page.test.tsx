import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContentRuleFormPage } from './content-rule-form-page.js';
import type { ContentRuleInfo } from '@tokenguard/shared';

// Mock sendRequest from vscode-api
vi.mock('../vscode-api.js', () => ({
  sendRequest: vi.fn(),
}));

import { sendRequest } from '../vscode-api.js';

const mockSendRequest = sendRequest as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const editingRule: ContentRuleInfo = {
  id: 'rule-001',
  name: 'Strip skills',
  enabled: true,
  matchRole: 'system',
  matchMessageNumber: 0,
  matchModelPattern: 'gpt-4*',
  matchContentPattern: 'skills',
  matchToolPresent: ['search'],
  matchToolAbsent: ['memory'],
  regexPattern: '<skills>[\\s\\S]*?</skills>',
  regexFlags: 'gi',
  substitution: 'REMOVED',
  sortOrder: 0,
  createdAt: '2026-05-29T10:00:00.000Z',
  updatedAt: '2026-05-29T10:00:00.000Z',
};

describe('ContentRuleFormPage', () => {
  const onDone = vi.fn();

  beforeEach(() => {
    onDone.mockReset();
  });

  it('renders all form fields for add mode', () => {
    render(<ContentRuleFormPage onDone={onDone} />);

    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Enabled' })).toBeDefined();
    // Match Role is a vscode-single-select, not a labelable input
    expect(screen.getByText('Match Role')).toBeDefined();
    expect(screen.getByLabelText('Match Message Number')).toBeDefined();
    expect(screen.getByLabelText('Match Model Pattern')).toBeDefined();
    expect(screen.getByLabelText('Match Content Pattern')).toBeDefined();
    expect(screen.getByLabelText('Match Tools Present')).toBeDefined();
    expect(screen.getByLabelText('Match Tools Absent')).toBeDefined();
    expect(screen.getByLabelText('Regex Pattern')).toBeDefined();
    expect(screen.getByLabelText('Regex Flags')).toBeDefined();
    expect(screen.getByLabelText('Substitution')).toBeDefined();
  });

  it('pre-fills fields when editingRule is provided', () => {
    render(<ContentRuleFormPage editingRule={editingRule} onDone={onDone} />);

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    expect(nameInput.value).toBe('Strip skills');

    const enabledCheckbox = screen.getByRole('checkbox', { name: 'Enabled' });
    expect(enabledCheckbox).toHaveProperty('checked', true);

    const matchMsgNum = screen.getByLabelText('Match Message Number') as HTMLInputElement;
    expect(matchMsgNum.value).toBe('0');

    const matchModel = screen.getByLabelText('Match Model Pattern') as HTMLInputElement;
    expect(matchModel.value).toBe('gpt-4*');

    const matchContent = screen.getByLabelText('Match Content Pattern') as HTMLInputElement;
    expect(matchContent.value).toBe('skills');

    const matchToolsPresent = screen.getByLabelText('Match Tools Present') as HTMLInputElement;
    expect(matchToolsPresent.value).toBe('search');

    const matchToolsAbsent = screen.getByLabelText('Match Tools Absent') as HTMLInputElement;
    expect(matchToolsAbsent.value).toBe('memory');

    const regexPattern = screen.getByLabelText('Regex Pattern') as HTMLInputElement;
    expect(regexPattern.value).toBe('<skills>[\\s\\S]*?</skills>');

    const regexFlags = screen.getByLabelText('Regex Flags') as HTMLInputElement;
    expect(regexFlags.value).toBe('gi');

    const substitution = screen.getByLabelText('Substitution') as HTMLInputElement;
    expect(substitution.value).toBe('REMOVED');
  });

  it('shows validation error when name is empty on save', async () => {
    render(<ContentRuleFormPage onDone={onDone} />);

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeDefined();
    });
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid regexPattern', async () => {
    render(<ContentRuleFormPage onDone={onDone} />);

    // Fill name first so that error isn't about missing name
    const nameInput = screen.getByLabelText('Name');
    await userEvent.type(nameInput, 'Test Rule');

    const regexInput = screen.getByLabelText('Regex Pattern');
    // Use fireEvent.input because '[' is a special character in userEvent.type
    fireEvent.input(regexInput, { target: { value: '[invalid' } });

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid regex pattern/i)).toBeDefined();
    });
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid matchContentPattern', async () => {
    render(<ContentRuleFormPage onDone={onDone} />);

    const nameInput = screen.getByLabelText('Name');
    await userEvent.type(nameInput, 'Test Rule');

    const regexInput = screen.getByLabelText('Regex Pattern');
    await userEvent.type(regexInput, 'valid');

    const matchContentInput = screen.getByLabelText('Match Content Pattern');
    fireEvent.input(matchContentInput, { target: { value: '[invalid' } });

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid match content pattern/i)).toBeDefined();
    });
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid regexFlags', async () => {
    render(<ContentRuleFormPage onDone={onDone} />);

    const nameInput = screen.getByLabelText('Name');
    await userEvent.type(nameInput, 'Test Rule');

    const regexInput = screen.getByLabelText('Regex Pattern');
    await userEvent.type(regexInput, 'valid');

    const flagsInput = screen.getByLabelText('Regex Flags');
    await userEvent.type(flagsInput, 'x');

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid regex flags/i)).toBeDefined();
    });
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('shows validation error for non-numeric matchMessageNumber', async () => {
    render(<ContentRuleFormPage onDone={onDone} />);

    const nameInput = screen.getByLabelText('Name');
    await userEvent.type(nameInput, 'Test Rule');

    const regexInput = screen.getByLabelText('Regex Pattern');
    await userEvent.type(regexInput, 'valid');

    // Use fireEvent.input to set a non-numeric value on the number input
    const msgNumInput = screen.getByLabelText('Match Message Number');
    fireEvent.input(msgNumInput, { target: { value: 'abc' } });

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Must be a non-negative integer/i)).toBeDefined();
    });
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('dispatches addContentRule on save in add mode', async () => {
    mockSendRequest.mockResolvedValueOnce({
      type: 'addContentRuleResult',
      success: true,
      rule: { ...editingRule, id: 'new-rule' },
    });

    render(<ContentRuleFormPage onDone={onDone} />);

    await userEvent.type(screen.getByLabelText('Name'), 'Test Rule');
    await userEvent.type(screen.getByLabelText('Regex Pattern'), 'test');
    await userEvent.type(screen.getByLabelText('Substitution'), 'replaced');

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSendRequest).toHaveBeenCalledWith({
        type: 'addContentRule',
        params: {
          name: 'Test Rule',
          enabled: true,
          matchRole: 'all',
          matchMessageNumber: null,
          matchModelPattern: null,
          matchContentPattern: null,
          matchToolPresent: null,
          matchToolAbsent: null,
          regexPattern: 'test',
          regexFlags: 'gm',
          substitution: 'replaced',
        },
      });
    });

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    });
  });

  it('dispatches updateContentRule on save in edit mode', async () => {
    mockSendRequest.mockResolvedValueOnce({
      type: 'updateContentRuleResult',
      success: true,
      rule: { ...editingRule, name: 'Updated Rule' },
    });

    render(<ContentRuleFormPage editingRule={editingRule} onDone={onDone} />);

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    // Clear and retype
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Rule');

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSendRequest).toHaveBeenCalledWith({
        type: 'updateContentRule',
        id: 'rule-001',
        params: {
          name: 'Updated Rule',
          enabled: true,
          matchRole: 'system',
          matchMessageNumber: 0,
          matchModelPattern: 'gpt-4*',
          matchContentPattern: 'skills',
          matchToolPresent: ['search'],
          matchToolAbsent: ['memory'],
          regexPattern: '<skills>[\\s\\S]*?</skills>',
          regexFlags: 'gi',
          substitution: 'REMOVED',
        },
      });
    });

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    });
  });

  it('shows cancel confirm dialog and navigates back', async () => {
    render(<ContentRuleFormPage onDone={onDone} />);

    const cancelButton = screen.getByText('Cancel');
    await userEvent.click(cancelButton);

    await waitFor(() => {
      // Both the message and confirm button contain "Discard";
      // use a role query for the button to be unambiguous.
      expect(screen.getByRole('button', { name: 'Discard' })).toBeDefined();
    });

    const confirmDiscard = screen.getByRole('button', { name: 'Discard' });
    await userEvent.click(confirmDiscard);

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('handles server error on save', async () => {
    mockSendRequest.mockResolvedValueOnce({
      type: 'addContentRuleResult',
      success: false,
      error: 'Server error: name already exists',
    });

    render(<ContentRuleFormPage onDone={onDone} />);

    await userEvent.type(screen.getByLabelText('Name'), 'Test Rule');
    await userEvent.type(screen.getByLabelText('Regex Pattern'), 'test');
    await userEvent.type(screen.getByLabelText('Substitution'), 'replaced');

    const saveButton = screen.getByText('Save Rule');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Server error: name already exists/i)).toBeDefined();
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});
