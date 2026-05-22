# UI Plan

The settings panel is a single-page React webview rendered inside
a VS Code webview panel. It uses VS Code CSS custom properties
for theming.

Max content width: 600px, centered horizontally.

## Navigation

The webview uses a `Page` discriminated union as a simple
client-side router. The root `SettingsApp` component holds a
single `page` state that determines which full-page view to
render. Each page type corresponds to a distinct screen:

- `settings` — main settings page (providers table, models
  table, usage stats, global actions).
- `addProvider` — full-page add-provider form.
- `editProvider` — full-page edit-provider form.
- `selectProvider` — provider selector (add-model flow,
  step 1).
- `selectModel` — model selector (add-model flow, step 2).
- `configureModel` — model configuration form (add-model
  flow, step 3).
- `editModel` — full-page edit-model form.

All flow state (loading, errors, fetched data) lives in
`SettingsApp`. Page components are stateless with respect
to navigation — they receive data via props and signal
transitions via callbacks.

## Layout

```text
┌──────────────────────────────────────────────┐
│  TokenGuard Copilot Settings                 │
│  Manage providers, models, and usage.        │
├──────────────────────────────────────────────┤
│                                              │
│  ── Providers ─────────────────────────────  │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ Name         Base URL       Actions  │    │
│  ├──────────────────────────────────────┤    │
│  │ OpenRouter   https://…      [Edit]   │    │
│  │                             [Remove] │    │
│  │ DeepSeek     https://…      [Edit]   │    │
│  │                             [Remove] │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [+ Add Provider]                            │
│                                              │
│  ── Models ────────────────────────────────  │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ Model        Provider    Actions     │    │
│  ├──────────────────────────────────────┤    │
│  │ kimi-k2.6    OpenRouter  [Edit]      │    │
│  │                          [Remove]    │    │
│  │ deepseek-r1  DeepSeek    [Edit]      │    │
│  │                          [Remove]    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [+ Add Model]                               │
│                                              │
│  ── Usage Stats ───────────────────────────  │
│                                              │
│  (chart + filters + summary — see below)     │
│                                              │
│  ──────────────────────────────────────────  │
│                                              │
│  [Reset Statistics]  [Reset All Settings]    │
│                                              │
└──────────────────────────────────────────────┘
```

## Sections

### 1. Header

- Title: **TokenGuard Copilot Settings**
- Subtitle: short description of the extension.

### 2. Providers

A table listing all configured (non-removed) providers.

| Column | Content |
| --- | --- |
| Name | Provider display name |
| Base URL | Provider base URL (truncated if long) |
| Actions | **Edit** and **Remove** buttons |

Below the table: **Add Provider** button.

#### Add / Edit Provider Page

Clicking **Add Provider** or **Edit** navigates to a
full-page form that replaces the settings page entirely.
The page has its own title and subtitle.

- **Title**: "Add Provider" or "Edit Provider".
- **Subtitle**: short description of the action.

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| Name | text | yes | Unique among non-removed providers |
| Base URL | text | yes | OpenAI-compatible endpoint |
| API Key | password | yes | Stored in SecretStorage |

Buttons:

- **Add Provider** / **Save** — submits the form.
- **Cancel** — shows a confirmation dialog ("Discard
  changes and go back to settings?") before navigating
  back to the settings page.

- **Add flow**: on submit, the extension calls
  `{baseUrl}/models` to validate the endpoint. A loading
  spinner is shown on the button. On success the provider is
  saved and the user returns to the settings page. On failure
  an inline error is shown with the entered values preserved.
- **Edit flow**: same form, pre-filled with current values.
  API Key field shows a placeholder ("unchanged") and only
  updates SecretStorage if the user types a new value.

### 3. Models

A table listing all configured (non-removed) models across
all providers.

| Column | Content |
| --- | --- |
| Model | Display name (or `provider/model-id`) |
| Provider | Provider name |
| Actions | **Edit** and **Remove** buttons |

Below the table: **Add Model** button.

#### Add Model Flow

Each step in the add-model flow takes the full page,
replacing the settings view entirely. Each page has its
own title ("Add Model") and subtitle.

1. User clicks **Add Model** — navigates to a full-page
   provider selector ("Select a provider to fetch
   available models from.").
2. After selecting a provider, navigates to a full-page
   model selector ("Select a model to configure.") where
   the extension fetches `{baseUrl}/models` and shows a
   selection list of available models.
3. After selecting a model the configuration page opens.

A **Cancel** button on each step returns to the settings
page.

#### Model Configuration Page

Shown as a full page when adding or editing a model.
The **Cancel** button shows a confirmation dialog
("Discard changes and go back to settings?") before
navigating back. Two sections: basic (always visible) and
advanced (collapsed by default).

**Basic parameters:**

| Field | Type | Required | Default source |
| --- | --- | --- | --- |
| Display name | text | no | `name` from response |
| Max context window tokens | number | yes | response / defaults |
| Max prompt tokens | number | yes | response / defaults |

**Advanced parameters** (collapsed):

*Reasoning section:*

| Field | Type | Default |
| --- | --- | --- |
| Supports reasoning effort | toggle | false |
| Supported reasoning efforts | multi-select | from response |
| Default reasoning effort | select | from response |
| Preserve reasoning | toggle | false |

*Capabilities section:*

| Field | Type | Default |
| --- | --- | --- |
| Streaming | toggle | true |
| Vision | toggle | false |

*Sampling section:*

| Field | Type | Range |
| --- | --- | --- |
| Temperature | number | 0–2 (optional) |
| Top P | number | 0–1 (optional) |
| Frequency penalty | number | -2 to 2 (optional) |
| Presence penalty | number | -2 to 2 (optional) |

*Cost section:*

| Field | Type | Notes |
| --- | --- | --- |
| Input cost (per 1M tokens) | number | optional |
| Output cost (per 1M tokens) | number | optional |
| Cached input cost (per 1M tokens) | number | optional |

Pre-fill notices:

- Fields filled from the `/models` response show:
  *"Pre-filled from provider. Changing this is not
  recommended."*
- Fields filled from bundled defaults show: *"Pre-filled
  from known model data. If incorrect, contribute
  corrections to the repository."*

When editing an existing model, persisted values are shown
(no re-fetch from the provider or defaults).

### 4. Usage Stats

Displayed below the models section. Contains a chart,
filters, and a summary.

**Filters** (row of controls above the chart):

| Filter | Type | Options |
| --- | --- | --- |
| Period | select | Today, Last 24h, Last 7d, Last 30d, All |
| Providers | multi-select | All providers (incl. removed) |
| Models | multi-select | Models for selected providers |

**Chart**: bar chart of daily token usage. Each bar is
segmented by token type (input, output, cached, reasoning).
Hover shows exact counts and estimated cost.

**Summary** (below the chart):

- Input tokens, output tokens, cached tokens, estimated cost.
- Cost breakdown per model when multiple models are selected.

### 5. Global Actions

A row of destructive action buttons at the bottom of the
page, visually separated from the rest.

| Button | Style | Action |
| --- | --- | --- |
| Reset Statistics | secondary | Clears `usage_records` rows |
| Reset All Settings | secondary/danger | Clears entire DB + SecretStorage |

Both show a confirmation dialog before executing.

**Reset Statistics** offers scope options: reset all,
per-provider, or per-model.

**Reset All Settings** warns that all providers, models, and
usage data will be permanently deleted.

## Component Inventory

Reusable VS Code-themed primitives (already exist):

- `Button` (primary / secondary variants)
- `Input` (text input with error display)
- `Label`
- `FormGroup` (label + input container)
- `Card` (bordered container)
- `Badge` (pill tag)

New components needed:

- `Table` — simple table with header row and action column.
- `Dialog` — inline expandable form / modal card for
  add/edit flows.
- `Toggle` — on/off switch for boolean fields.
- `Select` / `MultiSelect` — dropdown controls.
- `Chart` — bar chart for usage stats (likely a lightweight
  charting library or canvas-based).
- `Tooltip` — hover info for chart segments.
- `ConfirmDialog` — confirmation prompt for destructive
  actions.
