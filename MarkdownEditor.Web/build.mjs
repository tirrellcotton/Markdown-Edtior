import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const webRoot = 'wwwroot';
await mkdir(`${webRoot}/js`, { recursive: true });
await mkdir(`${webRoot}/lib/bootstrap-icons`, { recursive: true });
await build({
  entryPoints: ['Scripts/editor.ts', 'Scripts/viewer.ts'],
  bundle: true,
  outdir: `${webRoot}/js`,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  target: 'es2022',
  minify: true,
  sourcemap: true,
});
await cp('node_modules/bootstrap-icons/font/bootstrap-icons.css', `${webRoot}/lib/bootstrap-icons/bootstrap-icons.css`);
await cp('node_modules/bootstrap-icons/font/fonts', `${webRoot}/lib/bootstrap-icons/fonts`, { recursive: true });
await cp('node_modules/bootstrap-icons/LICENSE', `${webRoot}/lib/bootstrap-icons/LICENSE`);
await rm(`${webRoot}/lib/bootstrap-icons/bootstrap-icons.ts`, { force: true });
