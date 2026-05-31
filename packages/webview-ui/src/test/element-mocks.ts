/**
 * Mock custom element registrations for the jsdom test
 * environment.
 *
 * Lit-based VSCode Elements web components do not render their
 * Shadow DOM in jsdom. These lightweight mocks provide the
 * minimum behaviour needed for testing-library queries
 * (roles, form associations) without pulling in Lit.
 *
 * @internal Exported for tests only; not part of the public
 * module API.
 */

/* ── helpers ───────────────────────────────────────────── */

function defineMock(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) {
    customElements.define(tag, ctor);
  }
}

/* ── mock elements ─────────────────────────────────────── */

class MockButton extends HTMLElement {
  /** @internal */
  connectedCallback(): void {
    this.setAttribute('role', 'button');
  }

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  set disabled(v: boolean) {
    if (v) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }
}

class MockCheckbox extends HTMLElement {
  private _checked = false;

  /** @internal */
  connectedCallback(): void {
    this.setAttribute('role', 'checkbox');
    const label = this.getAttribute('label');
    if (label) {
      this.setAttribute('aria-label', label);
    }
    this.addEventListener('click', () => {
      if (this.disabled) return;
      this._checked = !this._checked;
      this.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  get checked(): boolean {
    return this._checked;
  }

  set checked(v: boolean) {
    this._checked = v;
  }

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  set disabled(v: boolean) {
    if (v) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }
}

/**
 * Mock textfield that renders a native `<input>` inside so
 * that `userEvent.type()` and `getByLabelText()` work in
 * jsdom.
 */
class MockTextfield extends HTMLElement {
  private _input: HTMLInputElement = document.createElement('input');

  /** @internal */
  connectedCallback(): void {
    this._syncToInput();
    this.appendChild(this._input);
  }

  private _syncToInput(): void {
    // Move the host id to the inner input for label
    // association.
    const id = super.id;
    if (id) {
      this._input.id = id;
      this.removeAttribute('id');
    }
    const type = this.getAttribute('type');
    if (type) this._input.type = type;
    const placeholder = this.getAttribute('placeholder');
    if (placeholder) this._input.placeholder = placeholder;
    const step = this.getAttribute('step');
    if (step) this._input.step = step;
    if (this.hasAttribute('disabled')) this._input.disabled = true;
    const ariaLabel = this.getAttribute('aria-label');
    if (ariaLabel) this._input.setAttribute('aria-label', ariaLabel);
  }

  get value(): string {
    return this._input.value;
  }

  set value(v: string) {
    this._input.value = v;
  }

  get disabled(): boolean {
    return this._input.disabled;
  }

  set disabled(v: boolean) {
    this._input.disabled = v;
  }

  set type(v: string) {
    this._input.type = v;
  }

  get type(): string {
    return this._input.type;
  }

  set placeholder(v: string) {
    this._input.placeholder = v;
  }

  get placeholder(): string {
    return this._input.placeholder;
  }

  set step(v: string) {
    this._input.step = v;
  }

  /** Used by vscode-label to set accessible name. */
  set label(v: string) {
    this._input.setAttribute('aria-label', v);
  }

  override set id(v: string) {
    this._input.id = v;
  }

  override get id(): string {
    return this._input.id;
  }
}

/**
 * Mock label that renders a native `<label>` inside so
 * that `getByLabelText()` works via standard label
 * association in jsdom.
 */
class MockLabel extends HTMLElement {
  private _label: HTMLLabelElement = document.createElement('label');

  /** @internal */
  connectedCallback(): void {
    // Move child nodes (text content) into the inner label.
    while (this.firstChild) {
      this._label.appendChild(this.firstChild);
    }
    this.appendChild(this._label);

    const forAttr = this.getAttribute('for');
    if (forAttr) {
      this._label.htmlFor = forAttr;
    }
  }

  set htmlFor(v: string) {
    this.setAttribute('for', v);
    this._label.htmlFor = v;
  }

  get htmlFor(): string {
    return this._label.htmlFor;
  }
}

class MockProgressRing extends HTMLElement {
  /** @internal */
  connectedCallback(): void {
    this.setAttribute('role', 'progressbar');
  }
}

/* ── generic (no special behaviour) ────────────────────── */

class MockGeneric extends HTMLElement {}

/* ── registration ──────────────────────────────────────── */

/**
 * Registers lightweight mock custom elements so that
 * testing-library can find them via roles and properties
 * in a jsdom environment.
 */
export function registerMockElements(): void {
  defineMock('vscode-button', MockButton);
  defineMock(
    'vscode-checkbox',
    // Each call to defineMock needs a unique class.
    MockCheckbox,
  );
  defineMock('vscode-textfield', MockTextfield);
  defineMock('vscode-label', MockLabel);
  defineMock('vscode-progress-ring', MockProgressRing);

  const generics = [
    'vscode-badge',
    'vscode-collapsible',
    'vscode-divider',
    'vscode-form-container',
    'vscode-form-group',
    'vscode-form-helper',
    'vscode-icon',
    'vscode-option',
    'vscode-single-select',
    'vscode-table',
    'vscode-table-header',
    'vscode-table-header-cell',
    'vscode-table-body',
    'vscode-table-row',
    'vscode-table-cell',
  ] as const;

  for (const tag of generics) {
    // Each tag needs its own class to avoid
    // "already defined" errors.
    defineMock(tag, class extends MockGeneric {});
  }
}
