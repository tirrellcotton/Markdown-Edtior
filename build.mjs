import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const webRoot = 'src/MarkdownEditor.Web/wwwroot';
await mkdir(`${webRoot}/js`, { recursive: true });
await mkdir(`${webRoot}/lib/bootstrap-icons`, { recursive: true });
await build({
  entryPoints: ['src/MarkdownEditor.Web/Scripts/editor.ts'],
  bundle: true,
  outfile: `${webRoot}/js/editor.js`,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
});
await cp('node_modules/bootstrap-icons/font/bootstrap-icons.css', `${webRoot}/lib/bootstrap-icons/bootstrap-icons.css`);
await cp('node_modules/bootstrap-icons/font/fonts', `${webRoot}/lib/bootstrap-icons/fonts`, { recursive: true });
await cp('node_modules/bootstrap-icons/LICENSE', `${webRoot}/lib/bootstrap-icons/LICENSE`);
await rm(`${webRoot}/lib/bootstrap-icons/bootstrap-icons.ts`, { force: true });
