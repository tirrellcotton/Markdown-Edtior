import type { LocatedTable, MarkdownTable } from './tables';

export interface TableCellPosition {
  row: number;
  column: number;
}

export type TableScope = 'table' | 'column' | 'row' | 'cell';

/** Finds table separators while treating escaped pipes as cell content. */
function pipePositions(line: string): number[] {
  const positions: number[] = [];
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') {
      escaped = !escaped;
      continue;
    }
    if (line[index] === '|' && !escaped) positions.push(index);
    escaped = false;
  }
  return positions;
}

/** Maps a source caret to its logical table cell, treating the delimiter as the header. */
export function locateTableCell(text: string, located: LocatedTable, caret: number): TableCellPosition {
  const preceding = text.slice(located.start, caret);
  const lineIndex = preceding.split('\n').length - 1;
  const lineStart = preceding.lastIndexOf('\n') + 1;
  const line = text.slice(located.start + lineStart).split('\n')[0];
  const position = preceding.length - lineStart;
  const pipes = pipePositions(line);
  const leading = pipes.length > 0 && line.slice(0, pipes[0]).trim() === '' ? 1 : 0;
  const before = pipes.filter(/** Counts delimiters before the source caret. */ (pipe) => pipe < position).length;
  const column = Math.max(0, Math.min(located.table.alignments.length - 1, before - leading));
  const row = Math.max(0, Math.min(located.table.cells.length - 1, lineIndex > 1 ? lineIndex - 1 : 0));
  return { row, column };
}

/** Inserts an empty column adjacent to the active cell, preserving existing alignments. */
export function insertColumn(table: MarkdownTable, column: number): void {
  table.alignments.splice(column, 0, null);
  for (const row of table.cells) row.splice(column, 0, '');
}

/** Inserts an empty row at the requested position, including above the header. */
export function insertRow(table: MarkdownTable, row: number): void {
  table.cells.splice(row, 0, Array<string>(table.alignments.length).fill(''));
}

/** Removes a column and reports whether a valid table remains. */
export function deleteColumn(table: MarkdownTable, column: number): boolean {
  table.alignments.splice(column, 1);
  for (const row of table.cells) row.splice(column, 1);
  return table.alignments.length > 0;
}

/** Removes a row, promoting the next row to the header when needed. */
export function deleteRow(table: MarkdownTable, row: number): boolean {
  table.cells.splice(row, 1);
  return table.cells.length > 0;
}
