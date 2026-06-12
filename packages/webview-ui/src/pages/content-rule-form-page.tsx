import { useState, useEffect } from 'react';

import type {
  ContentRuleInfo,
  AddContentRuleParams,
  AddContentRuleResponse,
  UpdateContentRuleResponse,
} from '@tokenguard/shared';
import { sendRequest } from '../vscode-api.js';
import { Button, ConfirmDialog, FormGroup, SectionHeader } from '../components/index.js';
import {
  BasicSettingsFields,
  AdvancedSettingsFields,
  type ContentRuleFieldsProps,
} from '../sections/content-rule-form-fields.js';

/**
 * Props for the content rule add/edit form page.
 */
export interface ContentRuleFormPageProps {
  /** Existing rule to edit, or undefined for add mode. */
  editingRule?: ContentRuleInfo;
  /** Called when the form is done (saved or cancelled). */
  onDone: () => void;
}

/**
 * Validates all content rule form fields and returns any errors.
 *
 * @param fields - The form field values to validate.
 * @returns An object mapping field names to error messages.
 *   An empty object means all fields are valid.
 */
function validateContentRuleFields(fields: {
  name: string;
  regexPattern: string;
  regexFlags: string;
  matchContentPattern: string;
  matchMessageNumber: string;
}): Record<string, string> {
  const newErrors: Record<string, string> = {};

  // name: required, non-empty after trim
  if (!fields.name.trim()) {
    newErrors.name = 'Name is required';
  }

  // regexPattern: must compile
  try {
    new RegExp(fields.regexPattern, fields.regexFlags);
  } catch {
    newErrors.regexPattern = 'Invalid regex pattern';
  }

  // matchContentPattern: if non-empty, must compile (using same regexFlags)
  if (fields.matchContentPattern.trim()) {
    try {
      new RegExp(fields.matchContentPattern, fields.regexFlags);
    } catch {
      newErrors.matchContentPattern = 'Invalid match content pattern';
    }
  }

  // regexFlags: if non-empty, must only contain valid flags
  if (fields.regexFlags.trim()) {
    const validFlags = new Set(['g', 'i', 'm', 's']);
    const chars = fields.regexFlags.trim().split('');
    const seen = new Set<string>();
    for (const ch of chars) {
      if (!validFlags.has(ch)) {
        newErrors.regexFlags = `Invalid regex flags: '${ch}' is not a valid flag. Use g, i, m, s only.`;
        break;
      }
      if (seen.has(ch)) {
        newErrors.regexFlags = `Invalid regex flags: duplicate flag '${ch}'.`;
        break;
      }
      seen.add(ch);
    }
  }

  // matchMessageNumber: if non-empty, must be a non-negative integer
  if (fields.matchMessageNumber.trim()) {
    const parsed = Number(fields.matchMessageNumber.trim());
    if (!Number.isInteger(parsed) || parsed < 0) {
      newErrors.matchMessageNumber = 'Must be a non-negative integer';
    }
  }

  return newErrors;
}

/**
 * Full-page form for adding or editing a content rule.
 *
 * Handles client-side validation for required fields and
 * regex patterns, then dispatches `addContentRule` or
 * `updateContentRule` to the extension host.
 *
 * @param props - Form page props.
 * @returns The form page element.
 */
export function ContentRuleFormPage(props: ContentRuleFormPageProps): React.JSX.Element {
  const { editingRule, onDone } = props;

  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [matchRole, setMatchRole] = useState('all');
  const [matchMessageNumber, setMatchMessageNumber] = useState('');
  const [matchModelPattern, setMatchModelPattern] = useState('');
  const [matchContentPattern, setMatchContentPattern] = useState('');
  const [matchToolPresent, setMatchToolPresent] = useState('');
  const [matchToolAbsent, setMatchToolAbsent] = useState('');
  const [regexPattern, setRegexPattern] = useState('');
  const [regexFlags, setRegexFlags] = useState('gm');
  const [substitution, setSubstitution] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  /** Pre-fill fields when editing an existing rule. */
  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);
      setEnabled(editingRule.enabled);
      setMatchRole(editingRule.matchRole ?? 'all');
      setMatchMessageNumber(
        editingRule.matchMessageNumber != null ? String(editingRule.matchMessageNumber) : '',
      );
      setMatchModelPattern(editingRule.matchModelPattern ?? '');
      setMatchContentPattern(editingRule.matchContentPattern ?? '');
      setMatchToolPresent(editingRule.matchToolPresent?.join(', ') ?? '');
      setMatchToolAbsent(editingRule.matchToolAbsent?.join(', ') ?? '');
      setRegexPattern(editingRule.regexPattern);
      setRegexFlags(editingRule.regexFlags || 'gm');
      setSubstitution(editingRule.substitution);
    }
  }, [editingRule]);

  /** Clear a specific field error. */
  const clearError = (field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setServerError(null);
  };

  /** Validate all form fields. Returns true if valid. */
  const validate = (): boolean => {
    const newErrors = validateContentRuleFields({
      name,
      regexPattern,
      regexFlags,
      matchContentPattern,
      matchMessageNumber,
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /** Build AddContentRuleParams from form state. */
  const buildParams = (): AddContentRuleParams => {
    const parseCommaList = (s: string): string[] | null => {
      const trimmed = s.trim();
      if (!trimmed) return null;
      return trimmed
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    };

    return {
      name: name.trim(),
      enabled,
      matchRole: matchRole as 'system' | 'user' | 'all',
      matchMessageNumber: matchMessageNumber.trim() ? Number(matchMessageNumber.trim()) : null,
      matchModelPattern: matchModelPattern.trim() || null,
      matchContentPattern: matchContentPattern.trim() || null,
      matchToolPresent: parseCommaList(matchToolPresent),
      matchToolAbsent: parseCommaList(matchToolAbsent),
      regexPattern,
      regexFlags,
      substitution,
    };
  };

  /** Handle form submission. */
  const handleSubmit = async () => {
    if (!validate()) return;

    setSaving(true);
    setServerError(null);

    try {
      if (editingRule) {
        const response = await sendRequest<UpdateContentRuleResponse>({
          type: 'updateContentRule',
          id: editingRule.id,
          params: buildParams(),
        });
        if (!response.success) {
          setServerError(response.error ?? 'Save failed');
          return;
        }
      } else {
        const response = await sendRequest<AddContentRuleResponse>({
          type: 'addContentRule',
          params: buildParams(),
        });
        if (!response.success) {
          setServerError(response.error ?? 'Save failed');
          return;
        }
      }
      onDone();
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editingRule;
  const title = isEdit ? 'Edit Content Rule' : 'Add Content Rule';

  const fieldProps: ContentRuleFieldsProps = {
    name,
    setName,
    enabled,
    setEnabled,
    regexPattern,
    setRegexPattern,
    substitution,
    setSubstitution,
    matchRole,
    setMatchRole,
    matchMessageNumber,
    setMatchMessageNumber,
    matchModelPattern,
    setMatchModelPattern,
    matchContentPattern,
    setMatchContentPattern,
    matchToolPresent,
    setMatchToolPresent,
    matchToolAbsent,
    setMatchToolAbsent,
    regexFlags,
    setRegexFlags,
    errors,
    clearError,
  };

  return (
    <div className="content-rule-form-page">
      <SectionHeader title={title} />

      <vscode-form-container>
        <BasicSettingsFields {...fieldProps} />
        <AdvancedSettingsFields {...fieldProps} />

        <FormGroup>
          {Object.keys(errors).length > 0 && (
            <div className="content-rule-form-page__error">
              Please fix the following errors:{' '}
              {Object.keys(errors)
                .map((field) => field)
                .join(', ')}
              .
            </div>
          )}
          {serverError && <div className="error-banner">{serverError}</div>}
          <div className="content-rule-form-page__actions">
            <Button type="submit" onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? 'Saving…' : 'Save Rule'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCancelConfirm(true)}
              disabled={saving}
            >
              Cancel
            </Button>
            {saving && <vscode-progress-ring />}
          </div>
        </FormGroup>
      </vscode-form-container>

      {showCancelConfirm && (
        <ConfirmDialog
          message="Discard changes? Your modifications will be lost."
          confirmLabel="Discard"
          onConfirm={onDone}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}
