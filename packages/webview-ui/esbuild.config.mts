/// <reference types="node" />
import * as esbuild from 'esbuild';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

const watch = process.argv.includes('--watch');

const codiconsPkg = resolve('node_modules/@vscode/codicons');

const buildOptions: esbuild.BuildOptions = {
  entryPoints: { 'settings-app': 'src/index.tsx' },
  bundle: true,
  outdir: '../../out/webview',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  minify: !watch,
  jsx: 'automatic',
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching webview for changes...');
} else {
  await esbuild.build(buildOptions);
  // Copy Codicon files alongside the webview bundle
  cpSync(`${codiconsPkg}/dist/codicon.css`, '../../out/webview/codicon.css', {
    force: true,
  });
  cpSync(`${codiconsPkg}/dist/codicon.ttf`, '../../out/webview/codicon.ttf', {
    force: true,
  });
  console.log('Copied Codicon CSS and font files to out/webview/');
}
