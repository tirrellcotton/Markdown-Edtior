import { element } from '../dom';
import { renderPreview } from './preview';

export interface MarkdownContent {
  markdown: string;
  plainText: string;
  html: string;
}

const paragraphTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
const blockTags = new Set(['DIV', 'SECTION', 'ARTICLE', 'LI', 'UL', 'OL', 'TABLE']);

/** Extracts readable text from child nodes while keeping semantic block separators. */
function childrenText(node: Node): string {
  return [...node.childNodes].map(plainTextNode).join('');
}

/** Removes markup while preserving paragraphs, table columns, code whitespace, and image descriptions. */
function plainTextNode(node: Node): string {
  if (node instanceof Text) return /^\s*\n\s*$/.test(node.data) ? '' : node.data;
  if (!(node instanceof HTMLElement)) return childrenText(node);
  if (node instanceof HTMLImageElement) return node.alt;
  if (node.tagName === 'BR') return '\n';
  if (node.tagName === 'PRE') return (node.textContent ?? '') + '\n';
  const text = childrenText(node);
  if (node.tagName === 'TD' || node.tagName === 'TH') return text + '\t';
  if (node.tagName === 'TR') return text.replace(/\t$/, '') + '\n';
  if (paragraphTags.has(node.tagName)) return text + '\n\n';
  return blockTags.has(node.tagName) ? text + '\n' : text;
}

/** Creates all three representations from the same current Markdown snapshot. */
export function getEditorContent(root: HTMLElement): MarkdownContent {
  const markdown = element('[data-editor-element="markdown-source"]', HTMLTextAreaElement, root).value;
  const rendered = document.createElement('div');
  renderPreview(rendered, markdown);
  const plainText = childrenText(rendered).replace(/^\n+|\n+$/g, '');
  return { markdown, plainText, html: rendered.innerHTML };
}
