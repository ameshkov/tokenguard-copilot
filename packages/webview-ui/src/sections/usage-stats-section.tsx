import { SectionHeader } from '../components/index.js';

/**
 * Stub section for Usage Statistics.
 *
 * Renders a section header with disabled filter controls
 * matching the final layout.
 *
 * @returns The usage stats section element.
 */
export function UsageStatsSection(): React.JSX.Element {
  return (
    <div className="usage-stats-section">
      <SectionHeader title="Usage Stats" />
      <div className="usage-stats-placeholder">
        <div className="usage-stats-filters" aria-disabled>
          <vscode-single-select disabled aria-label="Period">
            <vscode-option>Last 7d</vscode-option>
          </vscode-single-select>
          <vscode-single-select disabled aria-label="Providers">
            <vscode-option>All Providers</vscode-option>
          </vscode-single-select>
          <vscode-single-select disabled aria-label="Models">
            <vscode-option>All Models</vscode-option>
          </vscode-single-select>
        </div>
        <div className="usage-stats-chart-placeholder">
          <p>No usage data available</p>
        </div>
      </div>
    </div>
  );
}
