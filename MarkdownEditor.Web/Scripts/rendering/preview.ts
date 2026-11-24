import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { highlightCodeBlocks } from './code-highlighting';
import { renderDiagrams } from './diagrams';

/** Renders GitHub-flavored Markdown and removes executable HTML and unsafe URLs. */
export function renderPreview(preview: HTMLElement, markdown: string, readOnly = false): void {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false });
  preview.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'iframe'],
    FORBID_ATTR: ['style', 'contenteditable'],
    SANITIZE_NAMED_PROPS: true,
  });
  for (const link of preview.querySelectorAll('a')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  highlightCodeBlocks(preview);
  if (readOnly) disableControls(preview);
  preview.classList.toggle('editor__preview--empty', markdown.trim().length === 0);
  if (preview.isConnected) renderDiagrams(preview);
}

/** Prevents embedded HTML controls from changing a read-only document. */
function disableControls(container: HTMLElement): void {
  for (const control of container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input, button, select, textarea')) {
    control.disabled = true;
  }
}
