import type { ReactNode } from 'react';

/** Column definition for the {@link Table} component. */
export interface TableColumn<T> {
  /** Column header label. */
  header: string;
  /**
   * Renders the cell content for a row.
   *
   * @param row - The data item.
   * @returns Cell content.
   */
  render: (row: T) => ReactNode;
}

/** Props for the {@link Table} component. */
export interface TableProps<T> {
  /** Column definitions. */
  columns: TableColumn<T>[];
  /** Data rows. */
  rows: T[];
  /**
   * Unique key extractor for rows.
   *
   * @param row - The data item.
   * @returns A unique string key.
   */
  rowKey: (row: T) => string;
  /** CSS class name. */
  className?: string;
}

/**
 * A data table rendered with `<vscode-table>` web components
 * from the VSCode Elements library.
 *
 * @param props - Table props.
 * @returns The table element.
 */
export function Table<T>(props: TableProps<T>): React.JSX.Element {
  const { columns, rows, rowKey, className } = props;

  return (
    <vscode-table bordered-rows className={className}>
      <vscode-table-header slot="header">
        {columns.map((col) => (
          <vscode-table-header-cell key={col.header}>{col.header}</vscode-table-header-cell>
        ))}
      </vscode-table-header>
      <vscode-table-body slot="body">
        {rows.map((row) => (
          <vscode-table-row key={rowKey(row)}>
            {columns.map((col) => (
              <vscode-table-cell key={col.header}>{col.render(row)}</vscode-table-cell>
            ))}
          </vscode-table-row>
        ))}
      </vscode-table-body>
    </vscode-table>
  );
}
