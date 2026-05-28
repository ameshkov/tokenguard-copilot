import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomFieldsEditor, hasCustomFieldErrors } from './custom-fields-editor.js';
import type { CustomField } from '@tokenguard/shared';

afterEach(() => {
  cleanup();
});

describe('CustomFieldsEditor', () => {
  const baseProps = {
    customFields: [] as CustomField[],
    onChange: vi.fn(),
    disabled: false,
  };

  it('renders placeholder when no fields exist', () => {
    render(<CustomFieldsEditor {...baseProps} />);
    expect(screen.getByText(/No custom fields configured/)).toBeDefined();
  });

  it('renders Add button', () => {
    render(<CustomFieldsEditor {...baseProps} />);
    expect(screen.getByRole('button', { name: /Add/ })).toBeDefined();
  });

  it('adds a new empty row when Add is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CustomFieldsEditor {...baseProps} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Add/ }));
    expect(onChange).toHaveBeenCalledWith([{ property: '', type: 'string', value: '' }]);
  });

  it('renders existing fields as rows', () => {
    const fields: CustomField[] = [
      { property: 'reasoning_split', type: 'boolean', value: 'true' },
      { property: 'cache_control', type: 'json', value: '{"type":"ephemeral"}' },
    ];
    const { container } = render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    const rows = container.querySelectorAll('vscode-table-row');
    expect(rows.length).toBe(2);
  });

  it('calls onChange when property name changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const fields: CustomField[] = [{ property: '', type: 'string', value: '' }];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} onChange={onChange} />);
    // getAllByLabelText returns [vscode-textfield, input];
    // we need the inner <input> to trigger onInput.
    const nameInputs = screen.getAllByLabelText('Field 1 property name');
    const innerInput = nameInputs.find((el) => el.tagName === 'INPUT')!;
    await user.type(innerInput, 'foo');
    // onChange is called per keystroke
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0][0].property).toBe('foo');
  });

  it('removes a field when remove button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const fields: CustomField[] = [
      { property: 'foo', type: 'string', value: 'bar' },
      { property: 'baz', type: 'number', value: '42' },
    ];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} onChange={onChange} />);
    const removeButtons = screen.getAllByRole('button', {
      name: /Remove/,
    });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ property: 'baz', type: 'number', value: '42' }]);
  });

  it('shows error for invalid number value', () => {
    const fields: CustomField[] = [{ property: 'temp', type: 'number', value: 'abc' }];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    expect(screen.getByText('Must be a valid number')).toBeDefined();
  });

  it('shows error for invalid boolean value', () => {
    const fields: CustomField[] = [{ property: 'flag', type: 'boolean', value: 'yes' }];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    expect(screen.getByText('Must be "true" or "false"')).toBeDefined();
  });

  it('shows error for invalid JSON value', () => {
    const fields: CustomField[] = [{ property: 'data', type: 'json', value: '{bad' }];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    expect(screen.getByText('Must be valid JSON')).toBeDefined();
  });

  it('accepts valid string value without error', () => {
    const fields: CustomField[] = [{ property: 'key', type: 'string', value: 'anything' }];
    const { container } = render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    const helpers = container.querySelectorAll('vscode-form-helper[severity="error"]');
    expect(helpers.length).toBe(0);
  });

  it('shows error for duplicate property names', () => {
    const fields: CustomField[] = [
      { property: 'foo', type: 'string', value: 'a' },
      { property: 'foo', type: 'number', value: '1' },
    ];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    expect(screen.getAllByText('Duplicate property name').length).toBeGreaterThanOrEqual(1);
  });

  it('shows error for empty property name', () => {
    const fields: CustomField[] = [{ property: '', type: 'string', value: 'a' }];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    expect(screen.getByText('Property name is required')).toBeDefined();
  });

  it('does not show empty property error on untouched row', () => {
    const fields: CustomField[] = [{ property: '', type: 'string', value: '' }];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} />);
    expect(screen.queryByText('Property name is required')).toBeNull();
  });

  it('disables all inputs when disabled prop is true', () => {
    const fields: CustomField[] = [{ property: 'foo', type: 'string', value: 'bar' }];
    render(<CustomFieldsEditor {...baseProps} customFields={fields} disabled={true} />);
    const nameInput = screen.getAllByLabelText('Field 1 property name')[0];
    expect(nameInput.hasAttribute('disabled') || (nameInput as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});

describe('hasCustomFieldErrors', () => {
  it('returns false for empty array', () => {
    expect(hasCustomFieldErrors([])).toBe(false);
  });

  it('returns false for valid fields', () => {
    const fields: CustomField[] = [
      { property: 'foo', type: 'string', value: 'bar' },
      { property: 'baz', type: 'number', value: '42' },
    ];
    expect(hasCustomFieldErrors(fields)).toBe(false);
  });

  it('returns true for empty property name', () => {
    const fields: CustomField[] = [{ property: '', type: 'string', value: 'bar' }];
    expect(hasCustomFieldErrors(fields)).toBe(true);
  });

  it('returns true for duplicate property names', () => {
    const fields: CustomField[] = [
      { property: 'foo', type: 'string', value: 'a' },
      { property: 'foo', type: 'number', value: '1' },
    ];
    expect(hasCustomFieldErrors(fields)).toBe(true);
  });

  it('returns true for invalid number value', () => {
    const fields: CustomField[] = [{ property: 'x', type: 'number', value: 'abc' }];
    expect(hasCustomFieldErrors(fields)).toBe(true);
  });

  it('returns true for invalid boolean value', () => {
    const fields: CustomField[] = [{ property: 'x', type: 'boolean', value: 'yes' }];
    expect(hasCustomFieldErrors(fields)).toBe(true);
  });

  it('returns true for invalid JSON value', () => {
    const fields: CustomField[] = [{ property: 'x', type: 'json', value: '{bad' }];
    expect(hasCustomFieldErrors(fields)).toBe(true);
  });
});
