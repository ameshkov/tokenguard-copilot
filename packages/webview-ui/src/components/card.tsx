import type { HTMLAttributes } from 'react';

/**
 * A card container styled to match the VS Code design language.
 *
 * Provides a subtle bordered surface for grouping related content.
 *
 * @param props - Standard div HTML attributes.
 * @returns The card element.
 */
export function Card(props: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const { className, ...rest } = props;
  const cls = `vscode-card${className ? ` ${className}` : ''}`;
  return <div className={cls} {...rest} />;
}
