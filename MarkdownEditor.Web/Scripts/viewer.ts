import { renderPreview } from './rendering/preview';

const initializedViewers = new WeakSet<HTMLElement>();

/** Renders each server-supplied viewer once, including dynamically inserted partials. */
export function initializeMarkdownViewers(container: ParentNode = document): void {
  const roots = [...container.querySelectorAll<HTMLElement>('[data-markdown-viewer]')];
  if (container instanceof HTMLElement && container.matches('[data-markdown-viewer]')) roots.unshift(container);
  for (const root of roots) {
    if (initializedViewers.has(root)) continue;
    const source = root.querySelector<HTMLTextAreaElement>('[data-viewer-source]');
    if (!source) continue;
    renderPreview(root, source.value, true);
    initializedViewers.add(root);
  }
}

initializeMarkdownViewers();
