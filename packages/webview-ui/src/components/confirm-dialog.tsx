import { Button } from './button.js';

/** Props for the {@link ConfirmDialog} component. */
export interface ConfirmDialogProps {
  /** The confirmation message to display. */
  message: string;
  /** Label for the confirm button. */
  confirmLabel: string;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

/**
 * An inline confirmation dialog with confirm/cancel buttons.
 *
 * @param props - Dialog props.
 * @returns The dialog element.
 */
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element {
  const { message, confirmLabel, onConfirm, onCancel } = props;

  return (
    <div className="confirm-dialog">
      <p className="confirm-dialog__message">{message}</p>
      <div className="confirm-dialog__actions">
        <Button variant="secondary" onClick={onConfirm} className="confirm-dialog__confirm">
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
