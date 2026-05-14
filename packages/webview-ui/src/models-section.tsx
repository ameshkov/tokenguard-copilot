import { SectionHeader, Table, Button } from './components/index.js';

/**
 * Stub section for the Models table.
 *
 * Renders a section header and a disabled table matching the
 * final layout.
 *
 * @returns The models section element.
 */
export function ModelsSection(): React.JSX.Element {
  return (
    <div className="models-section">
      <SectionHeader title="Models" />
      <Table
        columns={[
          { header: 'Model', render: () => '—' },
          { header: 'Provider', render: () => '—' },
          { header: 'Actions', render: () => '—' },
        ]}
        rows={[]}
        rowKey={() => ''}
      />
      <Button disabled>+ Add Model</Button>
    </div>
  );
}
