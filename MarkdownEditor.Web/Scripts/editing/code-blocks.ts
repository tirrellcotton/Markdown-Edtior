import { replaceRange } from './formatting';
import type { TextEdit } from './formatting';

export const codeLanguages = [
  { label: 'Plain text', language: 'plaintext' },
  { label: 'Mermaid chart / diagram', language: 'mermaid' },
  { label: 'C#', language: 'csharp' },
  { label: 'TypeScript', language: 'typescript' },
  { label: 'JavaScript', language: 'javascript' },
  { label: 'HTML', language: 'html' },
  { label: 'CSS', language: 'css' },
  { label: 'SCSS', language: 'scss' },
  { label: 'JSON', language: 'json' },
  { label: 'XML', language: 'xml' },
  { label: 'YAML', language: 'yaml' },
  { label: 'SQL', language: 'sql' },
  { label: 'Python', language: 'python' },
  { label: 'Bash / Shell', language: 'bash' },
  { label: 'PowerShell', language: 'powershell' },
  { label: 'C', language: 'c' },
  { label: 'C++', language: 'cpp' },
  { label: 'Java', language: 'java' },
  { label: 'Go', language: 'go' },
  { label: 'Rust', language: 'rust' },
  { label: 'PHP', language: 'php' },
  { label: 'Ruby', language: 'ruby' },
  { label: 'Swift', language: 'swift' },
  { label: 'Kotlin', language: 'kotlin' },
  { label: 'Dart', language: 'dart' },
  { label: 'Dockerfile', language: 'dockerfile' },
  { label: 'INI / TOML', language: 'ini' },
  { label: 'Markdown', language: 'markdown' },
  { label: 'Diff', language: 'diff' },
  { label: 'Visual Basic .NET', language: 'vbnet' },
] as const;

/** Populates a code-language dropdown with the shared list of supported fence tags. */
export function populateCodeLanguages(select: HTMLSelectElement): void {
  for (const entry of codeLanguages) select.add(new Option(entry.label, entry.language));
}

/** Supplies enough newlines to separate a fenced block from adjacent prose. */
function paragraphGap(text: string, adjacentNewlines: RegExp): string {
  if (text.length === 0) return '';
  const existing = text.match(adjacentNewlines)?.[0].length ?? 0;
  return '\n'.repeat(Math.max(0, 2 - existing));
}

/** Chooses a fence longer than any backtick sequence inside the selected code. */
function codeFence(code: string): string {
  let length = 3;
  for (const run of code.match(/`+/g) ?? []) length = Math.max(length, run.length + 1);
  return '`'.repeat(length);
}

/** Inserts a tagged code fence and selects its body for immediate editing. */
export function insertCodeBlock(text: string, start: number, end: number, language: string): TextEdit {
  const body = text.slice(start, end) || 'code here';
  const fence = codeFence(body);
  const prefix = paragraphGap(text.slice(0, start), /\n*$/);
  const after = text.slice(end);
  const suffix = after.length === 0 ? '\n\n' : paragraphGap(after, /^\n*/);
  const opening = prefix + fence + language + '\n';
  const closing = (body.endsWith('\n') ? '' : '\n') + fence + suffix;
  const edit = replaceRange(text, start, end, opening + body + closing);
  return { ...edit, start: start + opening.length, end: start + opening.length + body.length };
}
