import type { HTMLAttributes } from 'react';

/**
 * A small badge/pill element styled to match the VS Code design
 * language.
 *
 * @param props - Standard span HTML attributes.
 * @returns The badge element.
 */
export function Badge(props: HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  const { className, ...rest } = props;
  const cls = `vscode-badge${className ? ` ${className}` : ''}`;
  return <span className={cls} {...rest} />;
}
