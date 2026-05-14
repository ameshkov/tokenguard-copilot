import { SectionHeader } from './components/index.js';

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
          <select disabled aria-label="Period">
            <option>Last 7d</option>
          </select>
          <select disabled aria-label="Providers">
            <option>All Providers</option>
          </select>
          <select disabled aria-label="Models">
            <option>All Models</option>
          </select>
        </div>
        <div className="usage-stats-chart-placeholder">
          <p>No usage data available</p>
        </div>
      </div>
    </div>
  );
}
