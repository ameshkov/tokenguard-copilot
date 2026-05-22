/**
 * JSX type declarations for custom elements used in the
 * webview playground.
 */

import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type BaseProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;

declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'vscode-dev-toolbar': BaseProps;
    }
  }
}

export {};
