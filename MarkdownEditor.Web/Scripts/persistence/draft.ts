const storageKey = 'markdown-editor.draft.v1';

export const welcomeMarkdown = `# A little space for your ideas

Turn a blank page into something **worth sharing**.

Write Markdown on the left. Watch it come to life on the right.

## Make it your own

- Capture an idea
- Give it a little structure
- Share what you create

> Good writing starts with a single line.

Try **bold**, *italic*, or a [link](https://www.markdownguide.org).

### A few things to try

- [x] Open your new workspace
- [ ] Write something great
- [ ] Download your Markdown

\`\`\`typescript
const idea = "Start here.";
\`\`\`
`;

/** Restores a browser-local draft, including a deliberately empty document. */
export function loadDraft(key = storageKey): string {
  try {
    return localStorage.getItem(key) ?? welcomeMarkdown;
  } catch {
    return welcomeMarkdown;
  }
}

/** Saves a draft locally and reports storage restrictions without interrupting editing. */
export function saveDraft(markdown: string, key = storageKey): boolean {
  try {
    localStorage.setItem(key, markdown);
    return true;
  } catch {
    return false;
  }
}
