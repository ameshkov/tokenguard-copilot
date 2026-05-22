import type { HTMLAttributes, ReactNode } from 'react';

/** Props for the {@link Button} component. */
export interface ButtonProps extends HTMLAttributes<HTMLElement> {
  /**
   * Visual variant of the button.
   *
   * - `"primary"` — filled background (default).
   * - `"secondary"` — outlined / subdued style.
   */
  variant?: 'primary' | 'secondary';
  /** Whether the button is disabled. */
  disabled?: boolean;
  /**
   * HTML button type forwarded to the web component.
   * Defaults to `"button"`.
   */
  type?: 'button' | 'submit' | 'reset';
  /** Button content. */
  children?: ReactNode;
}

/**
 * A button styled to match the VS Code design language.
 *
 * Renders a `<vscode-button>` web component from the
 * VSCode Elements library.
 *
 * @param props - Standard button props plus an optional
 *   `variant`.
 * @returns The button element.
 */
export function Button(props: ButtonProps): React.JSX.Element {
  const { variant = 'primary', className, type, children, onClick, ...rest } = props;

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    onClick?.(e);
    if (type === 'submit' && !e.defaultPrevented) {
      const form = (e.target as HTMLElement).closest('form');
      form?.requestSubmit();
    }
  };

  return (
    <vscode-button
      secondary={variant === 'secondary' || undefined}
      className={className}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </vscode-button>
  );
}
