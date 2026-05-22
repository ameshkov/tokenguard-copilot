import type { HTMLAttributes, ReactNode } from 'react';

/** Props for the {@link Label} component. */
export interface LabelProps extends HTMLAttributes<HTMLElement> {
  /**
   * Associates the label with a form control by ID.
   * Maps to the `for` attribute on `<vscode-label>`.
   */
  htmlFor?: string;
  /** Whether to show a required indicator. */
  required?: boolean;
  /** Label content. */
  children?: ReactNode;
}

/**
 * A label styled to match the VS Code design language.
 *
 * Renders a `<vscode-label>` web component from the
 * VSCode Elements library with automatic form control
 * association via the `htmlFor` prop.
 *
 * @param props - Label props including `htmlFor` for
 *   form association.
 * @returns The label element.
 */
export function Label(props: LabelProps): React.JSX.Element {
  const { htmlFor, children, ...rest } = props;
  return (
    <vscode-label for={htmlFor} {...rest}>
      {children}
    </vscode-label>
  );
}
