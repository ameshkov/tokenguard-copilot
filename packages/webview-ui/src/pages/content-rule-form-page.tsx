import { useState, useEffect } from 'react';

import type {
  ContentRuleInfo,
  AddContentRuleParams,
  AddContentRuleResponse,
  UpdateContentRuleResponse,
} from '@tokenguard/shared';
import { sendRequest } from '../vscode-api.js';
import {
  Button,
  ConfirmDialog,
  FormGroup,
  Input,
  Label,
  SectionHeader,
} from '../components/index.js';

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
    const newErrors: Record<string, string> = {};

    // name: required, non-empty after trim
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    // regexPattern: must compile
    try {
      new RegExp(regexPattern, regexFlags);
    } catch {
      newErrors.regexPattern = 'Invalid regex pattern';
    }

    // matchContentPattern: if non-empty, must compile (using same regexFlags)
    if (matchContentPattern.trim()) {
      try {
        new RegExp(matchContentPattern, regexFlags);
      } catch {
        newErrors.matchContentPattern = 'Invalid match content pattern';
      }
    }

    // regexFlags: if non-empty, must only contain valid flags
    if (regexFlags.trim()) {
      const validFlags = new Set(['g', 'i', 'm', 's']);
      const chars = regexFlags.trim().split('');
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
    if (matchMessageNumber.trim()) {
      const parsed = Number(matchMessageNumber.trim());
      if (!Number.isInteger(parsed) || parsed < 0) {
        newErrors.matchMessageNumber = 'Must be a non-negative integer';
      }
    }

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

  return (
    <div className="content-rule-form-page">
      <SectionHeader title={title} />

      <vscode-form-container>
        {/* Name */}
        <FormGroup>
          <Label htmlFor="cr-name" required>
            Name
          </Label>
          <Input
            id="cr-name"
            value={name}
            placeholder="My content rule"
            invalid={!!errors.name}
            onChange={(e) => {
              setName(e.target.value);
              clearError('name');
            }}
          />
          <vscode-form-helper>
            A descriptive label for this rule. Must be unique among all content rules.
          </vscode-form-helper>
          {errors.name && <vscode-form-helper severity="error">{errors.name}</vscode-form-helper>}
        </FormGroup>

        {/* Enabled */}
        <FormGroup>
          <Label htmlFor="cr-enabled">Enabled</Label>
          <vscode-checkbox
            id="cr-enabled"
            checked={enabled}
            label="Enabled"
            name="enabled"
            onClick={() => setEnabled(!enabled)}
          />
          <vscode-form-helper>
            When enabled, this rule will be applied to matching messages during chat completion.
          </vscode-form-helper>
        </FormGroup>

        {/* Regex Pattern */}
        <FormGroup>
          <Label htmlFor="cr-regex-pattern" required>
            Regex Pattern
          </Label>
          <Input
            id="cr-regex-pattern"
            value={regexPattern}
            placeholder="<skills>[\s\S]*?</skills>"
            invalid={!!errors.regexPattern}
            onChange={(e) => {
              setRegexPattern(e.target.value);
              clearError('regexPattern');
            }}
          />
          <vscode-form-helper>
            Regular expression to find content in messages. Use <code>$1</code>, <code>$2</code>,
            etc. in the substitution to reference captured groups.
          </vscode-form-helper>
          {errors.regexPattern && (
            <vscode-form-helper severity="error">{errors.regexPattern}</vscode-form-helper>
          )}
        </FormGroup>

        {/* Substitution */}
        <FormGroup>
          <Label htmlFor="cr-substitution">Substitution</Label>
          <Input
            id="cr-substitution"
            value={substitution}
            placeholder="replacement text"
            onChange={(e) => setSubstitution(e.target.value)}
          />
          <vscode-form-helper>
            Replacement text for matched content. Leave empty to remove matched text. Use{' '}
            <code>$1</code>, <code>$2</code> to insert captured groups from the regex pattern.
          </vscode-form-helper>
        </FormGroup>

        {/* Advanced Settings */}
        <vscode-collapsible title="Advanced Settings">
          {/* Match Role */}
          <FormGroup>
            <Label htmlFor="cr-match-role">Match Role</Label>
            <vscode-single-select
              id="cr-match-role"
              name="matchRole"
              value={matchRole}
              onchange={(e: Event) => setMatchRole((e.target as HTMLSelectElement).value)}
            >
              <vscode-option value="all">all</vscode-option>
              <vscode-option value="system">system</vscode-option>
              <vscode-option value="user">user</vscode-option>
            </vscode-single-select>
            <vscode-form-helper>
              Only apply this rule to messages with a specific role. <strong>all</strong> matches
              every message regardless of role.
            </vscode-form-helper>
          </FormGroup>

          {/* Match Message Number */}
          <FormGroup>
            <Label htmlFor="cr-match-msg-num">Match Message Number</Label>
            <Input
              id="cr-match-msg-num"
              value={matchMessageNumber}
              placeholder="e.g. 0 for the first message"
              type="text"
              invalid={!!errors.matchMessageNumber}
              onChange={(e) => {
                setMatchMessageNumber(e.target.value);
                clearError('matchMessageNumber');
              }}
            />
            <vscode-form-helper>
              Zero-based index of the message to match. Leave empty to match all messages in the
              conversation.
            </vscode-form-helper>
            {errors.matchMessageNumber && (
              <vscode-form-helper severity="error">{errors.matchMessageNumber}</vscode-form-helper>
            )}
          </FormGroup>

          {/* Match Model Pattern */}
          <FormGroup>
            <Label htmlFor="cr-match-model">Match Model Pattern</Label>
            <Input
              id="cr-match-model"
              value={matchModelPattern}
              placeholder="gpt-4*"
              onChange={(e) => setMatchModelPattern(e.target.value)}
            />
            <vscode-form-helper>
              Glob pattern to match against the model ID (e.g. <code>gpt-4*</code>). Leave empty to
              match any model.
            </vscode-form-helper>
          </FormGroup>

          {/* Match Content Pattern */}
          <FormGroup>
            <Label htmlFor="cr-match-content">Match Content Pattern</Label>
            <Input
              id="cr-match-content"
              value={matchContentPattern}
              placeholder="regex pattern"
              invalid={!!errors.matchContentPattern}
              onChange={(e) => {
                setMatchContentPattern(e.target.value);
                clearError('matchContentPattern');
              }}
            />
            <vscode-form-helper>
              Regular expression to match against message content. The rule is only applied when the
              content matches this pattern. Uses the same Regex Flags as the find-replace pattern.
              Leave empty to match any content.
            </vscode-form-helper>
            {errors.matchContentPattern && (
              <vscode-form-helper severity="error">{errors.matchContentPattern}</vscode-form-helper>
            )}
          </FormGroup>

          {/* Match Tools Present */}
          <FormGroup>
            <Label htmlFor="cr-tools-present">Match Tools Present</Label>
            <Input
              id="cr-tools-present"
              value={matchToolPresent}
              placeholder="search, code_interpreter"
              onChange={(e) => setMatchToolPresent(e.target.value)}
            />
            <vscode-form-helper>
              Comma-separated list of tool names that must ALL be present in the message. Leave
              empty to skip this filter.
            </vscode-form-helper>
          </FormGroup>

          {/* Match Tools Absent */}
          <FormGroup>
            <Label htmlFor="cr-tools-absent">Match Tools Absent</Label>
            <Input
              id="cr-tools-absent"
              value={matchToolAbsent}
              placeholder="memory"
              onChange={(e) => setMatchToolAbsent(e.target.value)}
            />
            <vscode-form-helper>
              Comma-separated list of tool names that must ALL be absent from the message. Leave
              empty to skip this filter.
            </vscode-form-helper>
          </FormGroup>

          {/* Regex Flags */}
          <FormGroup>
            <Label htmlFor="cr-regex-flags">Regex Flags</Label>
            <Input
              id="cr-regex-flags"
              value={regexFlags}
              placeholder="gm"
              invalid={!!errors.regexFlags}
              onChange={(e) => {
                setRegexFlags(e.target.value);
                clearError('regexFlags');
              }}
            />
            <vscode-form-helper>
              JavaScript regex flags for the Regex Pattern. Default is <code>gm</code> (global,
              multiline). Allowed flags: <code>g</code>, <code>i</code>, <code>m</code>,{' '}
              <code>s</code>.
            </vscode-form-helper>
            {errors.regexFlags && (
              <vscode-form-helper severity="error">{errors.regexFlags}</vscode-form-helper>
            )}
          </FormGroup>
        </vscode-collapsible>
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
