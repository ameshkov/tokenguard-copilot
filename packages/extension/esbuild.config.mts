/// <reference types="node" />
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outdir: '../../out',
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching extension for changes...');
} else {
  await esbuild.build(buildOptions);
}
