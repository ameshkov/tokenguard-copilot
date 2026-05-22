import type { HTMLAttributes, ReactNode } from 'react';

/** Props for the {@link Badge} component. */
export interface BadgeProps extends HTMLAttributes<HTMLElement> {
  /** Badge content. */
  children?: ReactNode;
}

/**
 * A small badge/pill element styled to match the VS Code
 * design language.
 *
 * Renders a `<vscode-badge>` web component from the
 * VSCode Elements library.
 *
 * @param props - Standard HTML attributes.
 * @returns The badge element.
 */
export function Badge(props: BadgeProps): React.JSX.Element {
  const { className, children, ...rest } = props;
  return (
    <vscode-badge className={className} {...rest}>
      {children}
    </vscode-badge>
  );
}
