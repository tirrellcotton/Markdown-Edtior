import hljs from 'highlight.js/lib/core';
import markdown from 'highlight.js/lib/languages/markdown';
import DOMPurify from 'dompurify';
import type { FormattingRange } from '../editing/formatting-state';

hljs.registerLanguage('markdown', markdown);

/** Adds GFM strikethrough to escaped syntax output without interpreting source as HTML. */
function decorateStrikes(layer: HTMLElement, ranges: FormattingRange[]): void {
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let offset = 0;
  for (const node of nodes) {
    const end = offset + node.length;
    const strikes = ranges.filter(/** Finds strike spans intersecting this syntax text node. */
      (range) => range.format === 'strike' && range.start < end && range.end > offset);
    decorateText(node, offset, strikes);
    offset = end;
  }
}

/** Splits one text node into plain and struck text while preserving every source character. */
function decorateText(node: Text, offset: number, ranges: FormattingRange[]): void {
  if (!ranges.length) return;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(cursor, range.start - offset);
    const end = Math.min(node.length, range.end - offset);
    fragment.append(node.data.slice(cursor, start));
    const span = document.createElement('span');
    span.className = 'editor__syntax--strike';
    span.textContent = node.data.slice(start, end);
    fragment.append(span);
    cursor = end;
  }
  fragment.append(node.data.slice(cursor));
  node.replaceWith(fragment);
}

export class SourceHighlighting {
  private readonly layer = document.createElement('div');
  private readonly backgrounds = document.createElement('div');

  /** Retains the native text input above an inaccessible, noninteractive syntax mirror. */
  constructor(private readonly source: HTMLTextAreaElement) {
    const surface = document.createElement('div');
    surface.className = 'editor__source-surface';
    this.backgrounds.className = 'editor__code-backgrounds';
    this.backgrounds.setAttribute('aria-hidden', 'true');
    this.layer.className = 'editor__syntax';
    this.layer.setAttribute('aria-hidden', 'true');
    source.before(surface);
    surface.append(this.backgrounds, this.layer, source);
    source.classList.add('editor__source--highlighted');
    source.addEventListener('scroll', this.sync.bind(this));
    new ResizeObserver(this.sync.bind(this)).observe(source);
  }

  /** Mirrors parsed source with sanitized spans, including a final blank caret line. */
  render(ranges: FormattingRange[]): void {
    this.layer.innerHTML = DOMPurify.sanitize(hljs.highlight(this.source.value, { language: 'markdown' }).value);
    decorateStrikes(this.layer, ranges);
    this.layer.append('\n');
    this.sync();
  }

  /** Matches the input's wrapping width, responsive padding, and scroll offsets. */
  private sync(): void {
    const style = getComputedStyle(this.source);
    this.layer.style.width = `${this.source.clientWidth}px`;
    this.layer.style.height = `${this.source.clientHeight}px`;
    this.layer.style.padding = style.padding;
    this.layer.style.fontSize = style.fontSize;
    this.layer.scrollTop = this.source.scrollTop;
    this.layer.scrollLeft = this.source.scrollLeft;
    this.paintCodeBlocks();
  }

  /** Paints full-width fence backgrounds without changing text wrapping or caret geometry. */
  private paintCodeBlocks(): void {
    this.backgrounds.replaceChildren();
    const surfaceTop = this.backgrounds.getBoundingClientRect().top;
    const lineHeight = parseFloat(getComputedStyle(this.source).lineHeight);
    for (const code of this.layer.querySelectorAll<HTMLElement>('.hljs-code')) {
      if (!/^ {0,3}(?:`{3,}|~{3,})/.test(code.textContent ?? '')) continue;
      code.classList.add('editor__syntax--fenced');
      const rects = code.getClientRects();
      if (!rects.length) continue;
      const first = rects[0];
      const last = rects[rects.length - 1];
      const background = document.createElement('div');
      background.className = 'editor__code-background';
      background.style.top = `${first.top - surfaceTop - (lineHeight - first.height) / 2}px`;
      background.style.height = `${last.top - first.top + lineHeight}px`;
      this.backgrounds.append(background);
    }
  }
}
