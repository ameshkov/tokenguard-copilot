import { useEffect, useRef, type ReactNode } from 'react';

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
  /**
   * CSS grid column widths passed to the `columns` attribute
   * of `<vscode-table>`. Each entry defines the width of
   * the corresponding column (e.g., `"auto"`, `"120px"`,
   * `"50%"`).
   */
  columnWidths?: string[];
}

/**
 * A data table rendered with `<vscode-table>` web components
 * from the VSCode Elements library.
 *
 * @param props - Table props.
 * @returns The table element.
 */
export function Table<T>(props: TableProps<T>): React.JSX.Element {
  const { columns, rows, rowKey, className, columnWidths } = props;
  const tableRef = useRef<HTMLElement | null>(null);

  // `<vscode-table>`'s `columns` property is typed as `string[]`.
  // React 19 assigns custom-element string props to the property
  // (not the attribute), so passing a JSON string via JSX results
  // in the Lit setter rejecting the value and falling back to
  // `[]`. We bypass JSX and assign the array on the underlying
  // element directly through a ref.
  //
  // Additionally, `<vscode-table>`'s `_getCellsOfFirstRow()` caches
  // cell references on the first call and never invalidates them.
  // After React re-renders body rows (e.g. on reorder), the cached
  // cells are stale and detached from the DOM, so the Lit element
  // applies column widths to the wrong elements. To work around
  // this we also set `style.width` on every body cell directly so
  // they are sized correctly after React re-renders.
  useEffect(() => {
    const el = tableRef.current as unknown as { columns?: string[] } | null;
    if (!el) {
      return;
    }
    el.columns = columnWidths ?? [];
    // Use requestAnimationFrame so the Lit element has finished its
    // internal rendering ecycle before we patch the body cell widths.
    const raf = requestAnimationFrame(() => {
      if (!columnWidths || columnWidths.length === 0) {
        return;
      }
      const tableRows = tableRef.current?.querySelectorAll('vscode-table-row');
      if (!tableRows) {
        return;
      }
      tableRows.forEach((row) => {
        const cells = row.querySelectorAll('vscode-table-cell');
        cells.forEach((cell, i) => {
          const w = columnWidths[i];
          if (w !== undefined) {
            (cell as HTMLElement).style.width = w === 'auto' ? '' : w;
          }
        });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [columnWidths, rows]);

  return (
    <vscode-table ref={tableRef} bordered-rows className={className}>
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
