import { marked } from 'marked';
import type { Tokens } from 'marked';
import { replaceRange } from '../editing/formatting';
import type { TextEdit } from '../editing/formatting';

export type TableAlignment = 'left' | 'center' | 'right' | null;

export interface MarkdownTable {
  cells: string[][];
  alignments: TableAlignment[];
}

export interface LocatedTable {
  table: MarkdownTable;
  start: number;
  end: number;
}

/** Creates a rectangular table whose row count includes the header. */
export function createTable(columns: number, rows: number): MarkdownTable {
  const cells: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const values: string[] = [];
    for (let column = 0; column < columns; column++) values.push(row === 0 ? `Header ${column + 1}` : '');
    cells.push(values);
  }
  return { cells, alignments: Array<TableAlignment>(columns).fill(null) };
}

/** Copies parsed cell source so inline Markdown remains editable. */
function tableFromToken(token: Tokens.Table): MarkdownTable {
  const cells = [token.header, ...token.rows].map(
    /** Extracts cell Markdown without rendering it to HTML. */
    (row) => row.map(/** Reads the Markdown source of a single cell. */ (cell) => cell.text),
  );
  return { cells, alignments: [...token.align] };
}

/** Finds a top-level GFM table containing the current caret or selection. */
export function findTable(text: string, start: number, end = start): LocatedTable | undefined {
  let offset = 0;
  for (const token of marked.lexer(text, { gfm: true })) {
    const contentEnd = offset + token.raw.trimEnd().length;
    if (token.type === 'table' && start >= offset && start <= contentEnd && end <= contentEnd) {
      return { table: tableFromToken(token as Tokens.Table), start: offset, end: contentEnd };
    }
    offset += token.raw.length;
  }
  return undefined;
}

/** Escapes literal pipes and flattens line breaks to keep cells in one Markdown row. */
function serializeRow(cells: string[]): string {
  const values = cells.map(/** Makes a cell safe for pipe-delimited Markdown. */ (cell) => cell.replace(/\|/g, '\\|').replace(/\r?\n/g, ' '));
  return `| ${values.join(' | ')} |`;
}

/** Encodes a preserved column alignment in the table delimiter row. */
function alignmentMarker(alignment: TableAlignment): string {
  const markers = { left: ':---', center: ':---:', right: '---:' };
  return alignment === null ? '---' : markers[alignment];
}

/** Serializes the header, alignment delimiter, and body into a GFM table. */
export function serializeTable(table: MarkdownTable): string {
  const rows = table.cells.map(serializeRow);
  rows.splice(1, 0, serializeRow(table.alignments.map(alignmentMarker)));
  return rows.join('\n');
}

/** Inserts a standalone table without consuming selected document content. */
export function insertTable(text: string, position: number, table: MarkdownTable): TextEdit {
  const before = text.slice(0, position);
  const after = text.slice(position);
  const prefix = before.length === 0 || before.endsWith('\n\n') ? '' : '\n\n';
  const suffix = after.startsWith('\n\n') ? '' : '\n\n';
  const markdown = serializeTable(table);
  const edit = replaceRange(text, position, position, prefix + markdown + suffix);
  return { ...edit, start: position + prefix.length, end: position + prefix.length + markdown.length };
}
