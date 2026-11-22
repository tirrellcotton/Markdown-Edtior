import { element } from './dom';
import { loadDraft, saveDraft } from './draft';
import { headingLine, linkMarkdown, prefixedLine, replaceRange, transformLines, wrapSelection } from './formatting';
import type { TextEdit } from './formatting';
import { EditorHistory } from './history';
import { renderPreview } from './preview';
import { TableTools } from './table-tools';
import { submissionError, submitEditorContent } from './editor-api';
import { insertCodeBlock, populateCodeLanguages } from './code-blocks';

export class MarkdownEditor {
  private readonly source: HTMLTextAreaElement;
  private readonly preview: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly heading: HTMLSelectElement;
  private readonly fileInput: HTMLInputElement;
  private readonly dialog: HTMLDialogElement;
  private readonly linkText: HTMLInputElement;
  private readonly linkUrl: HTMLInputElement;
  private readonly toolbar: HTMLDivElement;
  private readonly history: EditorHistory;
  private readonly tableTools: TableTools;
  private readonly storageKey: string;
  private linkSelection = { start: 0, end: 0 };
  private fileName = 'untitled.md';

  /** Initializes one reusable editor with independent controls and undo history. */
  constructor(private readonly root: HTMLElement) {
    this.source = this.find('[data-editor-element="markdown-source"]', HTMLTextAreaElement);
    this.preview = this.find('[data-editor-element="markdown-preview"]', HTMLDivElement);
    this.status = this.find('[data-editor-element="editor-message"]', HTMLSpanElement);
    this.heading = this.find('[data-editor-element="heading"]', HTMLSelectElement);
    this.fileInput = this.find('[data-editor-element="open-file"]', HTMLInputElement);
    this.dialog = this.find('[data-editor-element="link-dialog"]', HTMLDialogElement);
    this.linkText = this.find('[data-editor-element="link-text"]', HTMLInputElement);
    this.linkUrl = this.find('[data-editor-element="link-url"]', HTMLInputElement);
    this.toolbar = this.find('.toolbar', HTMLDivElement);
    this.storageKey = root.dataset.storageKey ?? 'markdown-editor.draft.v1';
    this.source.value = loadDraft(this.storageKey);
    this.history = new EditorHistory(this.snapshot());
    this.tableTools = new TableTools(root, this.source, this.applyEdit.bind(this));
    populateCodeLanguages(this.find('[data-editor-element="code-language"]', HTMLSelectElement));
    this.bindEvents();
    this.refresh();
  }

  /** Finds a required control within this partial instance. */
  private find<T extends Element>(selector: string, type: { new (): T }): T {
    return element(selector, type, this.root);
  }

  /** Reads the document and caret into a history snapshot. */
  private snapshot(): TextEdit {
    return { text: this.source.value, start: this.source.selectionStart, end: this.source.selectionEnd };
  }

  /** Updates document statistics and the heading selector for the current line. */
  private updateSelection(): void {
    const preceding = this.source.value.slice(0, this.source.selectionStart);
    const line = preceding.split('\n').length;
    const column = preceding.length - preceding.lastIndexOf('\n');
    this.find('[data-editor-element="cursor-position"]', HTMLSpanElement).textContent = `Ln ${line}, Col ${column}`;
    const lineStart = preceding.lastIndexOf('\n') + 1;
    const match = this.source.value.slice(lineStart).match(/^(#{1,6})\s/);
    this.heading.value = String(match?.[1].length ?? 0);
    this.history.rememberSelection(this.snapshot());
  }

  /** Refreshes the live preview, status, and undo controls after a document change. */
  private refresh(): void {
    renderPreview(this.preview, this.source.value);
    const words = this.source.value.trim().match(/\S+/g)?.length ?? 0;
    this.find('[data-editor-element="word-count"]', HTMLSpanElement).textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
    this.find('[data-editor-element="character-count"]', HTMLSpanElement).textContent = `${this.source.value.length} characters`;
    this.setStatus(saveDraft(this.source.value, this.storageKey) ? '' : 'Draft storage unavailable · download to save');
    this.find('[data-command="undo"]', HTMLButtonElement).disabled = !this.history.canMove(-1);
    this.find('[data-command="redo"]', HTMLButtonElement).disabled = !this.history.canMove(1);
    this.updateSelection();
  }

  /** Shows request feedback or document errors while keeping background saves silent. */
  private setStatus(message: string, isError = true): void {
    this.status.textContent = message;
    this.status.hidden = message.length === 0;
    this.status.classList.toggle('editor__message--error', isError);
  }

  /** Sends one immutable document snapshot and prevents duplicate toolbar submissions. */
  private async submit(): Promise<void> {
    const button = this.find('[data-command="send"]', HTMLButtonElement);
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const sentMarkdown = this.source.value;
    this.setStatus('Sending document…', false);
    try {
      const receipt = await submitEditorContent(this.root);
      this.setStatus(this.source.value === sentMarkdown ? 'Document sent.' : 'Previous version sent; current edits remain local.', false);
      this.root.dispatchEvent(new CustomEvent('markdown-editor:submitted', { bubbles: true, detail: receipt }));
    } catch (error) {
      this.setStatus(submissionError(error));
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  /** Applies an edit as one undoable operation and returns focus to the document. */
  private applyEdit(edit: TextEdit): void {
    this.history.rememberSelection(this.snapshot());
    this.source.value = edit.text;
    this.source.focus();
    this.source.setSelectionRange(edit.start, edit.end);
    this.history.record(this.snapshot());
    this.refresh();
  }

  /** Adds inline formatting to the current selection or a useful placeholder. */
  private wrap(marker: string, placeholder: string): void {
    this.applyEdit(wrapSelection(this.source.value, this.source.selectionStart, this.source.selectionEnd, marker, placeholder));
  }

  /** Transforms complete selected lines as a single undoable operation. */
  private lines(transform: (line: string, index: number) => string): void {
    this.applyEdit(transformLines(this.source.value, this.source.selectionStart, this.source.selectionEnd, transform));
  }

  /** Inserts a standalone Markdown fragment separated from adjacent paragraphs. */
  private insertBlock(content: string): void {
    const { text, start, end } = this.snapshot();
    const before = start === 0 ? '' : '\n\n';
    this.applyEdit(replaceRange(text, start, end, before + content + '\n\n'));
  }

  /** Opens the native modal link form while preserving the document selection. */
  private openLink(): void {
    this.linkSelection = { start: this.source.selectionStart, end: this.source.selectionEnd };
    this.linkText.value = this.source.value.slice(this.linkSelection.start, this.linkSelection.end);
    this.linkUrl.value = '';
    this.linkUrl.setCustomValidity('');
    this.dialog.showModal();
    this.linkUrl.focus();
  }

  /** Closes the link dialog and restores the original editor selection. */
  private closeLink(): void {
    this.dialog.close();
    this.source.focus();
    this.source.setSelectionRange(this.linkSelection.start, this.linkSelection.end);
  }

  /** Inserts a validated HTTP link without allowing executable URL protocols. */
  private submitLink(event: SubmitEvent): void {
    event.preventDefault();
    const address = this.linkUrl.value.trim();
    if (!/^https?:\/\//i.test(address)) {
      this.linkUrl.setCustomValidity('Enter an http:// or https:// address.');
      this.linkUrl.reportValidity();
      return;
    }
    const markdown = linkMarkdown(this.linkText.value.trim(), address);
    this.closeLink();
    this.applyEdit(replaceRange(this.source.value, this.linkSelection.start, this.linkSelection.end, markdown));
  }

  /** Downloads the document as a UTF-8 Markdown file. */
  private download(): void {
    const blob = new Blob([this.source.value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.fileName;
    anchor.click();
    // Release the object URL after the browser has started the download.
    setTimeout(/** Releases the completed download's temporary URL. */ function releaseDownload() { URL.revokeObjectURL(url); }, 1000);
  }

  /** Loads a text file locally after checking size and confirming replacement. */
  private async openFile(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file) return;
    if (file.size > 1_048_576) {
      this.setStatus('Choose a Markdown file smaller than 1 MB.');
      return;
    }
    try {
      const text = await file.text();
      if (this.source.value && !window.confirm('Replace the current document? You can undo this change.')) return;
      this.fileName = file.name.replace(/\.[^.]+$/, '') + '.md';
      this.applyEdit({ text: text.replace(/\r\n?/g, '\n'), start: 0, end: 0 });
    } catch {
      this.setStatus('Could not open this file. Please try again.');
    }
  }

  /** Restores a previous or subsequent document state. */
  private moveHistory(direction: number): void {
    this.history.rememberSelection(this.snapshot());
    const previous = this.history.move(direction);
    this.source.value = previous.text;
    this.source.focus();
    this.source.setSelectionRange(previous.start, previous.end);
    this.refresh();
  }

  /** Dispatches toolbar formatting commands to focused editing helpers. */
  private runCommand(command: string): void {
    const actions: Record<string, () => void> = {
      /** Applies strong emphasis. */
      bold: () => this.wrap('**', 'bold text'),
      /** Applies emphasis. */
      italic: () => this.wrap('*', 'italic text'),
      /** Applies strikethrough. */
      strike: () => this.wrap('~~', 'strikethrough text'),
      /** Applies inline code. */
      code: () => this.wrap('`', 'code'),
      /** Adds bullets to selected lines. */
      bullet: () => this.lines(/** Converts a selected line to a bullet. */ (line) => prefixedLine(line, '- ')),
      /** Numbers selected lines in order. */
      numbered: () => this.lines(/** Converts a selected line to a numbered item. */ (line, index) => prefixedLine(line, `${index + 1}. `)),
      /** Adds task checkboxes to selected lines. */
      task: () => this.lines(/** Converts a selected line to a task. */ (line) => prefixedLine(line, '- [ ] ')),
      /** Quotes selected lines. */
      quote: () => this.lines(/** Converts a selected line to a quote. */ (line) => prefixedLine(line, '> ')),
      /** Inserts a thematic break. */
      rule: () => this.insertBlock('---'),
      link: this.openLink.bind(this),
      /** Opens the table size picker and existing table editor. */
      table: () => this.tableTools.toggle(),
      download: this.download.bind(this),
      send: this.submit.bind(this),
      /** Opens the Markdown file picker. */
      open: () => this.fileInput.click(),
      /** Reverts the latest edit. */
      undo: () => this.moveHistory(-1),
      /** Restores a reverted edit. */
      redo: () => this.moveHistory(1),
    };
    actions[command]?.();
  }

  /** Routes toolbar clicks using each button's command name. */
  private onToolbarClick(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-command]');
    if (button?.dataset.command) this.runCommand(button.dataset.command);
  }

  /** Applies the selected heading level to the active document lines. */
  private onHeadingChange(): void {
    const level = Number(this.heading.value);
    this.lines(/** Sets the requested heading level on one selected line. */ (line) => headingLine(line, level));
  }

  /** Inserts the chosen language's fenced block around selected code or a placeholder. */
  private onCodeLanguageChange(): void {
    const select = this.find('[data-editor-element="code-language"]', HTMLSelectElement);
    const language = select.value;
    if (!language) return;
    select.value = '';
    this.applyEdit(insertCodeBlock(this.source.value, this.source.selectionStart, this.source.selectionEnd, language));
  }

  /** Records typed text and immediately refreshes the preview. */
  private onInput(): void {
    this.history.record(this.snapshot());
    this.refresh();
  }

  /** Handles editor shortcuts consistently across Windows and macOS. */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const shortcuts: Record<string, string> = { b: 'bold', i: 'italic', k: 'link', s: 'download', y: 'redo', z: event.shiftKey ? 'redo' : 'undo' };
    const command = shortcuts[key];
    if (!command) return;
    event.preventDefault();
    this.runCommand(command);
  }

  /** Maps native browser undo requests to the editor's complete text history. */
  private onBeforeInput(event: InputEvent): void {
    if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
    event.preventDefault();
    this.moveHistory(event.inputType === 'historyUndo' ? -1 : 1);
  }

  /** Clears custom URL errors when the address is edited. */
  private clearUrlError(): void {
    this.linkUrl.setCustomValidity('');
  }

  /** Restores focus when Escape dismisses the link dialog. */
  private onDialogCancel(event: Event): void {
    event.preventDefault();
    this.closeLink();
  }

  /** Connects input handlers to this partial's controls only. */
  private bindEvents(): void {
    this.toolbar.addEventListener('click', this.onToolbarClick.bind(this));
    this.heading.addEventListener('change', this.onHeadingChange.bind(this));
    this.find('[data-editor-element="code-language"]', HTMLSelectElement).addEventListener('change', this.onCodeLanguageChange.bind(this));
    this.source.addEventListener('input', this.onInput.bind(this));
    this.source.addEventListener('beforeinput', this.onBeforeInput.bind(this));
    this.source.addEventListener('keydown', this.onKeyDown.bind(this));
    this.source.addEventListener('keyup', this.updateSelection.bind(this));
    this.source.addEventListener('click', this.updateSelection.bind(this));
    this.source.addEventListener('select', this.updateSelection.bind(this));
    this.fileInput.addEventListener('change', this.openFile.bind(this));
    this.find('[data-editor-element="link-form"]', HTMLFormElement).addEventListener('submit', this.submitLink.bind(this));
    this.find('[data-editor-element="link-cancel"]', HTMLButtonElement).addEventListener('click', this.closeLink.bind(this));
    this.linkUrl.addEventListener('input', this.clearUrlError.bind(this));
    this.dialog.addEventListener('cancel', this.onDialogCancel.bind(this));
  }
}
