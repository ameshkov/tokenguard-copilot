import type { CustomField, CustomFieldType } from '@tokenguard/shared';
import { Button, Input } from '../components/index.js';

/** Props for the {@link CustomFieldsEditor} component. */
export interface CustomFieldsEditorProps {
  /** Current list of custom fields. */
  customFields: CustomField[];
  /** Called when the fields array changes. */
  onChange: (fields: CustomField[]) => void;
  /** Whether all inputs should be disabled. */
  disabled: boolean;
}

const FIELD_TYPES: CustomFieldType[] = ['string', 'number', 'boolean', 'json'];

/**
 * Validates a custom field value against its declared type.
 *
 * @param type - The field type.
 * @param value - The raw string value.
 * @returns An error message, or `undefined` if valid.
 */
function validateValue(type: CustomFieldType, value: string): string | undefined {
  if (value === '') return undefined;
  switch (type) {
    case 'string':
      return undefined;
    case 'number': {
      const n = Number(value);
      if (isNaN(n) || !isFinite(n)) {
        return 'Must be a valid number';
      }
      return undefined;
    }
    case 'boolean':
      if (value !== 'true' && value !== 'false') {
        return 'Must be "true" or "false"';
      }
      return undefined;
    case 'json':
      try {
        JSON.parse(value);
        return undefined;
      } catch {
        return 'Must be valid JSON';
      }
  }
}

/**
 * Checks whether the property name is valid within the
 * fields array.
 *
 * @param fields - All custom fields.
 * @param index - Index of the field to check.
 * @returns An error message, or `undefined` if valid.
 */
function validatePropertyName(fields: CustomField[], index: number): string | undefined {
  const field = fields[index];
  if (field.property === '') {
    return 'Property name is required';
  }
  const isDuplicate = fields.some((f, i) => i !== index && f.property === field.property);
  if (isDuplicate) {
    return 'Duplicate property name';
  }
  return undefined;
}

/**
 * Editor for custom request body fields.
 *
 * Renders a key-value table where each row has a property
 * name input, a type selector, and a value input. Supports
 * add, edit, and remove operations with inline validation.
 *
 * @param props - Editor props.
 * @returns The editor element.
 */
export function CustomFieldsEditor(props: CustomFieldsEditorProps): React.JSX.Element {
  const { customFields, onChange, disabled } = props;

  const handleAdd = () => {
    onChange([...customFields, { property: '', type: 'string', value: '' }]);
  };

  const handleRemove = (index: number) => {
    onChange(customFields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, patch: Partial<CustomField>) => {
    onChange(customFields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  return (
    <div className="model-config-dialog__section">
      <h3 className="model-config-dialog__section-title">Custom Fields</h3>

      {customFields.length === 0 ? (
        <p className="custom-fields-editor__placeholder">
          No custom fields configured. Add custom properties to include in the chat completion
          request body.
        </p>
      ) : (
        <vscode-table bordered-rows className="custom-fields-editor__table">
          <vscode-table-header slot="header">
            <vscode-table-header-cell>Property</vscode-table-header-cell>
            <vscode-table-header-cell>Type</vscode-table-header-cell>
            <vscode-table-header-cell>Value</vscode-table-header-cell>
            <vscode-table-header-cell>&nbsp;</vscode-table-header-cell>
          </vscode-table-header>
          <vscode-table-body slot="body">
            {customFields.map((field, index) => {
              const rawNameError = validatePropertyName(customFields, index);
              // Suppress "required" on untouched rows (empty name + empty value)
              const nameError =
                rawNameError === 'Property name is required' && field.value === ''
                  ? undefined
                  : rawNameError;
              const valueError = validateValue(field.type, field.value);
              return (
                <vscode-table-row key={index}>
                  <vscode-table-cell>
                    <Input
                      aria-label={`Field ${index + 1} property name`}
                      value={field.property}
                      onChange={(e) =>
                        handleFieldChange(index, {
                          property: e.target.value,
                        })
                      }
                      placeholder="e.g. reasoning_split"
                      disabled={disabled}
                      errorMessage={nameError}
                    />
                  </vscode-table-cell>
                  <vscode-table-cell>
                    <vscode-single-select
                      aria-label={`Field ${index + 1} type`}
                      value={field.type}
                      disabled={disabled || undefined}
                      onchange={(e: Event) =>
                        handleFieldChange(index, {
                          type: (e.target as HTMLSelectElement).value as CustomFieldType,
                          value: '',
                        })
                      }
                    >
                      {FIELD_TYPES.map((t) => (
                        <vscode-option key={t} value={t} selected={t === field.type || undefined}>
                          {t}
                        </vscode-option>
                      ))}
                    </vscode-single-select>
                  </vscode-table-cell>
                  <vscode-table-cell>
                    <Input
                      aria-label={`Field ${index + 1} value`}
                      value={field.value}
                      onChange={(e) =>
                        handleFieldChange(index, {
                          value: e.target.value,
                        })
                      }
                      placeholder={
                        field.type === 'boolean'
                          ? 'true or false'
                          : field.type === 'json'
                            ? '{"key": "value"}'
                            : field.type === 'number'
                              ? '0'
                              : 'value'
                      }
                      disabled={disabled}
                      errorMessage={valueError}
                    />
                  </vscode-table-cell>
                  <vscode-table-cell>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleRemove(index)}
                      disabled={disabled}
                      aria-label={`Remove ${field.property || `field ${index + 1}`}`}
                    >
                      ×
                    </Button>
                  </vscode-table-cell>
                </vscode-table-row>
              );
            })}
          </vscode-table-body>
        </vscode-table>
      )}

      <div className="custom-fields-editor__actions">
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={disabled}>
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Checks whether any custom field has a validation error.
 *
 * Used by the parent dialog to block form submission when
 * custom fields are invalid.
 *
 * @param fields - The current custom fields array.
 * @returns `true` if any field has an error.
 */
export function hasCustomFieldErrors(fields: CustomField[]): boolean {
  return fields.some((field, index, arr) => {
    if (validatePropertyName(arr, index) !== undefined) {
      return true;
    }
    if (field.value !== '' && validateValue(field.type, field.value) !== undefined) {
      return true;
    }
    return false;
  });
}
