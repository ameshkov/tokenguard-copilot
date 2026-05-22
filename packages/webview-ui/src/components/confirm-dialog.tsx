import { Button } from './button.js';

/** Props for the {@link ConfirmDialog} component. */
export interface ConfirmDialogProps {
  /** The confirmation message to display. */
  message: string;
  /** Label for the confirm button. */
  confirmLabel: string;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /**
   * Called when the user cancels.
   *
   * When `undefined`, the cancel button is hidden (e.g.
   * during a loading state).
   */
  onCancel?: () => void;
  /** Whether a loading operation is in progress. */
  loading?: boolean;
}

/**
 * An inline confirmation dialog with confirm/cancel buttons.
 *
 * When `loading` is `true` the confirm button is disabled,
 * a progress ring is shown, and the cancel button is hidden.
 *
 * @param props - Dialog props.
 * @returns The dialog element.
 */
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element {
  const { message, confirmLabel, onConfirm, onCancel, loading } = props;

  return (
    <div className="confirm-dialog">
      <p className="confirm-dialog__message">{message}</p>
      <div className="confirm-dialog__actions">
        <Button
          variant="secondary"
          onClick={onConfirm}
          className="confirm-dialog__confirm"
          disabled={loading}
        >
          {confirmLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {loading && <vscode-progress-ring />}
      </div>
    </div>
  );
}
