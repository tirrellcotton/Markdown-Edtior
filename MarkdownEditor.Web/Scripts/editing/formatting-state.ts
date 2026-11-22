import { marked } from 'marked';
import type { Token, Tokens } from 'marked';

type Format = 'bold' | 'italic' | 'strike';

export interface FormattingRange {
  format: Format;
  start: number;
  end: number;
}

interface MappedSource {
  text: string;
  positions: number[];
}

interface MappedFragment extends MappedSource {
  next: number;
}

/** Maps a parser fragment back to source offsets, including stripped list and quote prefixes. */
function mapFragment(parent: MappedSource, text: string, cursor: number): MappedFragment | undefined {
  const exact = parent.text.indexOf(text, cursor);
  if (exact !== -1) return { text, positions: parent.positions.slice(exact, exact + text.length), next: exact + text.length };
  const positions: number[] = [];
  for (const character of text.split('')) {
    const index = parent.text.indexOf(character, cursor);
    if (index === -1) return undefined;
    positions.push(parent.positions[index]);
    cursor = index + 1;
  }
  return { text, positions, next: cursor };
}

/** Identifies the toolbar command corresponding to a parsed emphasis token. */
function tokenFormat(type: string): Format | undefined {
  const formats: Record<string, Format> = { strong: 'bold', em: 'italic', del: 'strike' };
  return formats[type];
}

/** Records the content boundaries of a parsed formatting span without its delimiters. */
function addRange(token: Token, source: MappedSource, ranges: FormattingRange[]): void {
  const format = tokenFormat(token.type);
  if (!format) return;
  const markerLength = token.raw.startsWith('~~') || token.type === 'strong' ? 2 : 1;
  const start = source.positions[markerLength];
  const end = source.positions[source.positions.length - markerLength - 1] + 1;
  if (start !== undefined && end >= start) ranges.push({ format, start, end });
}

/** Visits table cells in source order while retaining their original document offsets. */
function visitTable(token: Tokens.Table, source: MappedSource, ranges: FormattingRange[]): void {
  let cursor = 0;
  for (const cell of [...token.header, ...token.rows.flat()]) {
    const mapped = mapFragment(source, cell.text, cursor);
    if (!mapped) continue;
    visitTokens(cell.tokens, mapped, ranges);
    cursor = mapped.next;
  }
}

/** Descends into Markdown containers while leaving literal code and HTML untouched. */
function visitChildren(token: Token, source: MappedSource, ranges: FormattingRange[]): void {
  if (token.type === 'table') {
    visitTable(token as Tokens.Table, source, ranges);
    return;
  }
  if (token.type === 'list') {
    visitTokens(token.items, source, ranges);
    return;
  }
  if ('tokens' in token && token.tokens) visitTokens(token.tokens, source, ranges);
}

/** Collects nested emphasis spans using the parser's raw token boundaries. */
function visitTokens(tokens: Token[], source: MappedSource, ranges: FormattingRange[]): void {
  let cursor = 0;
  for (const token of tokens) {
    const mapped = mapFragment(source, token.raw, cursor);
    if (!mapped) continue;
    addRange(token, mapped, ranges);
    visitChildren(token, mapped, ranges);
    cursor = mapped.next;
  }
}

/** Parses formatting spans once per document change using the preview's GFM rules. */
export function formattingRanges(markdown: string): FormattingRange[] {
  const ranges: FormattingRange[] = [];
  const positions = Array.from({ length: markdown.length }, /** Retains UTF-16 offsets used by textarea selections. */ (_, index) => index);
  visitTokens(marked.lexer(markdown, { gfm: true, breaks: false }), { text: markdown, positions }, ranges);
  return ranges;
}

/** Finds styles that contain the caret or the entire selected source range. */
export function activeFormatting(ranges: FormattingRange[], start: number, end: number): Set<Format> {
  const active = new Set<Format>();
  for (const range of ranges) {
    if (start >= range.start && end <= range.end) active.add(range.format);
  }
  return active;
}
