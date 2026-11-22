import { MarkdownEditor } from './markdown-editor';
export { getEditorContent } from './rendering/document-content';
export { submitEditorContent } from './persistence/editor-api';
export type { MarkdownContent } from './rendering/document-content';
export type { MarkdownReceipt } from './persistence/editor-api';

const initializedEditors = new WeakSet<HTMLElement>();

/** Initializes each rendered partial once, including dynamically inserted partials. */
export function initializeMarkdownEditors(container: ParentNode = document): void {
  const roots = [...container.querySelectorAll<HTMLElement>('[data-markdown-editor]')];
  if (container instanceof HTMLElement && container.matches('[data-markdown-editor]')) roots.unshift(container);
  for (const root of roots) {
    if (initializedEditors.has(root)) continue;
    new MarkdownEditor(root);
    initializedEditors.add(root);
  }
}

initializeMarkdownEditors();
