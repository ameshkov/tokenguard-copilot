/// <reference types="node" />
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const buildOptions: esbuild.BuildOptions = {
  entryPoints: ['src/webview/settings-app.tsx'],
  bundle: true,
  outdir: 'out/webview',
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
}
