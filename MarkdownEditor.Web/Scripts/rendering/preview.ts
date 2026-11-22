import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { highlightCodeBlocks } from './code-highlighting';

/** Renders GitHub-flavored Markdown and removes executable HTML and unsafe URLs. */
export function renderPreview(preview: HTMLElement, markdown: string): void {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false });
  preview.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'iframe'],
    FORBID_ATTR: ['style'],
    SANITIZE_NAMED_PROPS: true,
  });
  for (const link of preview.querySelectorAll('a')) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  highlightCodeBlocks(preview);
  preview.classList.toggle('editor__preview--empty', markdown.trim().length === 0);
}
