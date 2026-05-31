/**
 * JSX type declarations for VSCode Elements custom element
 * tags used in the webview UI.
 *
 * React 19 supports custom elements natively. Props present
 * on the element instance are set as properties; the rest are
 * set as attributes. Custom events use `onEventName` syntax
 * without further modification.
 *
 * @see https://vscode-elements.github.io/guides/framework-integrations/react/
 */

import type { HTMLAttributes, DetailedHTMLProps } from 'react';

type BaseProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'vscode-button': BaseProps & {
        secondary?: boolean;
        disabled?: boolean;
        icon?: string;
        'icon-after'?: string;
        block?: boolean;
        type?: 'button' | 'submit' | 'reset';
        onclick?: (event: Event) => void;
      };
      'vscode-badge': BaseProps & {
        variant?: 'counter' | 'activity-bar-counter';
      };
      'vscode-checkbox': BaseProps & {
        checked?: boolean;
        disabled?: boolean;
        label?: string;
        name?: string;
        value?: string;
        autofocus?: boolean;
        defaultChecked?: boolean;
        onchange?: (event: Event) => void;
      };
      'vscode-collapsible': BaseProps & {
        title?: string;
        description?: string;
        open?: boolean;
      };
      'vscode-divider': BaseProps & {
        role?: string;
      };
      'vscode-form-container': BaseProps;
      'vscode-form-group': BaseProps & {
        variant?: 'horizontal' | 'vertical';
      };
      'vscode-form-helper': BaseProps & {
        severity?: 'error' | 'warning' | 'info';
      };
      'vscode-icon': BaseProps & {
        name?: string;
        spin?: boolean;
        'spin-duration'?: number;
      };
      'vscode-label': BaseProps & {
        for?: string;
        htmlFor?: string;
        required?: boolean;
      };
      'vscode-textfield': BaseProps & {
        value?: string;
        defaultValue?: string;
        type?: string;
        name?: string;
        placeholder?: string;
        disabled?: boolean;
        readonly?: boolean;
        required?: boolean;
        autofocus?: boolean;
        invalid?: boolean;
        min?: number;
        max?: number;
        minLength?: number;
        maxLength?: number;
        step?: number | string;
        pattern?: string;
        multiple?: boolean;
        label?: string;
        onInput?: React.EventHandler<React.SyntheticEvent<HTMLElement>>;
      };
      'vscode-option': BaseProps & {
        value?: string;
        disabled?: boolean;
        selected?: boolean;
        description?: string;
      };
      'vscode-progress-ring': BaseProps;
      'vscode-single-select': BaseProps & {
        disabled?: boolean;
        name?: string;
        value?: string;
        onchange?: (event: Event) => void;
      };
      'vscode-table': BaseProps & {
        'bordered-rows'?: boolean;
        'columns-hidden'?: string;
        /**
         * Initial column widths. Set as a property (array) via
         * a ref — passing via JSX does not work in React 19 due
         * to property/attribute reflection mismatch in Lit.
         */
        columns?: string[];
        'min-column-width'?: number;
        resizable?: boolean;
        'delayed-resizing'?: boolean;
        responsive?: boolean;
        breakpoint?: number;
        zebra?: boolean;
        'bordered-columns'?: boolean;
        'zebra-odd'?: boolean;
      };
      'vscode-table-header': BaseProps;
      'vscode-table-header-cell': BaseProps;
      'vscode-table-body': BaseProps;
      'vscode-table-row': BaseProps;
      'vscode-table-cell': BaseProps;
    }
  }
}

export {};
