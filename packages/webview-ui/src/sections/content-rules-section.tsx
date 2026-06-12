import { useState, useEffect, useCallback } from 'react';

import type {
  ContentRuleInfo,
  GetContentRulesResponse,
  UpdateContentRuleResponse,
  DeleteContentRuleResponse,
  ReorderContentRulesResponse,
} from '@tokenguard/shared';
import { sendRequest } from '../vscode-api.js';
import { Button, ConfirmDialog, SectionHeader, Table } from '../components/index.js';
import type { TableColumn } from '../components/table.js';

/**
 * Props for the content rules list section.
 */
export interface ContentRulesSectionProps {
  /** Called when the user clicks "Add Rule". */
  onAdd: () => void;
  /** Called when the user clicks "Edit" on a rule.
   *  @param rule - The rule to edit. */
  onEdit: (rule: ContentRuleInfo) => void;
}

/**
 * Parameters for {@link buildColumns}.
 */
interface BuildColumnsParams {
  rules: ContentRuleInfo[];
  deleting: boolean;
  reordering: boolean;
  onToggle: (rule: ContentRuleInfo) => void;
  onReorder: (ruleId: string, direction: 'up' | 'down') => void;
  onEdit: (rule: ContentRuleInfo) => void;
  onDelete: (ruleId: string) => void;
}

/**
 * Builds the table column definitions for the content rules list.
 *
 * @param params - The data and callbacks needed to render columns.
 * @returns An array of {@link TableColumn} definitions.
 */
function buildColumns(params: BuildColumnsParams): TableColumn<ContentRuleInfo>[] {
  const { rules, deleting, reordering, onToggle, onReorder, onEdit, onDelete } = params;
  return [
    {
      header: 'Enabled',
      render: (rule) => (
        <vscode-checkbox
          checked={rule.enabled}
          label=""
          aria-label={rule.enabled ? `Disable ${rule.name}` : `Enable ${rule.name}`}
          onClick={() => void onToggle(rule)}
        />
      ),
    },
    {
      header: 'Name',
      render: (rule) => (
        <span className={rule.enabled ? '' : 'content-rules-section__disabled'}>{rule.name}</span>
      ),
    },
    {
      header: 'Actions',
      render: (rule) => (
        <span className="content-rules-section__actions">
          <Button
            variant="secondary"
            onClick={() => onEdit(rule)}
            disabled={deleting || reordering}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            onClick={() => onDelete(rule.id)}
            disabled={deleting || reordering}
          >
            Remove
          </Button>
        </span>
      ),
    },
    {
      header: 'Order',
      render: (rule) => {
        const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
        const index = sorted.findIndex((r) => r.id === rule.id);
        const isFirst = index === 0;
        const isLast = index === sorted.length - 1;
        return (
          <span className="content-rules-section__reorder">
            <Button
              variant="secondary"
              disabled={isFirst || reordering}
              aria-label="Move up"
              onClick={() => void onReorder(rule.id, 'up')}
            >
              ↑
            </Button>
            <Button
              variant="secondary"
              disabled={isLast || reordering}
              aria-label="Move down"
              onClick={() => void onReorder(rule.id, 'down')}
            >
              ↓
            </Button>
          </span>
        );
      },
    },
  ];
}

/**
 * Displays a table of content rules with toggle, reorder, edit,
 * and remove actions.
 *
 * Fetches rules on mount via `getContentRules` and dispatches
 * `updateContentRule`, `deleteContentRule`, and
 * `reorderContentRules` for user actions.
 *
 * @returns The content rules section element.
 */
export function ContentRulesSection(props: ContentRulesSectionProps): React.JSX.Element {
  const { onAdd, onEdit } = props;
  const [rules, setRules] = useState<ContentRuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  /** Fetch all rules, ordered by sortOrder. */
  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sendRequest<GetContentRulesResponse>({ type: 'getContentRules' });
      setRules(response.rules);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  /** Toggle the enabled state and dispatch updateContentRule. */
  const handleToggle = async (rule: ContentRuleInfo) => {
    const newEnabled = !rule.enabled;
    // Optimistic update
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: newEnabled } : r)));
    try {
      const response = await sendRequest<UpdateContentRuleResponse>({
        type: 'updateContentRule',
        id: rule.id,
        params: { enabled: newEnabled },
      });
      if (!response.success) {
        // Revert on failure
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)),
        );
        setError(response.error ?? 'Toggle failed');
      }
    } catch {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      setError('Toggle failed');
    }
  };

  /** Move a rule up or down in the ordered list. */
  const handleReorder = async (ruleId: string, direction: 'up' | 'down') => {
    if (reordering) return;
    const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((r) => r.id === ruleId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sorted.length - 1) return;

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    // Swap in the sorted array
    [sorted[index], sorted[swapIndex]] = [sorted[swapIndex]!, sorted[index]!];
    const orderedIds = sorted.map((r) => r.id);

    setReordering(true);
    // Optimistic update: update sortOrder on all rules
    const reordered = sorted.map((r, i) => ({ ...r, sortOrder: i }));
    setRules(reordered);

    try {
      const response = await sendRequest<ReorderContentRulesResponse>({
        type: 'reorderContentRules',
        orderedIds,
      });
      if (!response.success) {
        setError(response.error ?? 'Reorder failed');
        await fetchRules();
      } else if (response.rules) {
        setRules(response.rules);
      }
    } catch {
      setError('Reorder failed');
      await fetchRules();
    } finally {
      setReordering(false);
    }
  };

  /** Confirm and execute rule deletion. */
  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const response = await sendRequest<DeleteContentRuleResponse>({
        type: 'deleteContentRule',
        id: confirmDeleteId,
      });
      if (response.success) {
        setRules((prev) => prev.filter((r) => r.id !== confirmDeleteId));
      } else {
        setError(response.error ?? 'Delete failed');
      }
    } catch {
      setError('Delete failed');
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="content-rules-section">
        <SectionHeader title="Content Rules" />
        <vscode-progress-ring />
      </div>
    );
  }

  const columns = buildColumns({
    rules,
    deleting,
    reordering,
    onToggle: (rule) => void handleToggle(rule),
    onReorder: (ruleId, direction) => void handleReorder(ruleId, direction),
    onEdit,
    onDelete: setConfirmDeleteId,
  });

  return (
    <div className="content-rules-section">
      <SectionHeader title="Content Rules" />
      <p>
        Define regex-based transformations applied to system and user messages before they reach the
        language model. Enable debugging below and inspect the logs to see the actual messages sent
        to the LLM — this will help you determine which rules are needed.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {rules.length === 0 ? (
        <p className="content-rules-section__empty">
          No content rules configured. Add a rule to start transforming messages.
        </p>
      ) : (
        <Table
          className="content-rules-section"
          columnWidths={['80px', 'auto', '160px', '100px']}
          columns={columns}
          rows={rules}
          rowKey={(r) => r.id}
        />
      )}
      <Button onClick={onAdd} disabled={deleting || reordering}>
        Add Rule
      </Button>
      {confirmDeleteId && (
        <ConfirmDialog
          message={`Permanently delete this content rule? This action cannot be undone.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete Rule'}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={deleting ? undefined : () => setConfirmDeleteId(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}
