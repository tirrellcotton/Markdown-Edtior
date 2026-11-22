export interface TextEdit {
  text: string;
  start: number;
  end: number;
}

/** Replaces a selected range and selects the inserted content. */
export function replaceRange(text: string, start: number, end: number, inserted: string): TextEdit {
  return { text: text.slice(0, start) + inserted + text.slice(end), start, end: start + inserted.length };
}

/** Adds or removes matching inline Markdown delimiters around a selection. */
export function wrapSelection(text: string, start: number, end: number, marker: string, placeholder: string): TextEdit {
  const selected = text.slice(start, end);
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    return replaceRange(text, start, end, selected.slice(marker.length, -marker.length));
  }
  if (text.slice(start - marker.length, start) === marker && text.slice(end, end + marker.length) === marker) {
    return replaceRange(text, start - marker.length, end + marker.length, selected);
  }
  const content = selected || placeholder;
  const edit = replaceRange(text, start, end, marker + content + marker);
  return { ...edit, start: start + marker.length, end: start + marker.length + content.length };
}

/** Applies a line transformation to every line touched by the selection. */
export function transformLines(text: string, start: number, end: number, transform: (line: string, index: number) => string): TextEdit {
  const first = text.slice(0, start).lastIndexOf('\n') + 1;
  const lastSelected = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const nextBreak = text.indexOf('\n', lastSelected);
  const last = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(first, last).split('\n').map(transform).join('\n');
  return replaceRange(text, first, last, lines);
}

/** Replaces an existing Markdown heading prefix with the requested level. */
export function headingLine(line: string, level: number): string {
  const content = line.replace(/^#{1,6}\s+/, '');
  return level === 0 ? content : `${'#'.repeat(level)} ${content}`;
}

/** Converts a line into the requested list or quote style. */
export function prefixedLine(line: string, prefix: string): string {
  return prefix + line.replace(/^(?:[-*+] \[[ xX]\] |[-*+] |\d+\. |> )/, '');
}

/** Builds safe Markdown link syntax while preserving literal label characters. */
export function linkMarkdown(label: string, address: string): string {
  const escaped = label.replace(/[\\\[\]]/g, '\\$&');
  const url = address.replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `[${escaped || url}](${url})`;
}
